// ============================================================
// 勿扰模式
// ============================================================
function toggleDnd() {
  doNotDisturb = !doNotDisturb;
  saveSettings();
  // 切换后立刻刷新主状态灯：自己 DND → 黄灯，关闭 → 绿灯
  updateStatusUI();
  broadcastDndStatus(doNotDisturb);
  if (!doNotDisturb && dndQueue.length > 0) {
    replayDndQueue();
  }
}

function broadcastDndStatus(dnd) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: 'dnd-status', id: userId, dnd }));
}

function replayDndQueue() {
  if (dndQueue.length === 0) return;
  dndQueue.slice().forEach((text) => {
    messageQueue.push(text);
    showNextBubble();
  });
  dndQueue.length = 0;
}

function enqueueDndQueue(text) {
  if (dndQueue.length >= MAX_MENU_HISTORY) {
    dndQueue.shift();
  }
  dndQueue.push(text);
}

