/**
 * ============================================================
 *  Bubbly - 窗口管理
 * ============================================================
 *  主窗口（无边框透明置顶）与独立悬浮输入窗口的创建、
 *  定位与销毁。窗口尺寸/位置状态见 state.js。
 * ============================================================
 */

const { app, BrowserWindow, Menu, screen } = require('electron');
const path = require('path');
const S = require('./state');

const INPUT_W = 260, INPUT_H = 56;
const INPUT_GAP = 6;

// ============================================================
// 鼠标穿透模式切换
// ============================================================
function updateMousePenetration() {
  if (!S.mainWindow) return;
  // CSS -webkit-app-region 已处理区域交互，窗口始终接收鼠标事件
  // 桌宠区域通过 JS 拖拽，设置面板/气泡/状态灯/提示通过 CSS drag
  S.mainWindow.setIgnoreMouseEvents(false, { forward: false });
}

// ============================================================
// 窗口创建
// ============================================================
function createWindow() {
  S.mainWindow = new BrowserWindow({
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
      preload: path.join(__dirname, '..', 'preload', 'main.js')
    }
  });

  Menu.setApplicationMenu(null);

  S.mainWindow.webContents.on('did-finish-load', () => {
    console.log('[MAIN] did-finish-load');
    S.mainWindow.setAlwaysOnTop(true, 'normal');
    updateMousePenetration();
    // 内容加载完再显示，避免透明窗口在 Windows 上闪白/闪红
    S.mainWindow.show();
  });

  S.mainWindow.loadURL('file://' + path.join(__dirname, '..', 'renderer', 'index.html'));
  S.mainWindow.on('closed', () => {
    S.mainWindow = null;
    cleanupInputWindow();
  });

  if (process.platform === 'darwin') {
    app.dock.hide();
  }
}

// ============================================================
// 独立悬浮输入窗口
//
// 架构：
//   pet dblclick / 右键菜单「💌 发送消息」→ renderer 发 show-input-window
//   → main 创建独立 BrowserWindow（透明、无边框、置顶）
//     - 加载 src/renderer/input-window/（index.html + renderer.js）+ src/preload/input-window.js
//     - 输入窗口位于主窗口下方并居中，自动校正屏幕边界
//     - 聚焦输入、Enter 发送 / Esc 关闭
//   → input-window 渲染器 ipc 'input-window-send' → main 转发给 mainWindow
//     → renderer 直接经 WebSocket 发出
//
// 生命周期：
//   - 重复 show-input-window 时复用已有窗口（聚焦+清空）
//   - 主窗口关闭时由 cleanupInputWindow 销毁
// ============================================================

// 把输入窗口重新定位到桌宠可见底部下方居中，并校正屏幕边界。
// 在桌宠拖拽 / 缩放 / 每次显示时调用，保持跟随。
function positionInputWindow() {
  if (!S.inputWindow || S.inputWindow.isDestroyed() || !S.mainWindow) return;
  if (!S.petBottomOffset) return;  // 未在桌宠模式下，无需跟随
  const petBounds = S.mainWindow.getBounds();
  const petBottomY = petBounds.y + S.petBottomOffset;
  let x = Math.round(petBounds.x + petBounds.width / 2 - INPUT_W / 2);
  let y = Math.round(petBottomY + INPUT_GAP);

  const display = screen.getDisplayNearestPoint({ x: petBounds.x, y: petBounds.y });
  const { bounds } = display;
  x = Math.max(Math.round(bounds.x), Math.min(x, Math.round(bounds.x + bounds.width - INPUT_W)));
  y = Math.min(y, Math.round(bounds.y + bounds.height - INPUT_H));

  S.inputWindow.setBounds({ x, y, width: INPUT_W, height: INPUT_H });
}

function cleanupInputWindow() {
  if (S.inputWindow) {
    try { S.inputWindow.destroy(); } catch (_) { /* window already closed */ }
    S.inputWindow = null;
  }
}

module.exports = {
  createWindow,
  updateMousePenetration,
  positionInputWindow,
  cleanupInputWindow,
  INPUT_W,
  INPUT_H,
  INPUT_GAP
};
