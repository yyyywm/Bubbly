/**
 * ============================================================
 *  Bubbly - 渲染进程（页面逻辑）
 * ============================================================
 *
 *  区域穿透：CSS -webkit-app-region 原生管理
 *  桌宠拖拽：JS mousedown/mousemove/mouseup → IPC drag-move
 *  双击桌宠 → 弹出输入框，右键桌宠 → 弹出菜单
 *  模块加载顺序见 index.html 底部 <script> 标签：
 *  state → settings → images → layout → bubble → status
 *  → dnd → menu → connection → drag → index
 * ============================================================
 */

// ============================================================
// 双击桌宠 → 弹出独立悬浮输入窗口 / 断开时重连
// ============================================================
petContainer.addEventListener('dblclick', (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (wasDragging) {
    wasDragging = false;
    return;  // 拖拽后双击不触发
  }
  if (!isConnected) {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
    connect();
    return;
  }
  window.electronAPI.showInputWindow();
});

// 右键桌宠 → 弹出上下文菜单
petContainer.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  e.stopPropagation();
  // 坐标由 Menu.popup({window}) 默认光标位置自动处理，
  // 无需在进程间传递，避免 DPI 缩放下的坐标系不一致问题
  window.electronAPI.showPetContextMenu();
});

// ============================================================
// 缩放按钮
// ============================================================
document.querySelectorAll('.scale-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.scale-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    petScale = parseInt(btn.dataset.scale);
    saveSettings();
    if (petArea.style.display === 'block') {
      applyScale(petScale);
    }
  });
});

// ============================================================
// 连接按钮
// ============================================================
btnConnect.addEventListener('click', connect);

// ============================================================
// 双击状态光条：已连接 → 返回设置，已断开 → 立即重连
// ============================================================
const statusBar = document.getElementById('status-bar');
statusBar.addEventListener('dblclick', (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (isConnected) {
    ws.close();
    isConnected = false;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    reconnectVisible = false;
    window.electronAPI.leavePetMode();
    resetSetupWindowSize();
    petArea.style.display = 'none';
    setupPanel.style.display = 'flex';
    setStatus('已断开连接', '#f44336');
    btnConnect.disabled = false;
    messageQueue.length = 0;
    isShowing = false;
    bubbleContainer.innerHTML = '';
  } else {
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    connect();
  }
});

// ============================================================
// 图片上传事件
// ============================================================
document.querySelectorAll('.image-btn.upload').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.target;
    const input = target === 'default' ? fileDefault : fileMessage;
    input.click();
  });
});

document.querySelectorAll('.image-btn.reset').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.target;
    resetImage(target);
  });
});

if (fileDefault) {
  fileDefault.addEventListener('change', (e) => {
    if (e.target.files[0]) handleImageUpload('default', e.target.files[0]);
    e.target.value = '';
  });
}

if (fileMessage) {
  fileMessage.addEventListener('change', (e) => {
    if (e.target.files[0]) handleImageUpload('message', e.target.files[0]);
    e.target.value = '';
  });
}

if (defaultPreview) defaultPreview.addEventListener('click', () => fileDefault.click());
if (messagePreview) messagePreview.addEventListener('click', () => fileMessage.click());

// ============================================================
// 初始化
// ============================================================
loadSettings();
loadCustomImages();
updatePetDisplay();
window.electronAPI.leavePetMode();
console.log('[RENDERER] Init complete, electronAPI:', !!window.electronAPI);
