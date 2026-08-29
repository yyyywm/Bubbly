# Bubbly 模块化拆分实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将扁平结构（main.js / renderer.js / server.js 等 9 个根目录文件）拆分为 src/main、src/preload、src/renderer、src/server 四层目录结构，运行时行为完全不变。

**Architecture:** 纯"剪切 + 粘贴 + 路径更新"重构。渲染进程不引入打包器，各模块为经典脚本（classic scripts），由 `index.html` 按依赖顺序用 `<script>` 标签加载；主进程与服务器用 CommonJS 拆分，跨模块共享的可变状态集中在 `state.js` 中。

**Tech Stack:** Electron 28、Node.js (ws 8)、经典 HTML/CSS/JS，无构建工具。

**设计文档:** `docs/superpowers/specs/2026-08-29-modular-restructure-design.md`（已批准）

**行号基准:** 本文所有行号基于 commit `e6a5630`（`renderer.js` 805 行、`server.js` 323 行、`main.js` 373 行）。若行号漂移，以 `// ====` 分段注释与函数名为锚点。

**全局规则（每个 Task 都必须遵守）：**

- **逐字迁移**：除非步骤中明确给出"替换规则"，所有函数体、注释、空行逐字保留，不改任何逻辑。
- **AGENTS.md 提交规范**：commit 格式 `<type>(<scope>): <中文描述>`，一个逻辑单元一条 commit；`.githooks/commit-msg` 会拒绝不合规消息。
- 项目无测试框架。语法验证用 `node --check <file>`；行为验证用冒烟测试（见 Task 5）。
- 禁止遗留临时文件；每个 commit 前 `git status` 确认无非预期文件。

---

### Task 1: 拆分 server.js → src/server/

**Files:**
- Create: `src/server/handlers.js`
- Create: `src/server/index.js`
- Delete: `server.js`
- Modify: `package.json`（scripts.server）

- [ ] **Step 1: 创建 src/server/handlers.js**

骨架（完整代码，glue 部分）：

```js
/**
 * ============================================================
 *  Bubbly - 信令服务器 · 业务逻辑处理
 * ============================================================
 *  join / message / dnd-status / leave 的消息处理函数。
 *  配对状态（clients）与相关常量集中在此模块并导出，
 *  index.js 通过解构复用，保证函数体与原 server.js 逐字一致。
 * ============================================================
 */

// ============================================================
// 常量
// ============================================================
const MAX_CLIENTS = 2;
const WS_READY_OPEN = 1;

// ============================================================
// 房间管理: 全局单房间，最多2人
// clients: [{ws, id}]
// ============================================================
let clients = [];

// ============================================================
// 业务逻辑函数
// ============================================================
```

随后将原 `server.js` L143–296（`handleJoin`、`handleMessage`、`handleDndStatus`、`handleLeave`、`leaveRoom` 五个函数，含 JSDoc 注释）**逐字**追加。文件末尾追加：

```js
module.exports = {
  clients,
  handleJoin,
  handleMessage,
  handleDndStatus,
  handleLeave,
  leaveRoom
};
```

> 注意：`clients` 只会被 push/splice（从不重新赋值），解构拿到的数组引用始终有效，这是行为不变的关键。

- [ ] **Step 2: 创建 src/server/index.js**

```js
/**
 * ============================================================
 *  Bubbly - WebSocket 信令服务器
 * ============================================================
 *  （此处保留原 server.js L1–25 的协议文档注释，唯一改动：
 *   "启动方式: node server.js" → "启动方式: npm run server"）
 * ============================================================
 */

const { WebSocketServer } = require('ws');
const http = require('http');
const {
  clients,
  handleJoin,
  handleMessage,
  handleDndStatus,
  handleLeave,
  leaveRoom
} = require('./handlers');

// ============================================================
// 常量
// ============================================================
const PORT = 8080;
const MAX_PAYLOAD = 64 * 1024;
const HEARTBEAT_INTERVAL = 30000;
```

随后**逐字**迁移原 `server.js` 的三段（函数体一行不改）：

1. L45–60：httpServer / wss / heartbeatInterval
2. L62–138：`wss.on('connection', ...)` 整段（内部对 handler 的调用名与解构名一致，无需改动）
3. L298–323：启动服务器 + 优雅关闭

- [ ] **Step 3: 语法验证**

```bash
node --check src/server/handlers.js && node --check src/server/index.js
```

预期：无输出（退出码 0）。

- [ ] **Step 4: 冒烟验证服务器行为**

```bash
node src/server/index.js
```

预期输出启动横幅（`💕 Bubbly 服务器已启动 / 端口: 8080`），Ctrl+C 输出"正在关闭…已关闭"。

- [ ] **Step 5: 删除旧文件并更新 package.json**

```bash
git rm server.js
```

`package.json` 中：

```json
"server": "node src/server/index.js"
```

- [ ] **Step 6: Commit**

```bash
git add src/server package.json
git commit -m "refactor(server): 拆分信令服务器为 index 与 handlers 模块"
```

---

### Task 2: 拆分 main.js → src/main/ + 移动 preload

**Files:**
- Create: `src/main/state.js`、`src/main/windows.js`、`src/main/tray.js`、`src/main/ipc.js`、`src/main/index.js`
- Rename: `preload.js` → `src/preload/main.js`、`input-window.preload.js` → `src/preload/input-window.js`
- Delete: `main.js`
- Modify: `package.json`（main、build.files）

**替换规则（适用于本 Task 所有逐字迁移的代码）：** 原 `main.js` 的 6 个模块级状态变量迁入 `state.js`，所有迁移代码中对它们的裸引用按下列映射机械替换，其余内容不动：

| 原标识符 | 替换为 |
|---|---|
| `mainWindow` | `S.mainWindow` |
| `petMode` | `S.petMode` |
| `winW` | `S.winW` |
| `winH` | `S.winH` |
| `inputWindow` | `S.inputWindow` |
| `petBottomOffset` | `S.petBottomOffset` |

（`tray` 变量只被 `createTrayIcon` 使用，留在 `tray.js` 内部，不进 state。）

- [ ] **Step 1: 创建 src/main/state.js**（完整文件）

```js
/**
 * ============================================================
 *  Bubbly - 主进程共享状态
 * ============================================================
 *  原 main.js 的模块级可变状态。windows/ipc 等模块通过
 *  const S = require('./state'); S.mainWindow ... 读写，
 *  与原模块级变量语义完全一致（对象属性引用，支持重新赋值）。
 * ============================================================
 */

module.exports = {
  mainWindow: null,
  petMode: false,
  // 窗口尺寸由渲染器通过 set-window-size IPC 通知；
  // 渲染器算好布局后发新尺寸，主进程只用这个值。
  // 这样以后桌宠缩放、加新元素、调气泡位置，主进程无需同步常量。
  winW: 280,
  winH: 340,
  inputWindow: null,
  // 桌宠可见底部距窗口顶部的偏移量，由渲染器通过 set-window-size 第三参数上报。
  // 输入窗口跟随此偏移量，紧贴桌宠可见底部，避免窗口死区造成过大间距。
  petBottomOffset: 0
};
```

- [ ] **Step 2: 创建 src/main/tray.js**

```js
/**
 * ============================================================
 *  Bubbly - 系统托盘
 * ============================================================
 */

const { app, Menu, Tray, nativeImage } = require('electron');
const path = require('path');

let tray = null;
```

随后**逐字**迁移原 `main.js` 的 `createTrayIcon` 函数（含托盘图标必须用 PNG 的注释；当前 HEAD 已是 PNG 版本）。**路径调整（第 5 处）：** 托盘图标路径 `path.join(__dirname, 'assets', 'tray-icon.png')` → `path.join(__dirname, '..', '..', 'assets', 'tray-icon.png')`（文件移入 src/main/ 后原相对路径会解析到不存在的 src/main/assets/）。末尾追加：

```js
module.exports = { createTrayIcon };
```

- [ ] **Step 3: 创建 src/main/windows.js**

```js
/**
 * ============================================================
 *  Bubbly - 窗口管理
 * ============================================================
 *  主窗口（无边框透明置顶）与独立悬浮输入窗口的创建、
 *  定位与销毁。窗口尺寸/位置状态见 state.js。
 * ============================================================
 */

const { app, BrowserWindow, Menu, screen } = require('electron');
const path = require('path');
const S = require('./state');

const INPUT_W = 260, INPUT_H = 56;
const INPUT_GAP = 6;
```

随后**逐字**迁移以下函数（应用替换规则）：

1. `updateMousePenetration`（含上方"鼠标穿透模式切换"分段注释）
2. `createWindow`（含上方"窗口创建"分段注释）
3. `positionInputWindow`、`cleanupInputWindow`（含输入窗口架构/生命周期的大段注释，注释中原样保留）

**路径调整（本步骤仅有的两处非机械改动）：**

- `createWindow` 内 preload 路径：`path.join(__dirname, 'preload.js')` → `path.join(__dirname, '..', 'preload', 'main.js')`
- `createWindow` 内 loadURL：`path.join(__dirname, 'index.html')` → `path.join(__dirname, '..', '..', 'index.html')`（Task 3 再改为 renderer 目录）

末尾追加：

```js
module.exports = {
  createWindow,
  updateMousePenetration,
  positionInputWindow,
  cleanupInputWindow,
  INPUT_W,
  INPUT_H,
  INPUT_GAP
};
```

- [ ] **Step 4: 创建 src/main/ipc.js**

```js
/**
 * ============================================================
 *  Bubbly - IPC 通道注册
 * ============================================================
 *  保留原 main.js 头部注释中的 IPC 通道清单（enter-pet-mode /
 *  leave-pet-mode / show-pet-context-menu / context-menu-items /
 *  drag-move / set-window-size / show-input-window /
 *  input-window-send / input-window-close）。
 * ============================================================
 */

const { app, ipcMain, Menu, screen, BrowserWindow } = require('electron');
const path = require('path');
const S = require('./state');
const {
  updateMousePenetration,
  positionInputWindow,
  cleanupInputWindow,
  INPUT_W,
  INPUT_H,
  INPUT_GAP
} = require('./windows');

function registerIpcHandlers() {
```

随后**逐字**迁移原 `main.js` 的全部 11 个 `ipcMain.on(...)` 注册块（enter-pet-mode、leave-pet-mode、set-window-size、show-pet-context-menu、context-menu-items-reply、pet-menu-relaunch、pet-menu-quit、drag-move、show-input-window、input-window-send、input-window-close；含各自注释，应用替换规则），包进 `registerIpcHandlers` 函数体内（整体缩进一级）。其中 `show-input-window` 处理器内新建 inputWindow 的代码：

- preload 路径：`path.join(__dirname, 'input-window.preload.js')` → `path.join(__dirname, '..', 'preload', 'input-window.js')`
- loadURL：`path.join(__dirname, 'input-window.html')` → `path.join(__dirname, '..', '..', 'input-window.html')`（Task 3 再改）

末尾追加：

```js
}

module.exports = { registerIpcHandlers };
```

- [ ] **Step 5: 创建 src/main/index.js**（完整骨架）

```js
/**
 * ============================================================
 *  Bubbly - Electron 主进程入口
 * ============================================================
 *  保留原 main.js 头部注释中的核心功能清单与方案说明。
 * ============================================================
 */

const { app, BrowserWindow, screen } = require('electron');
console.log('[MAIN] electron=' + process.versions.electron);

// ============================================================
// 初始化
// ============================================================
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('transparent-window-background', '#00000000');
}

const S = require('./state');
const { createTrayIcon } = require('./tray');
const { createWindow } = require('./windows');
const { registerIpcHandlers } = require('./ipc');

// IPC 通道在模块加载时注册（与原 main.js 顶层 ipcMain.on 时序一致）
registerIpcHandlers();
```

随后**逐字**迁移原 `main.js` 的"应用生命周期"段（单实例锁、`app.whenReady`、`window-all-closed`、`activate`），应用替换规则（`mainWindow` → `S.mainWindow`）。

- [ ] **Step 6: 移动 preload 文件**

```bash
mkdir -p src/preload
git mv preload.js src/preload/main.js
git mv input-window.preload.js src/preload/input-window.js
```

两个 preload 文件内容**不改**（它们不引用任何相对路径）。

- [ ] **Step 7: 更新 package.json**

```json
"main": "src/main/index.js",
```

`build.files` 改为：

```json
"files": [
  "src/**",
  "assets/**",
  "package.json"
]
```

- [ ] **Step 8: 语法验证**

```bash
node --check src/main/state.js && node --check src/main/windows.js && node --check src/main/tray.js && node --check src/main/ipc.js && node --check src/main/index.js && node --check src/preload/main.js && node --check src/preload/input-window.js
```

预期：无输出。

- [ ] **Step 9: 删除旧文件并验证应用启动**

```bash
git rm main.js
npm start
```

预期：应用正常启动，设置面板显示，托盘图标可见（粉色心形），控制台无报错。验证后关闭应用。

- [ ] **Step 10: Commit**

```bash
git add src package.json
git commit -m "refactor(main): 拆分主进程为 state/windows/tray/ipc 模块"
```

---

### Task 3: 拆分 renderer.js → src/renderer/

**Files:**
- Rename: `index.html` → `src/renderer/index.html`、`styles.css` → `src/renderer/styles.css`、`input-window.html` → `src/renderer/input-window/index.html`、`input-window.js` → `src/renderer/input-window/renderer.js`
- Create: `src/renderer/` 下 11 个 js 模块
- Delete: `renderer.js`
- Modify: `src/main/windows.js`、`src/main/ipc.js` 中的两个 loadURL 路径

**渲染模块边界（行号基于 commit e6a5630 的 renderer.js，锚点为准）：**

| 目标文件 | 来源（renderer.js） | 内容 |
|---|---|---|
| `state.js` | L12–50 | DOM 元素 + 状态（两段 `// ====` 含注释） |
| `settings.js` | L51–86 | 持久化设置 |
| `images.js` | L87–207 | 自定义图片管理 |
| `layout.js` | L208–281 | 缩放 |
| `connection.js` | L282–388 + L429–440 + L702–715 | WebSocket + 两段纯注释 + onInputWindowMessage |
| `bubble.js` | L389–428 | 消息气泡 |
| `status.js` | L441–474 | UI 状态 |
| `dnd.js` | L527–562 | 勿扰模式 |
| `menu.js` | L503–526 + L563–642 | 菜单项 IPC 回调 ×2 + 菜单模板与动作监听 |
| `drag.js` | L643–701 | 桌宠拖拽 |
| `index.js` | L1–10 + L475–502 + L716–805 | 文件头 + 双击/右键桌宠 + 按钮与状态光条事件 + 初始化 |

- [ ] **Step 1: 移动静态文件**

```bash
mkdir -p src/renderer/input-window
git mv index.html src/renderer/index.html
git mv styles.css src/renderer/styles.css
git mv input-window.html src/renderer/input-window/index.html
git mv input-window.js src/renderer/input-window/renderer.js
```

`styles.css` 内容不改。`src/renderer/index.html` 中 `<link rel="stylesheet" href="styles.css">` 同目录无需改。

- [ ] **Step 2: 修改 src/renderer/input-window/index.html**

```html
<script src="input-window.js"></script>
```

改为：

```html
<script src="renderer.js"></script>
```

- [ ] **Step 3: 拆分 renderer.js 为 11 个模块**

按上表边界**逐字**复制各段到目标文件（纯剪切粘贴，无 glue、无替换规则——经典脚本的全局函数/变量机制与原单文件完全一致）。每个文件以对应分段原有的 `// ====` 注释开头。

`index.js` 的文件头注释中"区域穿透/桌宠拖拽"说明原样保留，并在头部注释末尾追加一行加载顺序说明：

```js
 *  模块加载顺序见 index.html 底部 <script> 标签：
 *  state → settings → images → layout → bubble → status
 *  → dnd → menu → connection → drag → index
```

- [ ] **Step 4: 替换 src/renderer/index.html 的脚本引用**

将：

```html
<script src="renderer.js"></script>
```

替换为（顺序即依赖顺序，不得调整）：

```html
<script src="state.js"></script>
<script src="settings.js"></script>
<script src="images.js"></script>
<script src="layout.js"></script>
<script src="bubble.js"></script>
<script src="status.js"></script>
<script src="dnd.js"></script>
<script src="menu.js"></script>
<script src="connection.js"></script>
<script src="drag.js"></script>
<script src="index.js"></script>
```

- [ ] **Step 5: 更新主进程中的页面路径**

`src/main/windows.js`（createWindow 内）：

```js
mainWindow.loadURL('file://' + path.join(__dirname, '..', 'renderer', 'index.html'));
```

`src/main/ipc.js`（show-input-window 内）：

```js
const inputUrl = 'file://' + path.join(__dirname, '..', 'renderer', 'input-window', 'index.html');
```

- [ ] **Step 6: 语法验证**

```bash
for f in src/renderer/*.js src/renderer/input-window/renderer.js; do node --check "$f" || exit 1; done
```

预期：无输出。（renderer 文件引用 document/window 但 `node --check` 只做语法解析，不执行。）

- [ ] **Step 7: 删除旧文件并验证应用**

```bash
git rm renderer.js
npm start
```

预期：应用正常启动，设置面板完整显示（样式正常），DevTools 控制台输出 `[RENDERER] Init complete, electronAPI: true`，无 404 / ReferenceError。验证后关闭。

- [ ] **Step 8: Commit**

```bash
git add src
git commit -m "refactor(renderer): 拆分渲染进程为多个职责模块"
```

---

### Task 4: 同步 README 文档

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 更新"项目结构"一节**

替换为新的 src/ 四层结构树（与设计文档"目标结构"一节一致，去掉 main 下已拆分的旧文件名）。

- [ ] **Step 2: 更新"项目配置"一节的路径引用**

- "服务器端口（`server.js`）" → "服务器端口（`src/server/index.js` 的 `PORT`）"
- "窗口尺寸（`main.js`）" → "窗口初始尺寸（`src/main/state.js` 的 `winW` / `winH`）"
- "桌面位置（`main.js`）" → "窗口初始位置（`src/main/windows.js` 的 `createWindow`）"
- "气泡停留时间（`renderer.js`）" → "气泡停留时间（`src/renderer/bubble.js`）"

- [ ] **Step 3: 全文扫描残留旧路径**

```bash
grep -n "renderer\.js\|server\.js\|main\.js\|preload\.js\|input-window\." README.md
```

凡指向旧根目录文件的描述一并更新为 src/ 新路径（"常见问题"等章节同理）。

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: 同步 README 项目结构与新路径"
```

---

### Task 5: 最终冒烟验证（不产生 commit）

- [ ] **Step 1: 启动服务器**

```bash
npm run server
```

预期：启动横幅正常。

- [ ] **Step 2: 启动两个客户端**

```bash
npm start                          # 终端 1
./node_modules/.bin/electron . --no-single-instance   # 终端 2
```

- [ ] **Step 3: 功能清单逐项验证**

1. 托盘图标可见（粉色心形），右键有"重启应用 / 退出"
2. 双方填 `ws://localhost:8080` + 昵称，连接成功，状态微光条变绿
3. 一方双击桌宠 → 悬浮输入窗口出现在桌宠正下方，Enter 发送 → 对方气泡弹出
4. 拖拽桌宠移动，输入窗口跟随
5. 设置面板切换 小/中/大/特大，桌宠缩放且窗口尺寸自适应
6. 右键菜单：勿扰开关（🌙）、历史、返回设置、重启、退出均正常
7. 勿扰期间收到的消息在关闭勿扰后一次性重放
8. 双击状态光条返回设置面板
9. 断网/关服务器后 5s 自动重连提示正常

- [ ] **Step 4: 检查工作区干净**

```bash
git status
```

预期：无未跟踪/未提交的残留文件。然后 `git push`。

---

## Self-Review 记录

- **Spec 覆盖**：目标结构（Task 1–3）、配置同步（Task 2 Step 7、Task 3 Step 5）、文档同步（Task 4）、冒烟验证（Task 5）均有对应任务。
- **占位符扫描**：所有 glue 代码完整给出；逐字迁移段落给出精确行号锚点与起止函数名。
- **一致性检查**：`state.js` 导出属性名（mainWindow/petMode/winW/winH/inputWindow/petBottomOffset）与替换规则表一致；renderer 加载顺序在两个 HTML 改动点与设计文档一致；preload 新路径 `src/preload/main.js`、`src/preload/input-window.js` 在 Task 2 Step 3/4 与 Step 6 一致。
