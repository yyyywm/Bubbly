/**
 * ============================================================
 *  Bubbly - Electron 主进程入口
 * ============================================================
 *  保留原 main.js 头部注释中的核心功能清单与方案说明。
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
