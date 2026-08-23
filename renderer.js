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
const peerDndDot     = document.getElementById('peer-dnd-dot');

// ============================================================
// 状态
// ============================================================
const MAX_QUEUE_SIZE = 50;
const MAX_MENU_HISTORY = 5;
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
let doNotDisturb = false;
let dndQueue = [];  // 勿扰期间暂存消息，最多 MAX_MENU_HISTORY 条，FIFO 覆盖

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
    if (typeof s.scale === 'number') {
      petScale = s.scale;
      document.querySelectorAll('.scale-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.scale) === petScale);
      });
    }
    // 勿扰模式随会话记忆
    doNotDisturb = s.dnd === true;
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
      scale: petScale,
      dnd: doNotDisturb
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
  const petSize = Math.round(120 * ratio);
  // pet-body 基底 150px 通过 scale(0.8*ratio) 缩到 120px 视觉尺寸，
  // 内部耳朵/眼睛/鼻子等绝对定位无需改动
  const bodyScale = ratio * 0.8;

  // 间距与固定高度（全部基于 ratio 缩放，除间距外）
  const BUBBLE_H = Math.round(42 * ratio);        // 气泡容器高度
  const BUBBLE_TO_DOT_GAP = 6;                     // 气泡底 → 状态灯顶
  const STATUS_DOT_H = 8;                          // 状态灯高度（固定，不缩放）
  const DOT_TO_PET_GAP = 10;                       // 状态灯底 → 桌宠顶
  const PET_BOTTOM = 10;                           // 桌宠底 → 输入框顶
  const INPUT_GAP = 4;                             // 输入框内容额外内边距
  const INPUT_H = Math.round(35 * ratio);          // 输入框高度
  const SIDE_MARGIN = 20;                          // 桌宠左右边距

  const inputSpace = INPUT_GAP + INPUT_H;
  // 从上到下：[气泡 BUBBLE_H] [间距] [状态灯 STATUS_DOT_H] [间距] [桌宠 petSize] [PET_BOTTOM] [INPUT_GAP] [输入框 INPUT_H]
  const petTop = BUBBLE_H + BUBBLE_TO_DOT_GAP + STATUS_DOT_H + DOT_TO_PET_GAP;
  const winW = petSize + SIDE_MARGIN * 2;
  const winH = petTop + petSize + PET_BOTTOM + inputSpace;

  petBody.style.transform = `scale(${bodyScale})`;
  petBody.style.transformOrigin = 'center center';
  petContainer.style.width = petSize + 'px';
  petContainer.style.height = petSize + 'px';
  // 用 top 定位代替 CSS 的 bottom，避免 CSS bottom:10px 的参考点依赖 pet-area 显式 height
  petContainer.style.bottom = '';
  petContainer.style.top = petTop + 'px';

  // 同步 #pet-area 尺寸：让所有 bottom 定位有正确的参考点，也让 setWindowSize 与 DOM 一致
  petArea.style.width = winW + 'px';
  petArea.style.height = winH + 'px';

  // 气泡容器：贴在窗口顶部
  bubbleContainer.style.top = '0px';
  bubbleContainer.style.height = BUBBLE_H + 'px';
  bubbleContainer.style.width = winW + 'px';

  // 输入框宽度跟随窗口
  inputPanel.style.width = winW + 'px';

  // 状态灯：在气泡下方
  statusDot.style.top = (BUBBLE_H + BUBBLE_TO_DOT_GAP) + 'px';
  if (peerDndDot) {
    peerDndDot.style.top = (BUBBLE_H + BUBBLE_TO_DOT_GAP) + 'px';
    peerDndDot.style.left = (50 + 10) + '%';
  }

  window.electronAPI.setWindowSize(winW, winH);
  saveSettings();
}

function resetSetupWindowSize() {
  window.electronAPI.setWindowSize(280, 340);
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
      peerDndDot.className = 'peer-dnd-dot';
      // 刚加入房间，主动广播当前用户的勿扰状态，让对方立刻看到状态灯变化
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
      statusDot.className = 'offline';
      peerDndDot.className = 'peer-dnd-dot offline';
      break;

    case 'peer-joined':
      // 对方回来了：主状态灯反映【自己】的状态（联网 = 绿灯，自己 DND = 黄灯）
      statusDot.className = 'online' + (doNotDisturb ? ' dnd' : '');
      peerDndDot.className = 'peer-dnd-dot';
      break;

    case 'dnd-status':
      // 只处理对方的 DND 状态，通过 peerDndDot 显示；不触碰主状态灯
      if (data.from !== userId) {
        peerDndDot.className = data.dnd === true
          ? 'peer-dnd-dot dnd'
          : 'peer-dnd-dot';
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
    // 主状态灯反映【自己】的状态：已连接 = 绿灯；自己开启勿扰 = 黄灯
    statusDot.className = 'online' + (doNotDisturb ? ' dnd' : '');
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
    resetSetupWindowSize();
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
  ws.send(JSON.stringify({ type: 'dnd-status', room: currentRoom, id: userId, dnd }));
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

// 构建当前桌宠右键菜单的模板（由主进程渲染）
function buildPetContextMenuTemplate() {
  const items = [];

  // 💌 发送消息
  items.push({ label: '💌', action: 'pet-menu-send-message' });

  items.push({ type: 'separator' });

  // 🌙 勿扰开关
  if (doNotDisturb) {
    items.push({ label: '🔔', action: 'pet-menu-toggle-dnd', enabled: true });
  } else {
    items.push({ label: '🌙', action: 'pet-menu-toggle-dnd', enabled: true });
  }

  // 历史记录（最多 MAX_MENU_HISTORY 条，最近优先）
  const histLen = dndQueue.length;
  if (histLen > 0) {
    items.push({ type: 'separator' });
    const preview = dndQueue.slice().reverse();
    for (let i = 0; i < preview.length; i++) {
      const raw = String(preview[i]);
      const display = raw.length > 20 ? raw.slice(0, 20) + '…' : raw;
      items.push({
        label: display,
        action: '',
        enabled: false
      });
    }
    if (histLen > MAX_MENU_HISTORY) {
      items.push({
        label: '…更早消息未保留',
        action: '',
        enabled: false
      });
    }
    items.push({ type: 'separator' });
    items.push({
      label: '▶ 立即重放全部 ' + histLen + ' 条',
      action: 'pet-menu-replay-queue'
    });
  }

  items.push({ type: 'separator' });

  // 🏠 返回设置
  items.push({ label: '🏠', action: 'pet-menu-leave-pet-mode' });
  // 🔄 重启应用
  items.push({ label: '🔄', action: 'pet-menu-relaunch' });
  // ❌ 退出
  items.push({ label: '❌', action: 'pet-menu-quit' });

  return items;
}

// 主进程请求菜单模板：构造后通过 contextBridge 回传
window.electronAPI.onContextMenuItems(() => {
  window.electronAPI.sendContextMenuItems(buildPetContextMenuTemplate());
});

// 菜单项 IPC 回调：重启应用
window.electronAPI.onPetMenuRelaunch(() => {
  window.electronAPI.petMenuRelaunch();
});

// 菜单项 IPC 回调：退出应用
window.electronAPI.onPetMenuQuit(() => {
  window.electronAPI.petMenuQuit();
});

// 菜单项 IPC 回调：切换勿扰模式
window.electronAPI.onPetMenuToggleDnd(() => {
  toggleDnd();
});

// 菜单项 IPC 回调：立即重放队列消息
window.electronAPI.onPetMenuReplayQueue(() => {
  replayDndQueue();
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
    resetSetupWindowSize();
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
