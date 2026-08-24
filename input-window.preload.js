/**
 * Bubbly - 独立输入窗口 preload
 *
 * 暴露给 input-window 渲染进程的 IPC API：
 *   - sendAndClose(text) → 发送消息并关闭输入窗口
 *   - close()            → 关闭输入窗口
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  sendAndClose: (text) => ipcRenderer.send('input-window-send', text),
  close: () => ipcRenderer.send('input-window-close'),
  onClear: (cb) => ipcRenderer.on('input-window-clear', cb)
});
