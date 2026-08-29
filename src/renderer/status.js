// ============================================================
// UI 状态
// ============================================================
function setStatus(text, color) {
  setupStatus.textContent = text;
  setupStatus.style.color = color || '#bbb';
}

function updateStatusUI() {
  if (isConnected) {
    // 自己状态条反映【自己】的状态：已连接 = 绿灯；自己开启勿扰 = 黄灯
    statusBarSelf.className = 'online' + (doNotDisturb ? ' dnd' : '');
    reconnectHint.style.display = 'none';
  } else {
    reconnectVisible = false;
    reconnectHint.style.display = 'none';
    statusBarSelf.className = 'offline';
  }
}

function showReconnectHint() {
  reconnectVisible = true;
  reconnectHint.style.display = 'block';
  statusBarSelf.className = 'offline';
}

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    console.log('尝试重连...');
    connect();
  }, 5000);
}

