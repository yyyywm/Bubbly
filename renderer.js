/**
 * ============================================================
 *  Bubbly - 渲染进程（页面逻辑）
 * ============================================================
 *
 *  区域穿透与拖拽完全由 CSS -webkit-app-region: drag 原生管理，
 *  渲染进程仅需在模式切换时通知主进程切换鼠标穿透状态。
 * ============================================================
 */

// ============================================================
// DOM 元素
// ============================================================
const setupPanel     = document.getElementById('setup-panel');
const petArea        = document.getElementById('pet-area');
const petContainer   = document.getElementById('pet-container');
const petBody        = document.getElementById('pet-body');
const bubbleContainer = document.getElementById('bubble-container');
const inputPanel     = document.getElementById('input-panel');
const msgInput       = document.getElementById('msg-input');
const btnSend        = document.getElementById('btn-send');
const btnConnect     = document.getElementById('btn-connect');
const inpServer      = document.getElementById('inp-server');
const inpRoom        = document.getElementById('inp-room');
const inpNickname    = document.getElementById('inp-nickname');
const setupStatus    = document.getElementById('setup-status');
const statusDot      = document.getElementById('status-dot');
const reconnectHint  = document.getElementById('reconnect-hint');

// ============================================================
// 状态
// ============================================================
const MAX_QUEUE_SIZE = 50;
const userId = crypto.randomUUID();
const messageQueue = [];

let ws = null;
let isConnected = false;
let inputVisible = false;
let reconnectTimer = null;
let reconnectVisible = false;
let currentRoom = '';
let isShowing = false;
let nickname = '';
let petScale = 100;

// ============================================================
// 持久化设置
// ============================================================
function loadSettings() {
  try {
    const saved = localStorage.getItem('bubbly_settings');
    if (!saved) return;
    const s = JSON.parse(saved);
    if (s.serverUrl) inpServer.value = s.serverUrl;
    if (s.room) {
      inpRoom.value = s.room;
      currentRoom = s.room;
    }
    if (s.nickname) inpNickname.value = s.nickname;
    if (s.scale) {
      petScale = s.scale;
      document.querySelectorAll('.scale-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.scale) === petScale);
      });
    }
  } catch (e) {
    console.warn('加载设置失败:', e);
  }
}

function saveSettings() {
  try {
    localStorage.setItem('bubbly_settings', JSON.stringify({
      serverUrl: inpServer.value,
      room: currentRoom,
      nickname: inpNickname.value,
      scale: petScale
    }));
  } catch (e) {
    console.warn('保存设置失败:', e);
  }
}

// ============================================================
// 缩放
// ============================================================
function applyScale(scale) {
  petScale = scale;
  const ratio = scale / 100;
  const petSize = Math.round(150 * ratio);

  petBody.style.transform = `scale(${ratio})`;
  petBody.style.transformOrigin = 'center center';
  petContainer.style.width = petSize + 'px';
  petContainer.style.height = petSize + 'px';

  bubbleContainer.style.top = Math.max(10, 300 - 220 - petSize - 12) + 'px';
  bubbleContainer.style.height = '120px';

  const dotTop = Math.max(10, 300 - 220 - petSize - 12) + 120 + 6;
  statusDot.style.top = dotTop + 'px';

  // 区域穿透和拖拽由 CSS -webkit-app-region 原生管理，无需通知主进程
  saveSettings();
}

// ============================================================
// WebSocket
// ============================================================
function connect() {
  const serverUrl = inpServer.value.trim();
  const room = inpRoom.value.trim();

  if (!serverUrl) {
    setStatus('⚠️ 请输入服务器地址', '#f44336');
    return;
  }
  if (!room) {
    setStatus('⚠️ 请输入房间号', '#f44336');
    return;
  }

  nickname = inpNickname.value.trim() || userId;
  currentRoom = room;
  saveSettings();

  setStatus('正在连接服务器…', '#666');
  btnConnect.disabled = true;

  if (ws) ws.close();

  try {
    ws = new WebSocket(serverUrl);

    ws.onopen = () => {
      console.log('WebSocket 已连接');
      ws.send(JSON.stringify({ type: 'join', room: currentRoom, id: userId }));
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
      console.log('加入房间成功:', data.room);
      isConnected = true;
      window.electronAPI.enterPetMode();
      setupPanel.style.display = 'none';
      petArea.style.display = 'block';
      applyScale(petScale);
      updateStatusUI();
      break;

    case 'message':
      enqueueBubble(data.text);
      break;

    case 'peer-disconnected':
      statusDot.className = 'offline';
      break;

    case 'peer-joined':
      statusDot.className = 'online';
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
// 消息气泡
// ============================================================
function enqueueBubble(text) {
  if (messageQueue.length >= MAX_QUEUE_SIZE) {
    messageQueue.shift();
  }
  messageQueue.push(text);
  showNextBubble();
}

function showNextBubble() {
  if (isShowing || messageQueue.length === 0) return;

  isShowing = true;
  const text = messageQueue.shift();

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;
  bubbleContainer.appendChild(bubble);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => bubble.classList.add('show'));
  });

  setTimeout(() => {
    bubble.classList.remove('show');
    bubble.classList.add('hide');
  }, 2500);

  setTimeout(() => {
    bubble.remove();
    isShowing = false;
    showNextBubble();
  }, 2850);
}

// ============================================================
// 发送消息
// ============================================================
function sendMessage() {
  const text = msgInput.value.trim();
  if (!text) return;
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  ws.send(JSON.stringify({
    type: 'message',
    room: currentRoom,
    id: userId,
    text
  }));

  msgInput.value = '';
  hideInput();
}

// ============================================================
// 输入面板
// ============================================================
function showInput() {
  if (inputVisible) return;
  inputVisible = true;
  inputPanel.style.display = 'flex';
  msgInput.value = '';
  msgInput.focus();
  petArea.style.cursor = 'default';
  window.electronAPI.petInputVisible(true);
}

function hideInput() {
  if (!inputVisible) return;
  inputVisible = false;
  inputPanel.style.display = 'none';
  msgInput.blur();
  petArea.style.cursor = 'none';
  window.electronAPI.petInputVisible(false);
}

// ============================================================
// UI 状态
// ============================================================
function setStatus(text, color) {
  setupStatus.textContent = text;
  setupStatus.style.color = color || '#bbb';
}

function updateStatusUI() {
  if (isConnected) {
    statusDot.className = 'online';
    reconnectHint.style.display = 'none';
  } else {
    reconnectVisible = false;
    reconnectHint.style.display = 'none';
    statusDot.className = 'offline';
  }
}

function showReconnectHint() {
  reconnectVisible = true;
  reconnectHint.style.display = 'block';
  statusDot.className = 'offline';
}

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    console.log('尝试重连...');
    connect();
  }, 5000);
}

// ============================================================
// 双击桌宠 → 弹出输入框 / 断开时重连
// ============================================================
petContainer.addEventListener('dblclick', (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (!isConnected) {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
    connect();
    return;
  }
  showInput();
});

// 右键桌宠 → 弹出上下文菜单
petContainer.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  e.stopPropagation();
  window.electronAPI.showPetContextMenu(e.screenX, e.screenY);
});

// 菜单项 IPC 回调：发送消息
window.electronAPI.onPetMenuSendMessage(() => {
  if (isConnected) showInput();
});

// 菜单项 IPC 回调：返回设置
window.electronAPI.onPetMenuLeavePetMode(() => {
  if (isConnected) {
    ws.close();
    isConnected = false;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    reconnectVisible = false;
    window.electronAPI.leavePetMode();
    petArea.style.display = 'none';
    setupPanel.style.display = 'flex';
    setStatus('已断开连接', '#f44336');
    btnConnect.disabled = false;
    hideInput();
    messageQueue.length = 0;
    isShowing = false;
    bubbleContainer.innerHTML = '';
  }
});

inputPanel.addEventListener('focusout', (e) => {
  if (inputPanel.contains(e.relatedTarget)) return;
  hideInput();
});

msgInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendMessage();
});

btnSend.addEventListener('click', sendMessage);

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
// 双击状态灯：已连接 → 返回设置，已断开 → 立即重连
// ============================================================
statusDot.addEventListener('dblclick', (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (isConnected) {
    ws.close();
    isConnected = false;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    reconnectVisible = false;
    window.electronAPI.leavePetMode();
    petArea.style.display = 'none';
    setupPanel.style.display = 'flex';
    setStatus('已断开连接', '#f44336');
    btnConnect.disabled = false;
    hideInput();
    messageQueue.length = 0;
    isShowing = false;
    bubbleContainer.innerHTML = '';
  } else {
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    connect();
  }
});

// ============================================================
// 初始化
// ============================================================
loadSettings();
window.electronAPI.leavePetMode();  // 确保初始化时主进程知道当前是设置模式
console.log('[RENDERER] Init complete, electronAPI:', !!window.electronAPI);
