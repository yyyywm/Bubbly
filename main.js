/**
 * ============================================================
 *  Bubbly - Electron 主进程
 * ============================================================
 *
 *  核心功能:
 *    1. 创建无边框透明窗口（alwaysOnTop 置顶 + 鼠标穿透）
 *    2. 区域穿透控制：仅桌宠/气泡/输入框区域可交互，其余穿透
 *    3. 系统托盘图标（菜单栏退出/重启）
 *    4. 隐藏菜单栏与 Dock 图标
 *    5. 窗口拖拽（设置面板左键 / 桌宠右键）
 *
 *  通信通道 (IPC):
 *    - enable-penetrating     → 开启全屏穿透
 *    - disable-penetrating    → 关闭穿透
 *    - set-non-penetrating-region → 区域穿透
 *    - drag-start / drag-move / drag-end → 拖拽
 * ============================================================
 */

const {
  app, BrowserWindow, ipcMain, Menu, Tray,
  nativeImage, screen
} = require('electron');
const path = require('path');

// 多实例运行时隔离用户数据目录，避免缓存冲突
app.setPath('userData', path.join(app.getPath('userData'), `instance-${process.pid}`));

// 透明窗口关键：让合成器使用完全透明的后备层，避免拖拽时白底闪烁
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('transparent-window-background', '#00000000');
}

let mainWindow = null;
let tray = null;
let isDragging = false;
let dragOffset = { x: 0, y: 0 };
let petMode = false;
let petW = 150;         // 桌宠宽度（屏幕坐标，跟随窗口移动）
let petH = 150;         // 桌宠高度
let inputFullWindow = false;  // 输入面板是否可见

// 鼠标轮询：每 50ms 检查光标是否在可交互区域内
function startMousePolling() {
  stopMousePolling();
  mousePollTimer = setInterval(() => {
    if (!petMode || !mainWindow || !mainWindow.isVisible()) return;
    if (isDragging) return;
    const [screenX, screenY] = screen.getCursorScreenPoint();

    // 输入面板可见时，整个窗口可点
    if (inputFullWindow) {
      mainWindow.setIgnoreMouseEvents(false, { forward: false });
      return;
    }

    // 检查光标是否在桌宠区域
    const [winX, winY] = mainWindow.getPosition();
    const WIN_W = 280, WIN_H = 300;
    const petLeft = winX + (WIN_W - petW) / 2 - 5;
    const petTop  = winY + (WIN_H - 20 - petH) - 5;
    const overPet = screenX >= petLeft && screenX <= petLeft + petW + 10 &&
                    screenY >= petTop  && screenY <= petTop  + petH + 10;

    if (overPet) {
      mainWindow.setIgnoreMouseEvents(false, { forward: false });
    } else {
      mainWindow.setIgnoreMouseEvents(true, { forward: true });
    }
  }, 50);
}

function stopMousePolling() {
  if (mousePollTimer) {
    clearInterval(mousePollTimer);
    mousePollTimer = null;
  }
}

function createTrayIcon() {
  const svgData = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
    <path fill="white" d="M8 14.5s-5.5-3.6-5.5-8C2.5 4.5 4 3 5.8 3c1.1 0 2 .6 2.2 1.5C8.2 3.6 9.1 3 10.2 3 12 3 13.5 4.5 13.5 6.5c0 4.4-5.5 8-5.5 8z" opacity="0.95"/>
    <circle cx="5.8" cy="5.5" r="1.2" fill="black" opacity="0.7"/>
    <circle cx="10.2" cy="5.5" r="1.2" fill="black" opacity="0.7"/>
  </svg>`;
  const img = nativeImage.createFromDataURL('data:image/svg+xml;base64,' + Buffer.from(svgData).toString('base64'));
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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 280,
    height: 300,
    x: 400,
    y: 300,
    transparent: true,
    frame: false,
    alwaysOnTop: false,
    focusable: true,
    hasShadow: false,
    resizable: false,
    show: true,
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  Menu.setApplicationMenu(null);

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[MAIN] did-finish-load: reset mouse + set alwaysOnTop');
    mainWindow.setIgnoreMouseEvents(false, { forward: false });
    mainWindow.setAlwaysOnTop(true, 'normal');
    console.log('[MAIN] Page loaded');
  });

  mainWindow.loadURL('file://' + path.join(__dirname, 'index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });

  if (process.platform === 'darwin') {
    app.dock.hide();
  }
}

// 切换到桌宠模式
ipcMain.on('enter-pet-mode', () => {
  if (!mainWindow) return;
  petMode = true;
  startMousePolling();
  console.log('[MAIN] enter-pet-mode');
});

ipcMain.on('leave-pet-mode', () => {
  if (!mainWindow) return;
  petMode = false;
  stopMousePolling();
  mainWindow.setIgnoreMouseEvents(false, { forward: false });
  console.log('[MAIN] leave-pet-mode');
});

ipcMain.on('pet-region-updated', (event, { petW: newW, petH: newH }) => {
  if (!mainWindow || !petMode) return;
  petW = newW;
  petH = newH;
  console.log('[MAIN] petRegionUpdated: petW=' + petW + ' petH=' + petH);
});

ipcMain.on('pet-input-visible', (event, visible) => {
  if (!mainWindow || !petMode) return;
  inputFullWindow = !!visible;
  console.log('[MAIN] petInputVisible: ' + inputFullWindow);
});

ipcMain.on('enable-penetrating', () => {
  if (!mainWindow || !petMode) return;
  console.log('[MAIN] enable-penetrating');
  mainWindow.setIgnoreMouseEvents(true, { forward: true });
});

ipcMain.on('disable-penetrating', () => {
  if (!mainWindow) return;
  console.log('[MAIN] disable-penetrating');
  mainWindow.setIgnoreMouseEvents(false, { forward: false });
});

ipcMain.on('set-ignore-mouse-events', (event, opts) => {
  if (!mainWindow) return;
  console.log('[MAIN] setIgnoreMouseEvents:', JSON.stringify(opts));
  mainWindow.setIgnoreMouseEvents(!!opts.ignore, { forward: !!opts.forward });
});

ipcMain.on('drag-start', (event, screenX, screenY) => {
  if (!mainWindow) return;
  mainWindow.setIgnoreMouseEvents(false, { forward: false });
  isDragging = true;
  const [winX, winY] = mainWindow.getPosition();
  dragOffset.x = screenX - winX;
  dragOffset.y = screenY - winY;
});

ipcMain.on('drag-move', (event, screenX, screenY) => {
  if (!mainWindow || !isDragging) return;
  mainWindow.setPosition(Math.round(screenX - dragOffset.x), Math.round(screenY - dragOffset.y));
});

ipcMain.on('drag-end', () => {
  isDragging = false;
  if (mainWindow) {
    mainWindow.setIgnoreMouseEvents(false, { forward: false });
  }
});

// --no-single-instance 允许多开（开发调试用）；打包发布时默认启用单实例锁
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

app.whenReady().then(() => { createTrayIcon(); createWindow(); });
app.on('window-all-closed', () => app.quit());
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});