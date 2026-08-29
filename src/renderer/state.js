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
const btnConnect     = document.getElementById('btn-connect');
const inpServer      = document.getElementById('inp-server');
const inpNickname    = document.getElementById('inp-nickname');
const setupStatus    = document.getElementById('setup-status');
const statusBarSelf   = document.getElementById('status-bar-self');
const statusBarPeer   = document.getElementById('status-bar-peer');

// ============================================================
// 状态
// ============================================================
const MAX_QUEUE_SIZE = 50;
const MAX_MENU_HISTORY = 5;
const userId = crypto.randomUUID();
const messageQueue = [];

let ws = null;
let isConnected = false;
let reconnectTimer = null;
let reconnectVisible = false;
let isShowing = false;
let nickname = '';
let petScale = 100;
let customImages = { default: null, message: null };
let doNotDisturb = false;
let dndQueue = [];  // 勿扰期间暂存消息，最多 MAX_MENU_HISTORY 条，FIFO 覆盖

