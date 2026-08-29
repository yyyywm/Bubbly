/**
 * ============================================================
 *  Bubbly - Electron 主进程
 * ============================================================
 *
 *  核心功能:
 *    1. 创建无边框透明置顶窗口
 *    2. 区域穿透：CSS -webkit-app-region 原生管理
 *    3. 桌宠 JS 拖拽：上报常量按下点 → 主进程用屏幕坐标 setBounds 绝对定位
 *    4. 桌宠右键菜单：Menu.popup({window}) 使用默认光标位置
 *    5. 系统托盘图标
 *    6. 隐藏菜单栏与 Dock 图标
 *
 *  方案说明:
 *    设置面板/气泡/状态灯/提示 → CSS -webkit-app-region: drag 原生拖拽
 *    桌宠区域 → CSS no-drag + JS 拖拽（支持双击和右键）
 *    消息输入 → 独立悬浮输入窗口（input-window.html）
 *
 *  IPC 通信:
 *    - enter-pet-mode          → 进入桌宠模式
 *    - leave-pet-mode          → 返回设置面板
 *    - show-pet-context-menu   → 桌宠右键菜单
 *    - context-menu-items      → 渲染进程上报菜单模板
 *    - drag-move               → 桌宠 JS 拖拽（上报常量按下点）
 *    - set-window-size         → 渲染器通知窗口尺寸
 *    - show-input-window       → 打开独立悬浮输入窗口
 *    - input-window-send       → 输入窗口发回消息
 *    - input-window-close      → 输入窗口关闭
 * ============================================================
 */

const {
  app, BrowserWindow, ipcMain, Menu, Tray,
  nativeImage, screen
} = require('electron');
const path = require('path');
console.log('[MAIN] electron=' + process.versions.electron);

// ============================================================
// 初始化
// ============================================================
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('transparent-window-background', '#00000000');
}

// ============================================================
// 模块级状态
// ============================================================
let mainWindow = null;
let tray = null;
let petMode = false;
// 窗口尺寸由渲染器通过 set-window-size IPC 通知；
// 渲染器算好布局后发新尺寸，主进程只用这个值。
// 这样以后桌宠缩放、加新元素、调气泡位置，主进程无需同步常量。
let winW = 280;
let winH = 340;

// ============================================================
// 鼠标穿透模式切换
// ============================================================
function updateMousePenetration() {
  if (!mainWindow) return;
  // CSS -webkit-app-region 已处理区域交互，窗口始终接收鼠标事件
  // 桌宠区域通过 JS 拖拽，设置面板/气泡/状态灯/提示通过 CSS drag
  mainWindow.setIgnoreMouseEvents(false, { forward: false });
}

// ============================================================
// 系统托盘
// ============================================================
function createTrayIcon() {
  // nativeImage.createFromDataURL 不支持 SVG（会得到空图像，托盘图标不显示），
  // 托盘图标必须使用 PNG/ICO 文件。
  const img = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray-icon.png'));
  tray = new Tray(img);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '💕 Bubbly', enabled: false },
    { type: 'separator' },
    { label: '🔄 重启应用', click: () => { app.relaunch(); app.exit(0); } },
    { type: 'separator' },
    { label: '❌ 退出', click: () => app.quit() }
  ]));
  tray.setToolTip('💕 Bubbly');
  tray.on('click', () => tray.popUpContextMenu());
}

// ============================================================
// 窗口创建
// ============================================================
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 280,
    height: 340,
    x: 400,
    y: 300,
    transparent: true,
    frame: false,
    alwaysOnTop: false,
    focusable: true,
    hasShadow: false,
    resizable: false,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  Menu.setApplicationMenu(null);

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[MAIN] did-finish-load');
    mainWindow.setAlwaysOnTop(true, 'normal');
    updateMousePenetration();
    // 内容加载完再显示，避免透明窗口在 Windows 上闪白/闪红
    mainWindow.show();
  });

  mainWindow.loadURL('file://' + path.join(__dirname, 'index.html'));
  mainWindow.on('closed', () => {
    mainWindow = null;
    cleanupInputWindow();
  });

  if (process.platform === 'darwin') {
    app.dock.hide();
  }
}

// ============================================================
// IPC
// ============================================================
ipcMain.on('enter-pet-mode', () => {
  if (!mainWindow) return;
  petMode = true;
  updateMousePenetration();
  // 窗口尺寸由渲染器在 applyScale 里通过 set-window-size 通知
  console.log('[MAIN] enter-pet-mode');
});

ipcMain.on('leave-pet-mode', () => {
  if (!mainWindow) return;
  petMode = false;
  updateMousePenetration();
  console.log('[MAIN] leave-pet-mode');
});

ipcMain.on('set-window-size', (event, w, h, petBottom) => {
  if (!mainWindow || typeof w !== 'number' || typeof h !== 'number') return;
  // 限制下限，防止渲染器误报 0
  winW = Math.max(80, Math.round(w));
  winH = Math.max(80, Math.round(h));
  if (typeof petBottom === 'number') petBottomOffset = petBottom;
  const bounds = mainWindow.getBounds();
  // 以窗口左上角不动，仅缩尺寸：先改大小，再把左上角挪回去对齐桌面坐标
  mainWindow.setBounds({
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: winW,
    height: winH
  });
  // 桌宠尺寸变化后，同步更新悬浮输入窗口位置
  positionInputWindow();
  console.log('[MAIN] set-window-size: ' + winW + 'x' + winH);
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
  if (!mainWindow || !Array.isArray(items)) return;
  const menuItems = items.map(item => {
    if (item.type) return item;  // separator / 特殊项原样透传
    const out = { label: item.label, enabled: item.enabled !== false };
    if (item.icon) out.icon = item.icon;
    out.click = () => event.sender.send(item.action || '');
    return out;
  });
  const contextMenu = Menu.buildFromTemplate(menuItems);
  contextMenu.popup({ window: mainWindow });
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
  if (!mainWindow) return;
  if (typeof clickX !== 'number' || typeof clickY !== 'number') return;
  const { x, y } = screen.getCursorScreenPoint();
  mainWindow.setBounds({
    x: Math.round(x - clickX),
    y: Math.round(y - clickY),
    width: winW,
    height: winH
  });
  // 桌宠位置变化后，同步更新悬浮输入窗口位置，保持跟随
  positionInputWindow();
});

// ============================================================
// 独立悬浮输入窗口
//
// 架构：
//   pet dblclick / 右键菜单「💌 发送消息」→ renderer 发 show-input-window
//   → main 创建独立 BrowserWindow（透明、无边框、置顶）
//     - 加载 input-window.html + input-window.preload.js + input-window.js
//     - 输入窗口位于主窗口下方并居中，自动校正屏幕边界
//     - 聚焦输入、Enter 发送 / Esc 关闭
//   → input-window 渲染器 ipc 'input-window-send' → main 转发给 mainWindow
//     → renderer 直接经 WebSocket 发出
//
// 生命周期：
//   - 重复 show-input-window 时复用已有窗口（聚焦+清空）
//   - 主窗口关闭时由 cleanupInputWindow 销毁
// ============================================================
let inputWindow = null;
const INPUT_W = 260, INPUT_H = 56;
const INPUT_GAP = 6;
// 桌宠可见底部距窗口顶部的偏移量，由渲染器通过 set-window-size 第三参数上报。
// 输入窗口跟随此偏移量，紧贴桌宠可见底部，避免窗口死区造成过大间距。
let petBottomOffset = 0;

// 把输入窗口重新定位到桌宠可见底部下方居中，并校正屏幕边界。
// 在桌宠拖拽 / 缩放 / 每次显示时调用，保持跟随。
function positionInputWindow() {
  if (!inputWindow || inputWindow.isDestroyed() || !mainWindow) return;
  if (!petBottomOffset) return;  // 未在桌宠模式下，无需跟随
  const petBounds = mainWindow.getBounds();
  const petBottomY = petBounds.y + petBottomOffset;
  let x = Math.round(petBounds.x + petBounds.width / 2 - INPUT_W / 2);
  let y = Math.round(petBottomY + INPUT_GAP);

  const display = screen.getDisplayNearestPoint({ x: petBounds.x, y: petBounds.y });
  const { bounds } = display;
  x = Math.max(Math.round(bounds.x), Math.min(x, Math.round(bounds.x + bounds.width - INPUT_W)));
  y = Math.min(y, Math.round(bounds.y + bounds.height - INPUT_H));

  inputWindow.setBounds({ x, y, width: INPUT_W, height: INPUT_H });
}

function cleanupInputWindow() {
  if (inputWindow) {
    try { inputWindow.destroy(); } catch (_) { /* window already closed */ }
    inputWindow = null;
  }
}

ipcMain.on('show-input-window', () => {
  if (!mainWindow) return;
  // 已有输入窗口：重新跟随定位、聚焦、清空即可（避免重复弹窗）
  if (inputWindow && !inputWindow.isDestroyed()) {
    try {
      positionInputWindow();
      inputWindow.focus();
      inputWindow.webContents.send('input-window-clear');
    } catch (_) { /* window in bad state */ }
    return;
  }

  const petBounds = mainWindow.getBounds();
  const petBottomY = petBottomOffset ? petBounds.y + petBottomOffset : petBounds.y + petBounds.height;
  let x = Math.round(petBounds.x + petBounds.width / 2 - INPUT_W / 2);
  let y = Math.round(petBottomY + INPUT_GAP);

  // 校正屏幕边界
  const display = screen.getDisplayNearestPoint({ x: petBounds.x, y: petBounds.y });
  const { bounds } = display;
  x = Math.max(Math.round(bounds.x), Math.min(x, Math.round(bounds.x + bounds.width - INPUT_W)));
  y = Math.min(y, Math.round(bounds.y + bounds.height - INPUT_H));

  inputWindow = new BrowserWindow({
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
    parent: mainWindow,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'input-window.preload.js')
    }
  });

  inputWindow.on('closed', () => { inputWindow = null; });

  const inputUrl = 'file://' + path.join(__dirname, 'input-window.html');
  inputWindow.loadURL(inputUrl);
  inputWindow.once('ready-to-show', () => {
    positionInputWindow();
    inputWindow.show();
    inputWindow.focus();
  });
});

// 输入窗口发回消息 / 关闭：用 ipcMain.on 而不是 webContents.on('ipc-message')，
// 因为 ipc-message 的第三个参数是未解包的 args 数组（typeof 为 'object'），
// 会导致 typeof text === 'string' 判定失败、消息被丢弃。ipcMain.on 的参数按
// ipcRenderer.send 的原值解包，text 直接拿到字符串。
ipcMain.on('input-window-send', (event, text) => {
  if (typeof text === 'string' && text.trim() !== '' && mainWindow) {
    mainWindow.webContents.send('input-window-send-message', text.trim());
  }
  if (inputWindow && !inputWindow.isDestroyed()) inputWindow.close();
});

ipcMain.on('input-window-close', () => {
  if (inputWindow && !inputWindow.isDestroyed()) inputWindow.close();
});

// ============================================================
// 应用生命周期
// ============================================================
const args = process.argv.slice(2);
const noSingleInstance = args.includes('--no-single-instance');

if (!noSingleInstance) {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
  } else {
    app.on('second-instance', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    });
  }
}

app.whenReady().then(() => {
  console.log('[MAIN] scaleFactor(你的DPI缩放) = ' + screen.getPrimaryDisplay().scaleFactor);
  createTrayIcon(); createWindow();
});
app.on('window-all-closed', () => app.quit());
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
