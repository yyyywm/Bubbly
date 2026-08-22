/**
 * Bubbly - Preload 脚本
 *
 * 暴露给渲染进程的 IPC API:
 *   - enterPetMode()              → 进入桌宠模式
 *   - leavePetMode()              → 返回设置面板
 *   - petInputVisible(v)          → 输入面板显示/隐藏
 *   - showPetContextMenu()        → 桌宠右键菜单
 *   - dragMove(dx, dy)            → 桌宠 JS 拖拽
 *
 * 拖拽：完全由 CSS -webkit-app-region: drag 原生处理，无需 IPC。
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  enterPetMode: () => ipcRenderer.send('enter-pet-mode'),
  leavePetMode: () => ipcRenderer.send('leave-pet-mode'),
  petInputVisible: (v) => ipcRenderer.send('pet-input-visible', v),
  showPetContextMenu: () => ipcRenderer.send('show-pet-context-menu'),
  dragMove: (dx, dy) => ipcRenderer.send('drag-move', dx, dy),
  onPetMenuSendMessage: (cb) => ipcRenderer.on('pet-menu-send-message', cb),
  onPetMenuLeavePetMode: (cb) => ipcRenderer.on('pet-menu-leave-pet-mode', cb)
});
