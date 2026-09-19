/**
 * ============================================================
 *  Bubbly - ESLint 扁平配置
 * ============================================================
 *  运行: npm run lint
 *
 *  代码分层与检查策略：
 *  - src/main / src/preload / src/server / tests
 *      CommonJS + Node.js 环境，完整检查（含 no-undef）。
 *  - src/renderer/**
 *      经典脚本（无打包器，由 index.html <script> 按依赖顺序
 *      加载），跨模块共享顶层标识符，等价于浏览器全局变量。
 *      共享标识符统一登记在 RENDERER_SHARED_GLOBALS，
 *      新增跨模块共享的变量/函数时需同步登记。
 * ============================================================
 */

const js = require('@eslint/js');

/** 渲染进程经典脚本间共享的全局标识符（按定义文件分组） */
const RENDERER_SHARED_GLOBALS = {
  // state.js —— DOM 引用与共享状态（最先加载）
  setupPanel: 'writable',
  petArea: 'writable',
  petContainer: 'writable',
  petBody: 'writable',
  petImage: 'writable',
  defaultPreview: 'writable',
  messagePreview: 'writable',
  fileDefault: 'writable',
  fileMessage: 'writable',
  bubbleContainer: 'writable',
  btnConnect: 'writable',
  inpServer: 'writable',
  inpNickname: 'writable',
  setupStatus: 'writable',
  statusBarSelf: 'writable',
  statusBarPeer: 'writable',
  reconnectHint: 'writable',
  MAX_QUEUE_SIZE: 'writable',
  MAX_MENU_HISTORY: 'writable',
  userId: 'writable',
  messageQueue: 'writable',
  ws: 'writable',
  isConnected: 'writable',
  reconnectTimer: 'writable',
  reconnectVisible: 'writable',
  isShowing: 'writable',
  nickname: 'writable',
  petScale: 'writable',
  customImages: 'writable',
  doNotDisturb: 'writable',
  dndQueue: 'writable',

  // settings.js
  loadSettings: 'writable',
  saveSettings: 'writable',

  // images.js
  loadCustomImages: 'writable',
  saveCustomImages: 'writable',
  updateImagePreviews: 'writable',
  updatePetDisplay: 'writable',
  switchPetImage: 'writable',
  handleImageUpload: 'writable',
  resetImage: 'writable',

  // layout.js
  computeLayout: 'writable',
  applyScale: 'writable',
  resetSetupWindowSize: 'writable',

  // bubble.js
  enqueueBubble: 'writable',
  showNextBubble: 'writable',

  // status.js
  setStatus: 'writable',
  updateStatusUI: 'writable',
  showReconnectHint: 'writable',
  scheduleReconnect: 'writable',

  // dnd.js
  toggleDnd: 'writable',
  broadcastDndStatus: 'writable',
  replayDndQueue: 'writable',
  enqueueDndQueue: 'writable',

  // menu.js
  buildPetContextMenuTemplate: 'writable',

  // connection.js
  connect: 'writable',
  handleMessage: 'writable',

  // drag.js —— 拖拽状态（index.js 双击事件依赖 wasDragging）
  isDragging: 'writable',
  wasDragging: 'writable',
  dragClickX: 'writable',
  dragClickY: 'writable',
  FRAME_THROTTLE_MS: 'writable',
  lastDragSend: 'writable',

  // index.js（入口，最后加载）
  statusBar: 'writable'
};

const nodeCommon = {
  ecmaVersion: 2023,
  sourceType: 'commonjs'
};

const nodeGlobals = {
  process: 'writable',
  console: 'writable',
  setTimeout: 'writable',
  clearTimeout: 'writable',
  setInterval: 'writable',
  clearInterval: 'writable',
  Buffer: 'writable',
  fetch: 'writable',
  __dirname: 'readonly',
  __filename: 'readonly'
};

const browserGlobals = {
  window: 'writable',
  document: 'writable',
  console: 'writable',
  crypto: 'writable',
  localStorage: 'writable',
  FileReader: 'writable',
  Image: 'writable',
  WebSocket: 'writable',
  requestAnimationFrame: 'writable',
  setTimeout: 'writable',
  clearTimeout: 'writable'
};

module.exports = [
  {
    ignores: ['node_modules/**', 'dist/**', 'out/**', 'build/**', 'assets/**']
  },
  js.configs.recommended,
  {
    // 本配置文件自身：CommonJS + Node 环境
    files: ['eslint.config.js'],
    languageOptions: {
      ...nodeCommon,
      globals: nodeGlobals
    }
  },
  {
    // 主进程 / preload / 信令服务器 / 测试 / 本地脚本：CommonJS + Node 环境
    files: ['src/main/**/*.js', 'src/preload/**/*.js', 'src/server/**/*.js', 'tests/**/*.js', 'scripts/**/*.js'],
    languageOptions: {
      ...nodeCommon,
      globals: nodeGlobals
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
    }
  },
  {
    // 渲染进程：经典脚本 + 浏览器环境 + 跨模块共享全局。
    // 经典脚本通过顶层标识符在文件间共享状态（无导入导出），
    // no-redeclare / no-unused-vars 在此分层下必然误报，故关闭；
    // 拼写错误防护由 no-undef + RENDERER_SHARED_GLOBALS 登记承担。
    files: ['src/renderer/**/*.js'],
    ignores: ['src/renderer/input-window/**'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: { ...browserGlobals, ...RENDERER_SHARED_GLOBALS }
    },
    rules: {
      'no-redeclare': 'off',
      'no-unused-vars': 'off'
    }
  },
  {
    // 输入窗口渲染脚本：独立窗口，无主渲染层共享全局
    files: ['src/renderer/input-window/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: browserGlobals
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
    }
  }
];
