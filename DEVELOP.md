# 💻 开发指南

## 目录

- [开发环境](#开发环境)
- [架构概览](#架构概览)
- [IPC 通信协议](#ipc-通信协议)
- [拖拽与穿透方案](#拖拽与穿透方案)
- [常见问题](#常见问题)

## 开发环境

### 依赖安装

```bash
npm install
```

### Electron 二进制下载加速

```bash
# macOS
export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
# Windows (PowerShell)
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
```

### 启动命令

```bash
# 服务器
npm run server    # 或 node server.js

# 客户端
npm start         # 或 electron .

# 测试
node test-server.js
```

## 架构概览

```
┌──────────────────────────────────────────────────┐
│  Electron 主进程 (main.js)                        │
│  ┌─────────────────────────────────────────────┐ │
│  │ BrowserWindow (透明置顶，无边框)              │ │
│  │   ┌──────────────────────────────────────┐   │ │
│  │   │ 渲染进程 (renderer.js + index.html)  │   │ │
│  │   │   ┌───────────────────────────────┐   │   │ │
│  │   │   │ 设置面板  →  桌宠模式           │   │   │ │
│  │   │   │ 双击 → 输入框 → 发送消息        │   │   │ │
│  │   │   │ 消息气泡队列                    │   │   │ │
│  │   │   └───────────────────────────────┘   │   │ │
│  │   └──────────────────────────────────────┘   │ │
│  │              ↕ IPC (preload.js, 仅 3 条)     │ │
│  │   enterPetMode / leavePetMode               │ │
│  │   petInputVisible                           │ │
│  └─────────────────────────────────────────────┘ │
│  │  CSS -webkit-app-region: drag → 原生拖拽    │ │
│  │  零 timer，零 IPC 拖拽通信                  │ │
│  │              ↕                                    │
│  │  Tray Menu (菜单栏心形图标)                        │
└──────────────────────────────────────────────────┘
               ↕ WebSocket (ws://localhost:8080)
┌──────────────────────────────────────────────────┐
│  WebSocket 服务器 (server.js)                      │
│  ┌─────────────────────────────────────────────┐ │
│  │ rooms: Map<room, [{ws, id}]>               │ │
│  │  - join / message / leave                  │ │
│  │  - welcome / peer-joined / peer-disconnected│ │
│  └─────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

### 数据流

```
客户端 A 双击桌宠 → 输入消息 → Enter 发送
  → WebSocket → 服务器
    → 广播 → WebSocket → 客户端 B
      → enqueueBubble() → showNextBubble() → 气泡显示
```

### 交互流

```
用户双击桌宠
  → showInput() → petInputVisible(true) → 主进程维持 ignore: false
    → 用户输入 → Enter
      → sendMessage() → WebSocket → 服务器 → 对方
        → hideInput() → petInputVisible(false) → 主进程维持 ignore: false
```

## IPC 通信协议（渲染进程 → 主进程）

| 通道 | 参数 | 用途 |
|------|------|------|
| `enter-pet-mode` | - | 切换到桌宠模式 |
| `leave-pet-mode` | - | 返回设置面板模式 |
| `pet-input-visible` | `true/false` | 输入面板显示/隐藏 |
| `show-pet-context-menu` | - | 桌宠右键菜单（主进程直接读取光标位置） |
| `drag-move` | `dx, dy` | 桌宠 JS 拖拽（相对移动量） |

> 与旧版相比，IPC 通道从 8 条精简为 5 条。
> 桌面区域拖拽由 CSS `-webkit-app-region: drag` 原生处理；桌宠区域因需同时支持双击和右键，使用 JS 拖拽。

## 拖拽与穿透方案

### 核心机制

使用 CSS `-webkit-app-region: drag` 标记可拖拽区域 + `setIgnoreMouseEvents` 控制穿透：

- **`-webkit-app-region: drag`**：该元素成为窗口"标题栏"，按住左键即可原生拖拽窗口，由 OS 直接处理
- **`setIgnoreMouseEvents(false)`**：窗口接收鼠标事件，`-webkit-app-region: drag` 区域可拖拽，其余区域正常交互
- 无边框窗口下 `dblclick`、`contextmenu` 等事件不受 `-webkit-app-region: drag` 影响，正常触发

### 三种模式

**设置面板模式**
```
setIgnoreMouseEvents(false)                  → 整窗口可交互
CSS: #setup-drag { -webkit-app-region: drag }  → 标题栏可拖拽
```

**桌宠模式（无输入框）**
```
setIgnoreMouseEvents(false)                  → 整窗口接收鼠标事件
CSS:
  #pet-container    { -webkit-app-region: no-drag }  → 允许 dblclick/contextmenu
  #bubble-container { -webkit-app-region: drag }     → 气泡区原生拖拽
  #status-dot       { -webkit-app-region: drag }     → 状态灯原生拖拽
  #reconnect-hint   { -webkit-app-region: drag }     → 提示原生拖拽
```

> **桌宠区域**：CSS `no-drag` → 双击/右键事件到达 DOM
> **桌宠拖拽**：JS `mousedown` → `mousemove` → `IPC drag-move(dx, dy)` → `setPosition`
> **气泡/状态灯/提示**：CSS `drag` → OS 原生拖拽

**桌宠模式（有输入框）**
```
setIgnoreMouseEvents(false)                  → 整窗口可交互
CSS:
  #input-panel     { -webkit-app-region: drag }  → 面板区域可拖拽
  #input-panel input  { -webkit-app-region: no-drag }  → 输入框不能拖拽
  #input-panel .send-btn { -webkit-app-region: no-drag }  → 按钮不能拖拽
```

> **关键说明**：桌宠区域使用 `-webkit-app-region: no-drag` 而非 `drag`，
> 因为在无边框窗口中，`dblclick` 在 drag 区域会被系统拦截（Windows 触发最大化），
> 导致 `dblclick` 事件无法到达 DOM。桌宠拖拽改为 JS 驱动，`mousemove` 发送相对位移
> `drag-move(dx, dy)` 给主进程，主进程 `setPosition` 累加移动量。
> 气泡/状态灯/重连提示使用 CSS `drag` 原生拖拽。

### 区域更新时机

`setIgnoreMouseEvents()` 在以下时机调用：

| 时机 | 触发 | 状态 |
|------|------|------|
| 页面加载完成 | `did-finish-load` | 设置模式，`ignore: false` |
| 连接成功 | `enter-pet-mode` | 桌宠模式，`ignore: false` |
| 返回设置 | `leave-pet-mode` | 设置模式，`ignore: false` |
| 输入面板显隐 | `pet-input-visible` | 桌宠模式，`ignore: false` |

> 区域坐标由 CSS 自动计算，不依赖主进程坐标更新。

### 与旧方案对比

| 维度 | 旧方案（鼠标轮询） | 新方案（-webkit-app-region） |
|------|------|------|
| 拖拽方式 | IPC dragMove → setPosition | OS 原生拖拽 |
| 区域穿透 | 50ms timer 轮询 | CSS 原生标记 |
| CPU 开销 | 持续 timer + 频繁 IPC | 零 timer，零 IPC |
| 首次拖拽延迟 | CPU 冷启动 → 100ms+ 延迟 | 无延迟 |
| 代码量 | main.js ~200 行 + renderer.js ~150 行 | main.js ~60 行 + renderer.js ~0 行 |
| IPC 通道 | 8 条 | 3 条 |
| Electron 兼容性 | setDraggableRegions 部分版本不支持 | -webkit-app-region 自 v2 起支持 |

## 常见问题

**Q: 设置面板不可点击？**
→ 检查主进程是否设置了 `alwaysOnTop: true`
→ 检查主进程 `did-finish-load` 是否调用了 `updateMousePenetration()`

**Q: 桌宠无法拖拽？**
→ 确认 `#pet-drag-zone` 在 DOM 中（位于 `#pet-container` 内）
→ 确认 `#pet-drag-zone` 有 `-webkit-app-region: drag`
→ 尝试在桌宠上方（耳朵区域）按住鼠标拖拽

**Q: 双击桌宠无法弹出输入框？**
→ 在无边框窗口下 `dblclick` 不受 `-webkit-app-region: no-drag` 影响，应正常工作
→ 检查 `petContainer` 的 `dblclick` 事件监听是否正常

**Q: 消息气泡不显示？**
→ 检查 `renderer.js` 中 `enqueueBubble()` → `showNextBubble()` 调用链
→ 检查 CSS 中 `.bubble` 的初始 `opacity: 0` 和 `.bubble.show` 的 `opacity: 1`
