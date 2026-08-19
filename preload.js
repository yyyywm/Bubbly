/**
 * ============================================================
 *  恋爱气泡 - Preload 脚本
 * ============================================================
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  enterPetMode: () => {
    ipcRenderer.send('enter-pet-mode');
  },
  enablePenetrating: () => {
    ipcRenderer.send('enable-penetrating');
  },
  disablePenetrating: () => {
    ipcRenderer.send('disable-penetrating');
  },
  setNonPenetratingRegion: (regions) => {
    ipcRenderer.send('set-non-penetrating-region', regions);
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