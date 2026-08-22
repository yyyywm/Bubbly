/**
 * Bubbly - Preload 脚本
 *
 * 暴露给渲染进程的 IPC API（仅 4 条）:
 *   - enterPetMode()       → 进入桌宠模式（区域穿透 + 原生拖拽）
 *   - leavePetMode()       → 返回设置面板（全屏交互）
 *   - petRegionUpdated(w, h) → 更新桌宠尺寸
 *   - petInputVisible(v)   → 输入面板显示/隐藏
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  enterPetMode: () => ipcRenderer.send('enter-pet-mode'),
  leavePetMode: () => ipcRenderer.send('leave-pet-mode'),
  petRegionUpdated: (w, h) => ipcRenderer.send('pet-region-updated', { petW: w, petH: h }),
  petInputVisible: (v) => ipcRenderer.send('pet-input-visible', v)
});
