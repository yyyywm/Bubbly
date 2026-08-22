/**
 * ============================================================
 *  Bubbly - Electron 主进程
 * ============================================================
 *
 *  核心功能:
 *    1. 创建无边框透明置顶窗口
 *    2. 区域穿透：setIgnoreMouseEvents + CSS -webkit-app-region
 *    3. 原生窗口拖拽：CSS -webkit-app-region: drag，OS 直接处理
 *    4. 系统托盘图标
 *    5. 隐藏菜单栏与 Dock 图标
 *
 *  方案说明:
 *    设置面板模式 → setIgnoreMouseEvents(false)，整窗口交互，标题栏可拖拽
 *    桌宠模式    → setIgnoreMouseEvents(true, forward)，空白区域穿透
 *                  -webkit-app-region: drag 标记桌宠/气泡/状态灯/提示
 *                  使这些区域支持原生拖拽和点击
 *    输入面板    → setIgnoreMouseEvents(false)，整窗口交互
 *
 *  IPC 通信（仅 3 条）:
 *    - enter-pet-mode    → 进入桌宠模式
 *    - leave-pet-mode    → 返回设置面板
 *    - pet-input-visible → 输入面板显示/隐藏
 * ============================================================
 */

const {
  app, BrowserWindow, ipcMain, Menu, Tray,
  nativeImage
} = require('electron');
const path = require('path');

// ============================================================
// 初始化
// ============================================================
app.setPath('userData', path.join(app.getPath('userData'), `instance-${process.pid}`));

if (process.platform === 'win32') {
  app.commandLine.appendSwitch('transparent-window-background', '#00000000');
}

// ============================================================
// 模块级状态
// ============================================================
let mainWindow = null;
let tray = null;
let petMode = false;
let inputPanelVisible = false;

// ============================================================
// 鼠标穿透模式切换
// ============================================================
function updateMousePenetration() {
  if (!mainWindow) return;

  if (!petMode) {
    // 设置面板模式 → 整窗口可交互，标题栏可拖拽
    mainWindow.setIgnoreMouseEvents(false, { forward: false });
  } else if (inputPanelVisible) {
    // 输入面板可见 → 整窗口可交互
    mainWindow.setIgnoreMouseEvents(false, { forward: false });
  } else {
    // 桌宠模式 → 整窗口接收鼠标事件（透明区域自然忽略），
    // 交互区域通过 CSS -webkit-app-region: drag 支持原生拖拽
    mainWindow.setIgnoreMouseEvents(false, { forward: false });
  }
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
    console.log('[MAIN] did-finish-load');
    mainWindow.setAlwaysOnTop(true, 'normal');
    updateMousePenetration();
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
  console.log('[MAIN] enter-pet-mode');
});

ipcMain.on('leave-pet-mode', () => {
  if (!mainWindow) return;
  petMode = false;
  inputPanelVisible = false;
  updateMousePenetration();
  console.log('[MAIN] leave-pet-mode');
});

ipcMain.on('pet-input-visible', (event, visible) => {
  if (!mainWindow || !petMode) return;
  inputPanelVisible = !!visible;
  updateMousePenetration();
  console.log('[MAIN] petInputVisible: ' + inputPanelVisible);
});

ipcMain.on('show-pet-context-menu', (event, clientX, clientY) => {
  if (!mainWindow) return;
  // clientX/clientY 是视口坐标，加上窗口位置得到屏幕坐标
  const [winX, winY] = mainWindow.getPosition();
  const screenX = Math.round(winX + clientX);
  const screenY = Math.round(winY + clientY);

  const contextMenu = Menu.buildFromTemplate([
    { label: '💌 发送消息', click: () => {
        event.sender.send('pet-menu-send-message');
      }
    },
    { type: 'separator' },
    { label: '🏠 返回设置', click: () => {
        event.sender.send('pet-menu-leave-pet-mode');
      }
    },
    { label: '🔄 重启应用', click: () => {
        app.relaunch();
        app.exit(0);
      }
    },
    { label: '❌ 退出', click: () => app.quit() }
  ]);
  contextMenu.popup({ x: screenX, y: screenY });
  console.log('[MAIN] pet context menu at (' + screenX + ', ' + screenY + ')');
});

// 桌宠 JS 拖拽：接收相对移动量，累加到窗口当前位置
ipcMain.on('drag-move', (event, dx, dy) => {
  if (!mainWindow) return;
  const [x, y] = mainWindow.getPosition();
  mainWindow.setPosition(
    Math.round(x + dx),
    Math.round(y + dy)
  );
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

app.whenReady().then(() => { createTrayIcon(); createWindow(); });
app.on('window-all-closed', () => app.quit());
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
