/**
 * ============================================================
 *  Bubbly - Preload 脚本
 * ============================================================
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  enterPetMode: () => {
    ipcRenderer.send('enter-pet-mode');
  },
  leavePetMode: () => {
    ipcRenderer.send('leave-pet-mode');
  },
  enablePenetrating: () => {
    ipcRenderer.send('enable-penetrating');
  },
  disablePenetrating: () => {
    ipcRenderer.send('disable-penetrating');
  },
  setIgnoreMouseEvents: (ignore, forward) => {
    ipcRenderer.send('set-ignore-mouse-events', { ignore, forward: !!forward });
  },
  petRegionUpdated: (petW, petH) => {
    ipcRenderer.send('pet-region-updated', { petW, petH });
  },
  petInputVisible: (visible) => {
    ipcRenderer.send('pet-input-visible', visible);
  },
  dragStart: (screenX, screenY) => {
    ipcRenderer.send('drag-start', screenX, screenY);
  },
  dragMove: (screenX, screenY) => {
    ipcRenderer.send('drag-move', screenX, screenY);
  },
  dragEnd: () => {
    ipcRenderer.send('drag-end');
  }
});