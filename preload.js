/**
 * Bubbly - Preload 脚本
 *
 * 暴露给渲染进程的 IPC API（仅 3 条）:
 *   - enterPetMode()       → 进入桌宠模式（区域穿透 + 原生拖拽）
 *   - leavePetMode()       → 返回设置面板（全屏交互）
 *   - petInputVisible(v)   → 输入面板显示/隐藏 → 切换交互模式
 *
 * 拖拽：完全由 CSS -webkit-app-region: drag 原生处理，无需 IPC。
 * 区域穿透：完全由 main.js 的 setIgnoreMouseEvents 控制，无需 IPC。
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  enterPetMode: () => ipcRenderer.send('enter-pet-mode'),
  leavePetMode: () => ipcRenderer.send('leave-pet-mode'),
  petInputVisible: (v) => ipcRenderer.send('pet-input-visible', v)
});
