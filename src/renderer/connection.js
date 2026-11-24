// ============================================================
// WebSocket
// ============================================================
function connect() {
  const serverUrl = inpServer.value.trim();

  if (!serverUrl) {
    setStatus('⚠️ 请输入服务器地址', '#f44336');
    return;
  }

  nickname = inpNickname.value.trim() || userId;
  saveSettings();

  setStatus('正在连接服务器…', '#666');
  btnConnect.disabled = true;

  if (ws) ws.close();

  try {
    ws = new WebSocket(serverUrl);

    ws.onopen = () => {
      console.log('WebSocket 已连接');
      // 连接成功，清除任何待触发的重连定时器（避免手动重连成功后旧定时器再次 connect）
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      ws.send(JSON.stringify({ type: 'join', id: userId }));
    };

    ws.onmessage = (event) => handleMessage(JSON.parse(event.data));

    ws.onclose = () => {
      console.log('WebSocket 已断开');
      isConnected = false;
      peerConnected = false;
      peerDoNotDisturb = false;
      updateStatusUI();
      if (petArea.style.display === 'block') {
        showReconnectHint();
        scheduleReconnect();
      }
    };

    ws.onerror = () => {
      console.error('WebSocket 错误');
      if (petArea.style.display === 'block') {
        showReconnectHint();
      } else {
        setStatus('⚠️ 连接失败，请检查服务器地址', '#f44336');
        btnConnect.disabled = false;
      }
    };
  } catch (e) {
    setStatus('⚠️ 连接参数错误: ' + e.message, '#f44336');
    btnConnect.disabled = false;
  }
}

function handleMessage(data) {
  switch (data.type) {
    case 'welcome':
      console.log('连接成功');
      isConnected = true;
      peerConnected = false;
      peerDoNotDisturb = false;
      window.electronAPI.enterPetMode();
      setupPanel.style.display = 'none';
      petArea.style.display = 'block';
      applyScale(petScale);
      updatePetDisplay();
      updateStatusUI();
      // 刚连接，主动广播当前用户的勿扰状态，让对方立刻看到状态灯变化
      broadcastDndStatus(doNotDisturb);
      break;

    case 'message':
      if (!peerConnected && data.from !== userId) {
        peerConnected = true;
        updateStatusUI();
      }
      if (doNotDisturb) {
        enqueueDndQueue(data.text);
      } else {
        enqueueBubble(data.text);
      }
      break;

    case 'peer-disconnected':
      peerConnected = false;
      peerDoNotDisturb = false;
      updateStatusUI();
      break;

    case 'peer-joined':
      peerConnected = true;
      peerDoNotDisturb = false;
      updateStatusUI();
      // 旧服务器只通知先加入的一端，向刚加入的一端同步自己的在线及勿扰状态。
      broadcastDndStatus(doNotDisturb);
      break;

    case 'dnd-status':
      // 对方主动上报勿扰状态也能确认其在线（兼容旧版服务器）。
      if (data.from !== userId) {
        peerConnected = true;
        peerDoNotDisturb = data.dnd === true;
        updateStatusUI();
      }
      break;

    case 'error':
      if (setupPanel.style.display !== 'none') {
        setStatus('⚠️ ' + data.msg, '#f44336');
        btnConnect.disabled = false;
      }
      break;
  }
}

// ============================================================
// 发送消息
// ============================================================
// 消息发送已通过 onInputWindowMessage 直接经 WebSocket 发出，
// sendMessage() 旧接口已废弃并移除。

// ============================================================
// 输入面板
// ============================================================
// 消息输入已通过独立悬浮窗口（src/renderer/input-window/index.html）实现，
// 旧的 #input-panel 内联面板已废弃并移除。

// 独立悬浮输入窗口回传消息：直接经 WebSocket 发出
// 注意：ipcRenderer.on 调用 listener 时传 (event, ...args)，event 是 IPC 事件对象，
// 实际消息是第二个参数，不能省略。
window.electronAPI.onInputWindowMessage((event, text) => {
  const t = String(text || '').trim();
  if (!t) return;
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({
    type: 'message',
    id: userId,
    text: t
  }));
});

