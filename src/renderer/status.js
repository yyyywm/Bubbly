// ============================================================
// UI 状态
// ============================================================
function setStatus(text, color) {
  setupStatus.textContent = text;
  setupStatus.style.color = color || '#bbb';
}

function updateStatusUI() {
  if (isConnected) {
    // 只有双方都在线才显示在线或勿扰状态；独自连上服务器时两段均为红色。
    statusBarSelf.className = peerConnected
      ? 'online' + (doNotDisturb ? ' dnd' : '')
      : 'offline';
    statusBarPeer.className = peerConnected
      ? (peerDoNotDisturb ? 'dnd' : 'online')
      : 'offline';
    reconnectHint.style.display = 'none';
  } else {
    reconnectVisible = false;
    reconnectHint.style.display = 'none';
    statusBarSelf.className = 'offline';
    statusBarPeer.className = 'offline';
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

