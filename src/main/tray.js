/**
 * ============================================================
 *  Bubbly - 系统托盘
 * ============================================================
 */

const { app, Menu, Tray, nativeImage } = require('electron');
const path = require('path');

let tray = null;

function createTrayIcon() {
  // nativeImage.createFromDataURL 不支持 SVG（会得到空图像，托盘图标不显示），
  // 托盘图标必须使用 PNG/ICO 文件。
  const img = nativeImage.createFromPath(path.join(__dirname, '..', '..', 'assets', 'tray-icon.png'));
  tray = new Tray(img);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '💕 Bubbly', enabled: false },
    { type: 'separator' },
    { label: '🔄 重启应用', click: () => { app.relaunch(); app.exit(0); } },
    { type: 'separator' },
    { label: '❌ 退出', click: () => app.quit() }
  ]));
  tray.setToolTip('💕 Bubbly');
  tray.on('click', () => tray.popUpContextMenu());
}

module.exports = { createTrayIcon };
