/**
 * Bubbly - Preload 脚本
 *
 * 暴露给渲染进程的 IPC API:
 *   - enterPetMode()              → 进入桌宠模式
 *   - leavePetMode()              → 返回设置面板
 *   - petInputVisible(v)          → 输入面板显示/隐藏
 *   - showPetContextMenu()        → 桌宠右键菜单
 *   - dragMove(dx, dy)            → 桌宠 JS 拖拽
 *   - sendContextMenuItems(items) → 上报当前桌宠右键菜单模板
 *   - petMenuRelaunch()           → 重启应用
 *   - petMenuQuit()               → 退出应用
 *
 * 菜单项 IPC 回调（由主进程菜单 dispatch 回来）:
 *   - pet-menu-send-message     → 弹出发送消息输入框
 *   - pet-menu-leave-pet-mode   → 返回设置面板
 *   - pet-menu-toggle-dnd       → 切换勿扰模式
 *   - pet-menu-replay-queue     → 立即重放队列消息
 *   - pet-menu-clear-queue      → 清空队列
 *
 * 拖拽策略:
 *   - 设置面板/气泡/状态灯/输入面板 → CSS -webkit-app-region: drag 原生拖拽
 *   - 桌宠区域 → JS mousedown/mousemove/mouseup + IPC drag-move
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  enterPetMode: () => ipcRenderer.send('enter-pet-mode'),
  leavePetMode: () => ipcRenderer.send('leave-pet-mode'),
  petInputVisible: (v) => ipcRenderer.send('pet-input-visible', v),
  showPetContextMenu: () => ipcRenderer.send('show-pet-context-menu'),
  dragMove: (dx, dy) => ipcRenderer.send('drag-move', dx, dy),
  sendContextMenuItems: (items) => ipcRenderer.send('context-menu-items-reply', items),
  petMenuRelaunch: () => ipcRenderer.send('pet-menu-relaunch'),
  petMenuQuit: () => ipcRenderer.send('pet-menu-quit'),

  onPetMenuSendMessage: (cb) => ipcRenderer.on('pet-menu-send-message', cb),
  onPetMenuLeavePetMode: (cb) => ipcRenderer.on('pet-menu-leave-pet-mode', cb),
  onPetMenuToggleDnd: (cb) => ipcRenderer.on('pet-menu-toggle-dnd', cb),
  onPetMenuReplayQueue: (cb) => ipcRenderer.on('pet-menu-replay-queue', cb),
  onPetMenuClearQueue: (cb) => ipcRenderer.on('pet-menu-clear-queue', cb),
  onPetMenuRelaunch: (cb) => ipcRenderer.on('pet-menu-relaunch', cb),
  onPetMenuQuit: (cb) => ipcRenderer.on('pet-menu-quit', cb),
  onContextMenuItems: (cb) => ipcRenderer.on('context-menu-items', cb)
});
