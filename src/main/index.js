/**
 * ============================================================
 *  Bubbly - Electron 主进程入口
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
 * ============================================================
 */

const { app, BrowserWindow, screen } = require('electron');
console.log('[MAIN] electron=' + process.versions.electron);

// ============================================================
// 初始化
// ============================================================
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('transparent-window-background', '#00000000');
}

const S = require('./state');
const { createTrayIcon } = require('./tray');
const { createWindow } = require('./windows');
const { registerIpcHandlers } = require('./ipc');

// IPC 通道在模块加载时注册（与原 main.js 顶层 ipcMain.on 时序一致）
registerIpcHandlers();

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
      if (S.mainWindow) {
        if (S.mainWindow.isMinimized()) S.mainWindow.restore();
        S.mainWindow.focus();
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
