/**
 * ============================================================
 *  Bubbly - IPC 通道注册
 * ============================================================
 *  保留原 main.js 头部注释中的 IPC 通道清单（enter-pet-mode /
 *  leave-pet-mode / show-pet-context-menu / context-menu-items /
 *  drag-move / set-window-size / show-input-window /
 *  input-window-send / input-window-close）。
 * ============================================================
 */

const { app, BrowserWindow, ipcMain, Menu, screen } = require('electron');
const path = require('path');
const S = require('./state');
const {
  updateMousePenetration,
  positionInputWindow,
  cleanupInputWindow,
  INPUT_W,
  INPUT_H,
  INPUT_GAP
} = require('./windows');

function registerIpcHandlers() {
  ipcMain.on('enter-pet-mode', () => {
    if (!S.mainWindow) return;
    S.petMode = true;
    updateMousePenetration();
    // 窗口尺寸由渲染器在 applyScale 里通过 set-window-size 通知
    console.log('[MAIN] enter-pet-mode');
  });

  ipcMain.on('leave-pet-mode', () => {
    if (!S.mainWindow) return;
    S.petMode = false;
    updateMousePenetration();
    console.log('[MAIN] leave-pet-mode');
  });

  ipcMain.on('set-window-size', (event, w, h, petBottom) => {
    if (!S.mainWindow || typeof w !== 'number' || typeof h !== 'number') return;
    // 限制下限，防止渲染器误报 0
    S.winW = Math.max(80, Math.round(w));
    S.winH = Math.max(80, Math.round(h));
    if (typeof petBottom === 'number') S.petBottomOffset = petBottom;
    const bounds = S.mainWindow.getBounds();
    // 以窗口左上角不动，仅缩尺寸：先改大小，再把左上角挪回去对齐桌面坐标
    S.mainWindow.setBounds({
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: S.winW,
      height: S.winH
    });
    // 桌宠尺寸变化后，同步更新悬浮输入窗口位置
    positionInputWindow();
    console.log('[MAIN] set-window-size: ' + S.winW + 'x' + S.winH);
  });

  ipcMain.on('show-pet-context-menu', (event) => {
    // 不再用主进程硬编码模板；改为向渲染进程索取当前菜单模板，
    // 渲染进程根据本地状态（是否勿扰、队列内容）拼装动态菜单，
    // 主进程只负责用 Menu.buildFromTemplate 渲染并执行菜单项点击。
    event.sender.send('context-menu-items');
    console.log('[MAIN] request pet context menu items');
  });

  // 渲染进程上报菜单模板后，主进程用 Menu.buildFromTemplate 构造并弹出
  // 菜单项的 label 支持 richText（用于在菜单中标注 "🌙" 图标），
  // click 通过 label 前缀约定派发 IPC 回渲染进程。
  ipcMain.on('context-menu-items-reply', (event, items) => {
    if (!S.mainWindow || !Array.isArray(items)) return;
    const menuItems = items.map(item => {
      if (item.type) return item;  // separator / 特殊项原样透传
      const out = { label: item.label, enabled: item.enabled !== false };
      if (item.icon) out.icon = item.icon;
      out.click = () => event.sender.send(item.action || '');
      return out;
    });
    const contextMenu = Menu.buildFromTemplate(menuItems);
    contextMenu.popup({ window: S.mainWindow });
    console.log('[MAIN] pet context menu shown, items=' + items.length);
  });

  ipcMain.on('pet-menu-relaunch', () => {
    app.relaunch();
    app.exit(0);
  });

  ipcMain.on('pet-menu-quit', () => app.quit());

  // 桌宠 JS 拖拽：由主进程负责绝对定位，彻底规避反馈循环。
  // 渲染器上报"鼠标按下点的渲染器坐标"(拖拽全程为常量)，
  // 主进程用屏幕坐标(screen.getCursorScreenPoint)减去该常量点，直接得到窗口应处的绝对位置。
  //
  // 关键修复 — 用 setBounds() 同时锁定"位置 + 尺寸"：
  //   在 Windows dpr≠1(如 1.25)下，单纯 setPosition() 会让 Windows 先按物理像素取整再转回 DIP，
  //   每次拖拽都会让窗口尺寸产生 ±1 DIP 的漂移；累积拖拽后窗口会明显变大，
  //   覆盖到本该可点的后方区域（"窗口延展变大、点不到后面"）。
  //   setBounds 在同一调用里固定 width/height，Windows 无机会重算尺寸，彻底消除尺寸漂移。
  //
  // 尺寸来源：渲染器在 applyScale 里算好布局后通过 set-window-size IPC 通知主进程，
  // 主进程用 winW/winH 模块级变量记录，拖拽时直接引用，不读 bounds。
  ipcMain.on('drag-move', (event, clickX, clickY) => {
    if (!S.mainWindow) return;
    if (typeof clickX !== 'number' || typeof clickY !== 'number') return;
    const { x, y } = screen.getCursorScreenPoint();
    S.mainWindow.setBounds({
      x: Math.round(x - clickX),
      y: Math.round(y - clickY),
      width: S.winW,
      height: S.winH
    });
    // 桌宠位置变化后，同步更新悬浮输入窗口位置，保持跟随
    positionInputWindow();
  });

  ipcMain.on('show-input-window', () => {
    if (!S.mainWindow) return;
    // 已有输入窗口：重新跟随定位、聚焦、清空即可（避免重复弹窗）
    if (S.inputWindow && !S.inputWindow.isDestroyed()) {
      try {
        positionInputWindow();
        S.inputWindow.focus();
        S.inputWindow.webContents.send('input-window-clear');
      } catch (_) { /* window in bad state */ }
      return;
    }

    const petBounds = S.mainWindow.getBounds();
    const petBottomY = S.petBottomOffset ? petBounds.y + S.petBottomOffset : petBounds.y + petBounds.height;
    let x = Math.round(petBounds.x + petBounds.width / 2 - INPUT_W / 2);
    let y = Math.round(petBottomY + INPUT_GAP);

    // 校正屏幕边界
    const display = screen.getDisplayNearestPoint({ x: petBounds.x, y: petBounds.y });
    const { bounds } = display;
    x = Math.max(Math.round(bounds.x), Math.min(x, Math.round(bounds.x + bounds.width - INPUT_W)));
    y = Math.min(y, Math.round(bounds.y + bounds.height - INPUT_H));

    S.inputWindow = new BrowserWindow({
      width: INPUT_W,
      height: INPUT_H,
      x,
      y,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      focusable: true,
      hasShadow: true,
      skipTaskbar: true,
      resizable: false,
      show: false,
      backgroundColor: '#00000000',
      parent: S.mainWindow,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, '..', 'preload', 'input-window.js')
      }
    });

    S.inputWindow.on('closed', () => { S.inputWindow = null; });

    const inputUrl = 'file://' + path.join(__dirname, '..', '..', 'input-window.html');
    S.inputWindow.loadURL(inputUrl);
    S.inputWindow.once('ready-to-show', () => {
      positionInputWindow();
      S.inputWindow.show();
      S.inputWindow.focus();
    });
  });

  // 输入窗口发回消息 / 关闭：用 ipcMain.on 而不是 webContents.on('ipc-message')，
  // 因为 ipc-message 的第三个参数是未解包的 args 数组（typeof 为 'object'），
  // 会导致 typeof text === 'string' 判定失败、消息被丢弃。ipcMain.on 的参数按
  // ipcRenderer.send 的原值解包，text 直接拿到字符串。
  ipcMain.on('input-window-send', (event, text) => {
    if (typeof text === 'string' && text.trim() !== '' && S.mainWindow) {
      S.mainWindow.webContents.send('input-window-send-message', text.trim());
    }
    if (S.inputWindow && !S.inputWindow.isDestroyed()) S.inputWindow.close();
  });

  ipcMain.on('input-window-close', () => {
    if (S.inputWindow && !S.inputWindow.isDestroyed()) S.inputWindow.close();
  });
}

module.exports = { registerIpcHandlers };
