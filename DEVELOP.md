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
│  │              ↕ IPC (preload.js, 仅 4 条)     │ │
│  │   enterPetMode / leavePetMode               │ │
│  │   petRegionUpdated / petInputVisible        │ │
│  └─────────────────────────────────────────────┘ │
│  │  setDraggableRegions() → 原生拖拽 + 区域穿透 │ │
│  │  无轮询，无 timer，无 IPC drag 通信          │ │
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
  → showInput() → petInputVisible(true) → 主进程切换为全交互
    → 用户输入 → Enter
      → sendMessage() → WebSocket → 服务器 → 对方
        → hideInput() → petInputVisible(false) → 主进程恢复区域穿透
```

## IPC 通信协议（渲染进程 → 主进程）

| 通道 | 参数 | 用途 |
|------|------|------|
| `enter-pet-mode` | - | 切换到桌宠模式（区域穿透） |
| `leave-pet-mode` | - | 返回设置面板模式（全屏交互） |
| `pet-region-updated` | `{petW, petH}` | 更新桌宠尺寸 → 重新计算拖拽区域 |
| `pet-input-visible` | `true/false` | 输入面板显示/隐藏 → 切换交互模式 |

> 与旧版相比，IPC 通道从 8 条精简为 4 条。
> 拖拽完全由 `setDraggableRegions()` 原生处理，无需 IPC。

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
  #pet-container  { -webkit-app-region: drag }  → 左键拖拽窗口
  #bubble-container { -webkit-app-region: drag }  → 左键拖拽窗口
  #status-dot     { -webkit-app-region: drag }  → 左键拖拽窗口
  #reconnect-hint { -webkit-app-region: drag }  → 左键拖拽窗口
  其余区域自然无响应（透明背景）
```

**桌宠模式（有输入框）**
```
setIgnoreMouseEvents(false)                  → 整窗口可交互
CSS:
  #input-panel  { -webkit-app-region: drag }  → 面板区域可拖拽
  #input-panel input { -webkit-app-region: no-drag }  → 输入框不能拖拽
  #input-panel .send-btn { -webkit-app-region: no-drag }  → 按钮不能拖拽
```

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
→ 确认 `#pet-container` 有 `-webkit-app-region: drag`
→ 确认主进程 `enter-pet-mode` IPC 已收到

**Q: 双击桌宠无法弹出输入框？**
→ 在无边框窗口下 `dblclick` 不受 `-webkit-app-region: drag` 影响，应正常工作
→ 检查 `petContainer` 的 `dblclick` 事件监听是否正常

**Q: 消息气泡不显示？**
→ 检查 `renderer.js` 中 `enqueueBubble()` → `showNextBubble()` 调用链
→ 检查 CSS 中 `.bubble` 的初始 `opacity: 0` 和 `.bubble.show` 的 `opacity: 1`
