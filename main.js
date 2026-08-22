/**
 * ============================================================
 *  Bubbly - Electron 主进程
 * ============================================================
 *
 *  核心功能:
 *    1. 创建无边框透明置顶窗口
 *    2. 区域穿透：通过 setDraggableRegions 定义可交互区域，
 *       其余区域原生穿透，无需轮询
 *    3. 系统托盘图标
 *    4. 隐藏菜单栏与 Dock 图标
 *    5. 原生窗口拖拽（Electron 自动处理，无需 IPC）
 *
 *  拖拽方案:
 *    使用 BrowserWindow.setDraggableRegions() 定义"标题栏区域"，
 *    在该区域内按住鼠标即可原生拖拽窗口，由 OS 直接处理。
 *    无需 mousePollTimer，无需 IPC drag 通信。
 *
 *  IPC 通信（仅 4 条）:
 *    - enter-pet-mode       → 切换到桌宠模式（区域穿透）
 *    - leave-pet-mode       → 返回设置面板模式（全屏交互）
 *    - pet-region-updated   → 更新桌宠尺寸 → 重新计算区域
 *    - pet-input-visible    → 输入面板显示/隐藏 → 切换交互模式
 * ============================================================
 */

const {
  app, BrowserWindow, ipcMain, Menu, Tray,
  nativeImage
} = require('electron');
const path = require('path');

// ============================================================
// 常量
// ============================================================
const WIN_W = 280;
const WIN_H = 300;
const PET_OFFSET_BOTTOM = 20;    // 桌宠距离窗口底部
const BUBBLE_CONTAINER_W = 220;  // 气泡容器宽度
const BUBBLE_CONTAINER_H = 120;  // 气泡容器高度
const BUBBLE_GAP = 12;           // 气泡与桌宠间距
const DOT_SIZE = 6;              // 状态灯尺寸
const DOT_GAP = 6;               // 气泡到状态灯的额外间距
const HINT_W = 130;              // 重连提示宽度
const HINT_H = 30;               // 重连提示高度
const HINT_TOP = 100;            // 重连提示 Y 坐标

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
let petW = 150;
let petH = 150;
let inputPanelVisible = false;

// ============================================================
// 拖拽区域管理
// ============================================================
function updateDraggableRegions() {
  if (!mainWindow) return;

  // 设置面板模式：仅标题栏区域可拖拽，其余区域可交互（输入框/按钮正常响应）
  if (!petMode) {
    mainWindow.setIgnoreMouseEvents(false, { forward: false });
    // 标题栏高度（对应 CSS: #setup-drag padding + content ≈ 45px）
    mainWindow.setDraggableRegions([{ x: 0, y: 0, width: WIN_W, height: 45 }]);
    return;
  }

  // 输入面板可见：整窗口可交互、可拖拽
  if (inputPanelVisible) {
    mainWindow.setIgnoreMouseEvents(false, { forward: false });
    mainWindow.setDraggableRegions([{ x: 0, y: 0, width: WIN_W, height: WIN_H }]);
    return;
  }

  // 桌宠模式：默认穿透，仅交互区域可点击/拖拽
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  const regions = [];

  // 气泡容器区域
  const bubbleTop = Math.round(Math.max(10, WIN_H - BUBBLE_CONTAINER_H - petH - BUBBLE_GAP));
  const bubbleX   = Math.round((WIN_W - BUBBLE_CONTAINER_W) / 2);
  regions.push({ x: bubbleX, y: bubbleTop, width: BUBBLE_CONTAINER_W, height: BUBBLE_CONTAINER_H });

  // 状态灯区域
  const dotY = Math.round(bubbleTop + BUBBLE_CONTAINER_H + DOT_GAP);
  const dotX = Math.round((WIN_W - DOT_SIZE) / 2);
  regions.push({ x: dotX, y: dotY, width: DOT_SIZE, height: DOT_SIZE });

  // 桌宠区域
  const petX = Math.round((WIN_W - petW) / 2);
  const petY = Math.round(WIN_H - PET_OFFSET_BOTTOM - petH);
  regions.push({ x: petX, y: petY, width: petW, height: petH });

  // 重连提示区域（始终定义，不可见时由 CSS display:none 自然不响应）
  const hintX = Math.round((WIN_W - HINT_W) / 2);
  regions.push({ x: hintX, y: HINT_TOP, width: HINT_W, height: HINT_H });

  mainWindow.setDraggableRegions(regions);
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
    updateDraggableRegions();
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
  updateDraggableRegions();
  console.log('[MAIN] enter-pet-mode');
});

ipcMain.on('leave-pet-mode', () => {
  if (!mainWindow) return;
  petMode = false;
  inputPanelVisible = false;
  updateDraggableRegions();
  console.log('[MAIN] leave-pet-mode');
});

ipcMain.on('pet-region-updated', (event, { petW: newW, petH: newH }) => {
  if (!mainWindow || !petMode) return;
  petW = newW;
  petH = newH;
  updateDraggableRegions();
  console.log('[MAIN] petRegionUpdated: petW=' + petW + ' petH=' + petH);
});

ipcMain.on('pet-input-visible', (event, visible) => {
  if (!mainWindow || !petMode) return;
  inputPanelVisible = !!visible;
  updateDraggableRegions();
  console.log('[MAIN] petInputVisible: ' + inputPanelVisible);
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
