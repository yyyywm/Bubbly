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
 *    输入面板 → 整窗口交互
 *
 *  IPC 通信:
 *    - enter-pet-mode          → 进入桌宠模式
 *    - leave-pet-mode          → 返回设置面板
 *    - pet-input-visible       → 输入面板显示/隐藏
 *    - show-pet-context-menu   → 桌宠右键菜单
 *    - context-menu-items      → 渲染进程上报菜单模板
 *    - drag-move               → 桌宠 JS 拖拽（上报常量按下点）
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
let petMode = false;
let inputPanelVisible = false;

// ============================================================
// 鼠标穿透模式切换
// ============================================================
function updateMousePenetration() {
  if (!mainWindow) return;
  // CSS -webkit-app-region 已处理区域交互，窗口始终接收鼠标事件
  // 桌宠区域通过 JS 拖拽，设置面板/气泡/状态灯/输入面板通过 CSS drag
  mainWindow.setIgnoreMouseEvents(false, { forward: false });
}

// ============================================================
// 系统托盘
// ============================================================
function createTrayIcon() {
  const svgData = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
    <path fill="white" d="M8 14.5s-5.5-3.6-5.5-8C2.5 4.5 4 3 5.8 3c1.1 0 2 .6 2.2 1.5C8.2 3.6 9.1 3 10.2 3 12 3 13.5 4.5 13.5 6.5c0 4.4-5.5 8-5.5 8z" opacity="0.95"/>
    <circle cx="5.8" cy="5.5" r="1.2" fill="black" opacity="0.7"/>
    <circle cx="10.2" cy="5.5" r="1.2" fill="black" opacity="0.7"/>
  </svg>`;
  const img = nativeImage.createFromDataURL(
    'data:image/svg+xml;base64,' + Buffer.from(svgData).toString('base64')
  );
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
  mainWindow.on('closed', () => { mainWindow = null; });

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
  inputPanelVisible = false;
  updateMousePenetration();
  mainWindow.setBounds({ x: mainWindow.getBounds().x, y: mainWindow.getBounds().y, width: 220, height: 220 });
  console.log('[MAIN] enter-pet-mode');
});

ipcMain.on('leave-pet-mode', () => {
  if (!mainWindow) return;
  petMode = false;
  inputPanelVisible = false;
  updateMousePenetration();
  mainWindow.setBounds({ x: mainWindow.getBounds().x, y: mainWindow.getBounds().y, width: 280, height: 340 });
  console.log('[MAIN] leave-pet-mode');
});

ipcMain.on('pet-input-visible', (event, visible) => {
  if (!mainWindow || !petMode) return;
  inputPanelVisible = !!visible;
  updateMousePenetration();
  console.log('[MAIN] petInputVisible: ' + inputPanelVisible);
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
// 由于定位基于稳定的屏幕坐标(以显示器为原点，setPosition 不会改变它)，
// setPosition 不会在渲染器侧引发坐标漂移 → 彻底消除 setPosition→伪 mousemove→再 setPosition 的反馈循环。
ipcMain.on('drag-move', (event, clickX, clickY) => {
  if (!mainWindow) return;
  if (typeof clickX !== 'number' || typeof clickY !== 'number') return;
  const { x, y } = screen.getCursorScreenPoint();
  const bounds = mainWindow.getBounds();
  mainWindow.setBounds({
    x: Math.round(x - clickX),
    y: Math.round(y - clickY),
    width: bounds.width,
    height: bounds.height
  });
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
