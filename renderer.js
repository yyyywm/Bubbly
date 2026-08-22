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
const MAX_QUEUE_SIZE = 50;
const messageQueue = [];
let isShowing = false;
let reconnectVisible = false;
let nickname = '';
let petScale = 100;
const userId = crypto.randomUUID();

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
  const petSize = Math.round(150 * ratio);

  petBody.style.transform = `scale(${ratio})`;
  petBody.style.transformOrigin = 'center center';
  petContainer.style.width = petSize + 'px';
  petContainer.style.height = petSize + 'px';

  bubbleContainer.style.top = Math.max(10, 300 - 220 - petSize - 12) + 'px';
  bubbleContainer.style.height = '120px';

  const dotTop = Math.max(10, 300 - 220 - petSize - 12) + 120 + 6;
  statusDot.style.top = dotTop + 'px';

  // 通知主进程更新宠物区域坐标（用于鼠标轮询穿透）
  window.electronAPI.petRegionUpdated(petSize, petSize);

  saveSettings();
}

// ============================================================
// 区域穿透管理
// 逻辑：
//   设置面板模式 → 全屏不穿透（所有元素可点击）
//   桌宠模式    → 区域穿透（仅桌宠/气泡/输入框/状态灯可点击）
//
// 说明：区域坐标基于已知窗口尺寸（280x300）和固定布局直接计算，
//       不依赖 getBoundingClientRect()，避免透明窗口时序竞态。
// ============================================================

function setSetupModePenetration() {
  window.electronAPI.disablePenetrating();
}

// 区域穿透由主进程鼠标轮询控制，renderer 无需处理
function updateRegions() {
  // no-op：主进程通过 mousePollTimer 根据 petRegions 切换 setIgnoreMouseEvents
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
      if (petArea.style.display === 'block') {
        showReconnectHint();
        updateRegions();
        scheduleReconnect();
      }
    };

    ws.onerror = () => {
      console.error('WebSocket 错误');
      if (petArea.style.display === 'block') {
        showReconnectHint();
        updateRegions();
      } else {
        setupStatus.textContent = '⚠️ 连接失败，请检查服务器地址';
        setupStatus.style.color = '#f44336';
        btnConnect.disabled = false;
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
      window.electronAPI.enterPetMode();
      setupPanel.style.display = 'none';
      petArea.style.display = 'block';
      applyScale(petScale);
      // 用 rAF + setTimeout 双重兜底，确保布局完成后再计算区域
      // （透明窗口下 rAF 可能被跳过）
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          updateStatusUI();
          updateRegions();
        });
      });
      setTimeout(() => { updateRegions(); }, 100);
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
  petArea.style.cursor = 'default';
  // 输入时整个窗口可点（输入面板可能在窗口任意位置）
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
// 状态
// ============================================================

function updateStatusUI() {
  if (isConnected) {
    statusDot.className = 'online';
    reconnectHint.style.display = 'none';
  } else {
    reconnectVisible = false;
    reconnectHint.style.display = 'none';
    statusDot.className = 'offline';
  }
  if (petArea.style.display === 'block') {
    updateRegions();
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
// 拖拽
// ============================================================

let isDragging = false;
let lastDragTime = 0;
const DRAG_THROTTLE_MS = 30; // 约 33fps，平衡流畅度与减少视觉 artifact

function endDrag() {
  if (!isDragging) return;
  isDragging = false;
  document.body.style.cursor = 'default';
  petContainer.style.cursor = 'default';
  window.electronAPI.dragEnd();

  if (petArea.style.display === 'block') {
    // 拖拽结束后通知主进程刷新宠物区域坐标
    const petSize = Math.round(150 * (petScale || 100) / 100);
    window.electronAPI.petRegionUpdated(petSize, petSize);
  } else {
    window.electronAPI.disablePenetrating();
  }
}

function startDrag(e, button) {
  e.preventDefault();

  if (isDragging) endDrag();

  isDragging = true;
  document.body.style.cursor = 'grabbing';
  petContainer.style.cursor = 'grabbing';

  // 拖拽期间临时让窗口捕获鼠标事件（否则 setPosition 无效）
  window.electronAPI.setIgnoreMouseEvents(false, false);
  window.electronAPI.dragStart(e.screenX, e.screenY);
}

// 设置面板：左键拖拽标题栏
setupDrag.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  startDrag(e, 0);
});

// 桌宠：右键拖拽
petContainer.addEventListener('mousedown', (e) => {
  if (e.button !== 2) return;
  startDrag(e, 2);
});

document.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  // 节流：减少 setPosition 调用频率，避免透明窗口拖拽时的视觉拉伸
  const now = Date.now();
  if (now - lastDragTime < DRAG_THROTTLE_MS) return;
  lastDragTime = now;
  window.electronAPI.dragMove(e.screenX, e.screenY);
});

// mouseup 始终结束拖拽，不做 button 校验
document.addEventListener('mouseup', () => {
  endDrag();
});

// 鼠标移出窗口也结束拖拽（无边框窗口 boundary 检测）
window.addEventListener('mouseleave', (e) => {
  if (isDragging && e.relatedTarget === null) {
    endDrag();
  }
});

document.addEventListener('contextmenu', (e) => e.preventDefault());

// ============================================================
// 双击桌宠
// ============================================================

petContainer.addEventListener('dblclick', (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (!isConnected) {
    // 断开状态下双击桌宠立即重连
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
    connect();
    return;
  }
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
    if (petArea.style.display === 'block') {
      applyScale(petScale);
      updateRegions();
    }
  });
});

// ============================================================
// 连接按钮
// ============================================================
btnConnect.addEventListener('click', connect);

// 双击状态灯：已连接→返回设置，已断开→立即重连
statusDot.addEventListener('dblclick', (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (isConnected) {
    ws.close();
    isConnected = false;
    reconnectVisible = false;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    window.electronAPI.disablePenetrating();
    window.electronAPI.setIgnoreMouseEvents(false, false);
    window.electronAPI.leavePetMode();
    petArea.style.display = 'none';
    setupPanel.style.display = 'flex';
    setupStatus.textContent = '已断开连接';
    setupStatus.style.color = '#f44336';
    btnConnect.disabled = false;
    hideInput();
    messageQueue.length = 0;
    isShowing = false;
    bubbleContainer.innerHTML = '';
  } else {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
    connect();
  }
});

// ============================================================
// 初始化
// ============================================================
loadSettings();
// 确保设置面板模式全屏不穿透
setSetupModePenetration();
console.log('[RENDERER] Init complete, electronAPI:', !!window.electronAPI);

