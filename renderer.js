/**
 * ============================================================
 *  Bubbly - 渲染进程（页面逻辑）
 * ============================================================
 */

// ============================================================
// DOM 元素引用
// ============================================================
const setupPanel    = document.getElementById('setup-panel');
const setupDrag     = document.getElementById('setup-drag');
const petArea       = document.getElementById('pet-area');
const petContainer  = document.getElementById('pet-container');
const petBody       = document.getElementById('pet-body');
const bubbleContainer = document.getElementById('bubble-container');
const inputPanel    = document.getElementById('input-panel');
const msgInput      = document.getElementById('msg-input');
const btnSend       = document.getElementById('btn-send');
const btnConnect    = document.getElementById('btn-connect');
const inpServer     = document.getElementById('inp-server');
const inpRoom       = document.getElementById('inp-room');
const inpNickname   = document.getElementById('inp-nickname');
const setupStatus   = document.getElementById('setup-status');
const statusDot     = document.getElementById('status-dot');
const reconnectHint = document.getElementById('reconnect-hint');

// ============================================================
// 状态变量
// ============================================================
let ws = null;
let isConnected = false;
let isSending = false;
let inputVisible = false;
let reconnectTimer = null;
const messageQueue = [];
let isShowing = false;
let nickname = '';
let petScale = 100;
const userId = 'pet_' + Math.random().toString(36).substr(2, 8);

// ============================================================
// 加载保存的设置
// ============================================================
function loadSettings() {
  try {
    const saved = localStorage.getItem('bubbly_settings');
    if (saved) {
      const settings = JSON.parse(saved);
      if (settings.serverUrl) inpServer.value = settings.serverUrl;
      if (settings.room) inpRoom.value = settings.room;
      if (settings.nickname) inpNickname.value = settings.nickname;
      if (settings.scale) {
        petScale = settings.scale;
        document.querySelectorAll('.scale-btn').forEach(btn => {
          btn.classList.toggle('active', parseInt(btn.dataset.scale) === petScale);
        });
      }
    }
  } catch (e) {
    console.warn('加载设置失败:', e);
  }
}

function saveSettings() {
  try {
    localStorage.setItem('bubbly_settings', JSON.stringify({
      serverUrl: inpServer.value,
      room: inpRoom.value,
      nickname: inpNickname.value,
      scale: petScale
    }));
  } catch (e) {
    console.warn('保存设置失败:', e);
  }
}

// ============================================================
// 缩放管理
// ============================================================
function applyScale(scale) {
  petScale = scale;
  const ratio = scale / 100;

  // 桌宠本体缩放
  petBody.style.transform = `scale(${ratio})`;
  petBody.style.transformOrigin = 'center center';
  petContainer.style.width = '150px';
  petContainer.style.height = '150px';

  // 气泡容器
  const bubbleTop = Math.max(10, 300 - 220 - 30 - Math.round(150 * ratio)) + 10;
  bubbleContainer.style.top = bubbleTop + 'px';

  // 状态指示灯
  const dotTop = 300 - Math.round(150 * ratio) + 5;
  statusDot.style.top = dotTop + 'px';

  saveSettings();
}

// ============================================================
// 区域穿透管理
// 逻辑：
//   设置面板模式 → 全屏不穿透（所有元素可点击）
//   桌宠模式    → 区域穿透（仅桌宠/气泡/输入框/状态灯可点击）
// ============================================================

function setSetupModePenetration() {
  // 设置面板模式：全屏不穿透，所有元素可交互
  window.electronAPI.disablePenetrating();
}

function updateRegions() {
  const regions = [];

  // 桌宠本体
  const petRect = petContainer.getBoundingClientRect();
  regions.push({
    x: Math.round(petRect.left),
    y: Math.round(petRect.top),
    width: Math.round(petRect.width),
    height: Math.round(petRect.height)
  });

  // 气泡（显示时）
  if (isShowing) {
    const bubbleRect = bubbleContainer.getBoundingClientRect();
    regions.push({
      x: Math.round(bubbleRect.left),
      y: Math.round(bubbleRect.top),
      width: Math.round(bubbleRect.width),
      height: Math.round(bubbleRect.height)
    });
  }

  // 输入面板（显示时）
  if (inputVisible) {
    const inputRect = inputPanel.getBoundingClientRect();
    regions.push({
      x: Math.round(inputRect.left),
      y: Math.round(inputRect.top),
      width: Math.round(inputRect.width),
      height: Math.round(inputRect.height)
    });
  }

  // 重连提示（显示时）
  if (reconnectHint.style.display !== 'none') {
    const connRect = reconnectHint.getBoundingClientRect();
    regions.push({
      x: Math.round(connRect.left),
      y: Math.round(connRect.top),
      width: Math.round(connRect.width),
      height: Math.round(connRect.height)
    });
  }

  // 状态指示灯
  const dotRect = statusDot.getBoundingClientRect();
  regions.push({
    x: Math.round(dotRect.left) - 6,
    y: Math.round(dotRect.top) - 6,
    width: Math.round(dotRect.width) + 12,
    height: Math.round(dotRect.height) + 12
  });

  window.electronAPI.setNonPenetratingRegion(regions);
}

// ============================================================
// WebSocket 连接管理
// ============================================================

function connect() {
  const serverUrl = inpServer.value.trim();
  const room = inpRoom.value.trim();

  if (!serverUrl) {
    setupStatus.textContent = '⚠️ 请输入服务器地址';
    setupStatus.style.color = '#f44336';
    return;
  }
  if (!room) {
    setupStatus.textContent = '⚠️ 请输入房间号';
    setupStatus.style.color = '#f44336';
    return;
  }

  nickname = inpNickname.value.trim() || userId;
  saveSettings();

  setupStatus.textContent = '正在连接服务器…';
  setupStatus.style.color = '#666';
  btnConnect.disabled = true;

  if (ws) ws.close();

  try {
    ws = new WebSocket(serverUrl);

    ws.onopen = () => {
      console.log('WebSocket 已连接');
      ws.send(JSON.stringify({ type: 'join', room, id: userId }));
    };

    ws.onmessage = (event) => {
      handleMessage(JSON.parse(event.data));
    };

    ws.onclose = () => {
      console.log('WebSocket 已断开');
      isConnected = false;
      updateStatusUI();
      if (petArea.style.display !== 'none') {
        showReconnectHint();
        updateRegions();
        scheduleReconnect();
      }
    };

    ws.onerror = () => {
      console.error('WebSocket 错误');
      setupStatus.textContent = '⚠️ 连接失败，请检查服务器地址';
      setupStatus.style.color = '#f44336';
      btnConnect.disabled = false;
      if (petArea.style.display !== 'none') {
        showReconnectHint();
        updateRegions();
        scheduleReconnect();
      }
    };
  } catch (e) {
    setupStatus.textContent = '⚠️ 连接参数错误: ' + e.message;
    setupStatus.style.color = '#f44336';
    btnConnect.disabled = false;
  }
}

function handleMessage(data) {
  switch (data.type) {
    case 'welcome':
      console.log('加入房间成功:', data.room);
      isConnected = true;
      // 切换到桌宠模式：窗口变透明、置顶
      window.electronAPI.enterPetMode();
      setupPanel.style.display = 'none';
      petArea.style.display = 'block';
      updateStatusUI();
      applyScale(petScale);
      updateRegions();
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
        setupStatus.textContent = '⚠️ ' + data.msg;
        setupStatus.style.color = '#f44336';
      }
      btnConnect.disabled = false;
      break;
  }
}

// ============================================================
// 消息气泡
// ============================================================

function enqueueBubble(text) {
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

  updateRegions();

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
    updateRegions();
    showNextBubble();
  }, 2850);
}

// ============================================================
// 发送消息
// ============================================================

function sendMessage() {
  if (isSending) return;
  const text = msgInput.value.trim();
  if (!text) return;
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  isSending = true;
  ws.send(JSON.stringify({
    type: 'message',
    room: inpRoom.value.trim(),
    id: userId,
    text: text
  }));
  isSending = false;
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
  updateRegions();
}

function hideInput() {
  if (!inputVisible) return;
  inputVisible = false;
  inputPanel.style.display = 'none';
  msgInput.blur();
  updateRegions();
}

// ============================================================
// 状态
// ============================================================

function updateStatusUI() {
  if (isConnected) {
    statusDot.className = 'online';
    reconnectHint.style.display = 'none';
  } else {
    statusDot.className = 'offline';
  }
  if (petArea.style.display !== 'none') {
    updateRegions();
  }
}

function showReconnectHint() {
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
// 拖拽
// ============================================================

let isDragging = false;
let dragButton = null;

function startDrag(e, button) {
  e.preventDefault();
  isDragging = true;
  dragButton = button;

  if (button === 2) {
    petContainer.style.cursor = 'grabbing';
  } else {
    document.body.style.cursor = 'grabbing';
  }

  window.electronAPI.disablePenetrating();
  window.electronAPI.dragStart(e.screenX, e.screenY);
}

// 设置面板：左键拖拽标题栏区域
setupDrag.addEventListener('mousedown', (e) => {
  startDrag(e, 0);
});

// 桌宠：右键拖拽
petContainer.addEventListener('mousedown', (e) => {
  if (e.button === 2) startDrag(e, 2);
});

document.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  window.electronAPI.dragMove(e.screenX, e.screenY);
});

document.addEventListener('mouseup', (e) => {
  if (!isDragging) return;
  if (e.button !== dragButton) return;

  isDragging = false;
  document.body.style.cursor = 'default';
  petContainer.style.cursor = 'default';
  window.electronAPI.dragEnd();

  // 根据当前模式恢复穿透
  if (petArea.style.display !== 'none') {
    // 桌宠模式：区域穿透
    updateRegions();
  }
  // 设置面板模式：不穿透（由初始状态保证，无需额外操作）
});

document.addEventListener('contextmenu', (e) => e.preventDefault());

// ============================================================
// 双击桌宠
// ============================================================

petContainer.addEventListener('dblclick', (e) => {
  e.preventDefault();
  e.stopPropagation();
  showInput();
});

// 输入框失去焦点即隐藏
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
    if (petArea.style.display !== 'none') {
      applyScale(petScale);
      updateRegions();
    }
  });
});

// ============================================================
// 连接按钮
// ============================================================
btnConnect.addEventListener('click', connect);

// ============================================================
// 初始化
// ============================================================
loadSettings();
// 确保设置面板模式全屏不穿透
setSetupModePenetration();
console.log('[RENDERER] Init complete, electronAPI:', !!window.electronAPI);

// 调试：监听设置面板鼠标事件
setupPanel.addEventListener('mousemove', (e) => {
  if (!setupPanel._mouseLogTimer) {
    console.log('[RENDERER] Mouse move on setup-panel');
    setupPanel._mouseLogTimer = setTimeout(() => { setupPanel._mouseLogTimer = null; }, 2000);
  }
});

btnConnect.addEventListener('mousedown', (e) => {
  console.log('[RENDERER] Mousedown on btn-connect');
});