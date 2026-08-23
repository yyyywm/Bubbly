/**
 * ============================================================
 *  Bubbly - 渲染进程（页面逻辑）
 * ============================================================
 *
 *  区域穿透：CSS -webkit-app-region 原生管理
 *  桌宠拖拽：JS mousedown/mousemove/mouseup → IPC drag-move
 *  双击桌宠 → 弹出输入框，右键桌宠 → 弹出菜单
 * ============================================================
 */

// ============================================================
// DOM 元素
// ============================================================
const setupPanel     = document.getElementById('setup-panel');
const petArea        = document.getElementById('pet-area');
const petContainer   = document.getElementById('pet-container');
const petBody        = document.getElementById('pet-body');
const petImage       = document.getElementById('pet-image');
const defaultPreview = document.getElementById('default-preview');
const messagePreview = document.getElementById('message-preview');
const fileDefault    = document.getElementById('file-default');
const fileMessage    = document.getElementById('file-message');
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
let customImages = { default: null, message: null };

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
// 自定义图片管理
// ============================================================
function loadCustomImages() {
  try {
    const saved = localStorage.getItem('bubbly_images');
    if (!saved) return;
    const s = JSON.parse(saved);
    if (s.default) customImages['default'] = s.default;
    if (s.message) customImages['message'] = s.message;
    updateImagePreviews();
  } catch (e) {
    console.warn('加载自定义图片失败:', e);
  }
}

function saveCustomImages() {
  try {
    localStorage.setItem('bubbly_images', JSON.stringify(customImages));
  } catch (e) {
    console.warn('保存自定义图片失败:', e);
    // localStorage 空间不足时清除最大项
    if (e instanceof QuotaExceededError) {
      if (customImages['default'] && customImages['message']) {
        const dLen = customImages['default'].length;
        const mLen = customImages['message'].length;
        if (dLen > mLen) {
          customImages['default'] = null;
        } else {
          customImages['message'] = null;
        }
        updateImagePreviews();
        try { localStorage.setItem('bubbly_images', JSON.stringify(customImages)); }
        catch (_) { console.warn('localStorage 已满，请清除图片后重试'); }
      }
    }
  }
}

function updateImagePreviews() {
  if (defaultPreview && customImages['default']) {
    defaultPreview.classList.add('has-image');
    let img = defaultPreview.querySelector('img');
    if (!img) { img = document.createElement('img'); defaultPreview.appendChild(img); }
    img.src = customImages['default'];
  } else if (defaultPreview) {
    defaultPreview.classList.remove('has-image');
    const img = defaultPreview.querySelector('img');
    if (img) img.remove();
  }

  if (messagePreview && customImages['message']) {
    messagePreview.classList.add('has-image');
    let img = messagePreview.querySelector('img');
    if (!img) { img = document.createElement('img'); messagePreview.appendChild(img); }
    img.src = customImages['message'];
  } else if (messagePreview) {
    messagePreview.classList.remove('has-image');
    const img = messagePreview.querySelector('img');
    if (img) img.remove();
  }
}

function updatePetDisplay() {
  if (!petBody || !petImage) return;

  if (customImages['default']) {
    petBody.classList.add('hidden');
    petImage.classList.add('visible');
    petImage.src = customImages['default'];
  } else {
    petBody.classList.remove('hidden');
    petImage.classList.remove('visible');
  }
}

function switchPetImage(action) {
  if (!customImages['default']) return;  // CSS 桌宠模式，无需切换

  if (action === 'message' && customImages['message']) {
    petImage.src = customImages['message'];
  } else if (action === 'default') {
    petImage.src = customImages['default'];
  }
}

function handleImageUpload(target, file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    setStatus('⚠️ 请选择图片文件', '#f44336');
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    setStatus('⚠️ 图片文件不能超过 2MB', '#f44336');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    customImages[target] = e.target.result;
    saveCustomImages();
    updateImagePreviews();
    if (petArea && petArea.style.display === 'block') {
      updatePetDisplay();
    }
  };
  reader.onerror = () => {
    setStatus('⚠️ 图片读取失败', '#f44336');
  };
  reader.readAsDataURL(file);
}

function resetImage(target) {
  customImages[target] = null;
  saveCustomImages();
  updateImagePreviews();
  if (petArea && petArea.style.display === 'block') {
    updatePetDisplay();
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

  const petTop = 420 - 20 - petSize;
  bubbleContainer.style.top = '50px';
  bubbleContainer.style.height = '130px';

  statusDot.style.top = (petTop - 16) + 'px';

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
      updatePetDisplay();
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
  switchPetImage('message');

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
    if (messageQueue.length === 0) switchPetImage('default');
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
  showInput();
});

// 右键桌宠 → 弹出上下文菜单
petContainer.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  e.stopPropagation();
  // 坐标由 Menu.popup({window}) 默认光标位置自动处理，
  // 无需在进程间传递，避免 DPI 缩放下的坐标系不一致问题
  window.electronAPI.showPetContextMenu();
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

// ============================================================
// 桌宠拖拽（绝对定位，无 timer）
// mousedown → 记录"鼠标按下点"的渲染器坐标（拖拽全程为常量）
// → mousemove 上报该常量点 → mouseup 结束
// -webkit-app-region: no-drag 确保 dblclick 和 contextmenu 正常触发
//
// 为何主进程用屏幕坐标(screen.getCursorScreenPoint)而非渲染器坐标：
//   渲染器里的所有坐标(pageX/clientX/movementX)都以窗口左上角为原点，
//   而窗口左上角恰恰是被 setPosition 不断改变的变量。当主进程 setPosition
//   后，静止的鼠标对渲染器而言"坐标变了"，下一次 mousemove 会再上报一个
//   伪位移 → 再 setPosition → 无限反馈循环，表现为拖拽时窗口延展变大。
//   屏幕坐标以显示器原点为基准，setPosition 不会改变它，因此定位绝对稳定。
//   渲染器只需上报一个拖拽全程不变的常量点(按下点)，主进程用屏幕坐标
//   反算窗口应处的绝对位置，一劳永逸。传常量是关键：一旦上报值随光标变化，
//   反馈循环仍会触发。
// ============================================================
let isDragging = false;
let wasDragging = false;
// 拖拽起始点的渲染器坐标（mousedown 时固定，整个拖拽过程为常量）。
// 主进程用屏幕坐标反算窗口绝对位置时，传一个"常量点"即可：
//   setPosition(cursorScreen - clickClient)
// 让 clickClient 这个点始终跟光标对齐，实现"按在哪、就在哪拖"的自然手感。
let dragClickX = 0;
let dragClickY = 0;
// 节流：每 FRAME_THROTTLE_MS 才上报一次，避免鼠标快速移动时每秒 150–300 次
// 跨进程 IPC 导致拖拽卡顿。因为 click 点是常量，丢帧不会造成定位偏差。
const FRAME_THROTTLE_MS = 16;
let lastDragSend = 0;

petContainer.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;  // 仅左键拖拽
  // 记录按下点的渲染器坐标（常量，鼠标移动时不更新；每次按下重新计算，
  // 缩放后容器尺寸/位置变化仍能正确取到新坐标系下的点）
  dragClickX = e.clientX;
  dragClickY = e.clientY;
  isDragging = true;
  wasDragging = false;
  e.preventDefault();
  petArea.style.cursor = 'grabbing';
  petContainer.style.cursor = 'grabbing';
});

document.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  wasDragging = true;
  // 节流上报：click 点是常量，丢帧不会造成定位偏差
  const now = Date.now();
  if (now - lastDragSend < FRAME_THROTTLE_MS) return;
  lastDragSend = now;
  window.electronAPI.dragMove(dragClickX, dragClickY);
});

document.addEventListener('mouseup', (e) => {
  if (!isDragging) return;
  isDragging = false;
  document.body.style.cursor = 'default';
  petContainer.style.cursor = 'grab';
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
