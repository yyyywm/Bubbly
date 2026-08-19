# 💻 开发指南

## 目录

- [开发环境](#开发环境)
- [架构概览](#架构概览)
- [开发工作流](#开发工作流)
- [IPC 通信协议](#ipc-通信协议)
- [区域穿透实现](#区域穿透实现)
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
│  │              ↕ IPC (preload.js)              │ │
│  │   setNonPenetratingRegion()                  │ │
│  │   dragStart / dragMove / dragEnd()          │ │
│  └─────────────────────────────────────────────┘ │
│              ↕                                    │
│  Tray Menu (菜单栏心形图标)                        │
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
  → showInput() → 输入框显示
    → 用户输入 → Enter
      → sendMessage() → WebSocket → 服务器 → 对方
        → hideInput() → 输入框隐藏
          → updateRegions() → 恢复区域穿透
```

## 开发工作流

### 1. 修改后重启

```bash
# 停止所有进程
pkill -f "electron /Users/ywm/Desktop/vibecoding/pet"
pkill -f "node /Users/ywm/Desktop/vibecoding/pet/server.js"

# 启动
node server.js &
./node_modules/.bin/electron .
```

### 2. 调试技巧

- **主进程日志**：终端 `npm start` 的输出
- **渲染进程日志**：`renderer.js` 中 `console.log` → 主进程 `console-message` 事件转发到终端
- **DevTools**：安装 Electron DevTools Extension 后启用

### 3. 验证顺序

1. 启动服务器 → 终端显示启动成功
2. 启动两个客户端 → 设置面板可见
3. 双方填相同房间号 → 点击连接
4. 设置面板消失，桌宠出现
5. 双击桌宠 → 输入框弹出
6. 发送消息 → 对方桌宠头顶气泡弹出

## IPC 通信协议

### 渲染进程 → 主进程

| 通道 | 参数 | 用途 |
|------|------|------|
| `enable-penetrating` | - | 开启全屏穿透 |
| `disable-penetrating` | - | 关闭穿透 |
| `set-non-penetrating-region` | `[{x, y, width, height}]` | 设置区域穿透 |
| `drag-start` | `screenX, screenY` | 拖拽开始 |
| `drag-move` | `screenX, screenY` | 拖拽移动 |
| `drag-end` | - | 拖拽结束 |

### 区域穿透规则

```
设置面板模式 → 不穿透（所有元素可点击）
桌宠模式     → 区域穿透（仅桌宠/气泡/输入框可点击）
  - 桌宠显示中 → enable-penetrating
  - 气泡显示中 → set-non-penetrating-region([pet, bubble])
  - 输入框显示中 → set-non-penetrating-region([pet, input])
  - 重连提示显示中 → set-non-penetrating-region([pet, hint])
```

## 区域穿透实现

`setNonPenetratingRegion()` 接收窗口坐标下的非穿透矩形数组：

```js
const regions = [];
// 桌宠本体
const petRect = petContainer.getBoundingClientRect();
regions.push({ x, y, width, height });

// 气泡（显示时）
if (isShowing) {
  const rect = bubbleContainer.getBoundingClientRect();
  regions.push({ x, y, width, height });
}

// 传给主进程
window.electronAPI.setNonPenetratingRegion(regions);
```

### 坐标计算

- `getBoundingClientRect()` 返回**视口坐标**
- 视口坐标 = 窗口坐标（因为窗口大小 = 视口大小）
- 主进程 `region` 参数需要整数坐标

### 常见问题

**Q: 设置面板不可点击？**
→ 检查主进程是否设置了 `alwaysOnTop: true`（缺少此设置窗口会被遮挡）
→ 检查 `renderer.js` 末尾是否调用了 `setSetupModePenetration()`

**Q: 桌宠无法拖拽？**
→ 拖拽时确保 `disable-penetrating()` 被调用
→ 检查 `drag-start` IPC 是否到达主进程

**Q: 消息气泡不显示？**
→ 检查 `renderer.js` 中 `enqueueBubble()` → `showNextBubble()` 调用链
→ 检查 CSS 中 `.bubble` 的初始 `opacity: 0` 和 `.bubble.show` 的 `opacity: 1`
