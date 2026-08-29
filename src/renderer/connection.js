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
      window.electronAPI.enterPetMode();
      setupPanel.style.display = 'none';
      petArea.style.display = 'block';
      applyScale(petScale);
      updatePetDisplay();
      updateStatusUI();
      statusBarPeer.className = '';
      // 刚连接，主动广播当前用户的勿扰状态，让对方立刻看到状态灯变化
      broadcastDndStatus(doNotDisturb);
      break;

    case 'message':
      if (doNotDisturb) {
        enqueueDndQueue(data.text);
      } else {
        enqueueBubble(data.text);
      }
      break;

    case 'peer-disconnected':
      statusBarSelf.className = 'offline';
      statusBarPeer.className = 'offline';
      break;

    case 'peer-joined':
      // 对方回来了：自己状态条反映【自己】的状态（联网 = 绿灯，自己 DND = 黄灯）
      statusBarSelf.className = 'online' + (doNotDisturb ? ' dnd' : '');
      statusBarPeer.className = '';
      break;

    case 'dnd-status':
      // 只处理对方的 DND 状态，通过 statusBarPeer 显示；不触碰自己状态条
      if (data.from !== userId) {
        statusBarPeer.className = data.dnd === true ? 'dnd' : '';
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

