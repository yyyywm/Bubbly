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

使用 Electron `BrowserWindow.setDraggableRegions()` 定义"标题栏区域"：

- **可拖拽区域**：按住鼠标即可原生拖拽窗口，由 OS 直接处理
- **非可拖拽区域 + `setIgnoreMouseEvents(true, {forward: true})`**：鼠标事件透传到底层窗口

### 两种模式

**设置面板模式**
```
setIgnoreMouseEvents(false)                 → 整窗口可交互
setDraggableRegions([{x:0, y:0, w:280, h:45}])  → 仅标题栏可拖拽
```

**桌宠模式（无输入框）**
```
setIgnoreMouseEvents(true, {forward: true})  → 默认穿透
setDraggableRegions([
  {bubble区域},   // 可点击 + 可拖拽
  {dot区域},      // 双击返回设置
  {pet区域},      // 右键拖拽 + 双击发送
  {hint区域}      // 双击重连
])
```

**桌宠模式（有输入框）**
```
setIgnoreMouseEvents(false)                 → 整窗口可交互
setDraggableRegions([{x:0, y:0, w:280, h:300}])  → 整窗口可拖拽
```

### 区域坐标计算

所有区域坐标基于窗口坐标（280×300），使用常量计算，与 CSS 布局保持同步：

```js
// 桌宠：bottom: 20px, left: 50%
const petX = (WIN_W - petW) / 2;
const petY = WIN_H - PET_OFFSET_BOTTOM - petH;

// 气泡容器：top 由 scale 动态计算
const bubbleTop = max(10, WIN_H - 220 - petH - 12);
const bubbleX = (WIN_W - 220) / 2;
```

### 区域更新时机

`setDraggableRegions()` 在以下时机调用：

| 时机 | 触发 | 影响 |
|------|------|------|
| 页面加载完成 | `did-finish-load` | 初始化为设置模式 |
| 连接成功 | `enter-pet-mode` | 切换为桌宠模式 |
| 返回设置 | `leave-pet-mode` | 恢复设置模式 |
| 缩放变更 | `pet-region-updated` | 重新计算桌宠区域 |
| 输入面板显隐 | `pet-input-visible` | 切换交互模式 |

### 与旧方案对比

| 维度 | 旧方案（鼠标轮询） | 新方案（setDraggableRegions） |
|------|------|------|
| 拖拽方式 | IPC dragMove → setPosition | OS 原生拖拽 |
| 区域穿透 | 50ms timer 轮询 | 原生区域判定 |
| CPU 开销 | 持续 timer + 频繁 IPC | 仅在区域变化时更新 |
| 首次拖拽延迟 | CPU 冷启动 → 100ms+ 延迟 | 无延迟（无 timer 唤醒） |
| 代码量 | main.js ~150 行 + renderer.js ~150 行 | main.js ~60 行 + renderer.js ~0 行 |
| IPC 通道 | 8 条 | 4 条 |

## 常见问题

**Q: 设置面板不可点击？**
→ 检查主进程是否设置了 `alwaysOnTop: true`
→ 检查主进程 `did-finish-load` 是否调用了 `updateDraggableRegions()`

**Q: 桌宠无法拖拽？**
→ 确认 `enter-pet-mode` IPC 到达主进程
→ 检查 `updateDraggableRegions()` 中桌宠区域坐标是否正确

**Q: 双击桌宠无法弹出输入框？**
→ `setDraggableRegions` 会消费部分鼠标事件，检查是否需要调整区域大小
→ 尝试将拖拽区域缩小 2px 让出双击空间

**Q: 消息气泡不显示？**
→ 检查 `renderer.js` 中 `enqueueBubble()` → `showNextBubble()` 调用链
→ 检查 CSS 中 `.bubble` 的初始 `opacity: 0` 和 `.bubble.show` 的 `opacity: 1`
