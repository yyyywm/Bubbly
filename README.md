# 💕 Bubbly

> 双人桌面桌宠应用 — 你和对方各自运行客户端，通过 WebSocket 连接后，对方发送的消息会以气泡形式弹出在桌宠头顶。

## 预览

### 设置面板

```
┌──────────────────────────┐
│   💕 Bubbly             │ ← 拖拽标题栏移动窗口
│   与对方配对，开始聊天     │
├──────────────────────────┤
│ 服务器地址                │
│ [ws://localhost:8080  ]  │
│ 你的昵称                  │
│ [____________________]   │
│ 桌宠大小                  │
│ [小] [中] [大] [特大]    │
├──────────────────────────┤
│      💕 连接              │
└──────────────────────────┘
```

### 桌宠模式

```
     ┌─────────────────────┐
     │  "想你了～"          │  ← 气泡动画
     └───────┬─────────────┘
             ▼
          ╭─────╮
        ╭─┤ 🐶  ├─╮
        │  ╰───╯  │  ← 桌宠
        │   🟢   │  ← 状态指示灯
        ╰────────╯
```

## 功能特性

| 功能 | 说明 |
|------|------|
| **置顶透明窗口** | `alwaysOnTop` 置顶 + 透明背景，桌面可见 |
| **区域鼠标穿透** | 仅桌宠/气泡/输入框区域可点击，其余空白区域穿透 |
| **气泡动画** | 淡入上浮 → 停留 2.5s → 淡出，消息队列不重叠 |
| **双击发送消息** | 双击桌宠弹出输入框，Enter 发送，光标离开自动收起 |
| **桌宠缩放** | 设置面板可选 小/中/大/特大（50%/75%/100%/125%） |
| **拖拽移动** | 设置面板左键拖拽标题栏、桌宠右键拖拽移动 |
| **隐藏菜单栏** | 无边框、无菜单、无 Dock 图标，系统托盘/菜单栏显示心形图标 |
| **系统托盘退出** | 托盘图标右键：重启应用 / 退出 |
| **自动重连** | 连接断开后 5s 自动重连，显示重连提示 |
| **勿扰模式** | 🌙 开启后消息暂存，关闭后一次性重放 |
| **自定义图片** | 支持上传默认状态和收到消息时的自定义桌宠图片 |

## 项目结构

```
Bubbly/
├── src/
│   ├── main/                    # Electron 主进程
│   │   ├── index.js             # 入口：单实例锁、app 生命周期、初始化
│   │   ├── state.js             # 跨模块共享的可变状态（mainWindow/winW 等）
│   │   ├── windows.js           # 主窗口 + 悬浮输入窗口（创建/定位/销毁）
│   │   ├── tray.js              # 托盘图标与菜单
│   │   └── ipc.js               # 全部 ipcMain 通道注册
│   ├── preload/
│   │   ├── main.js              # 主窗口 preload
│   │   └── input-window.js      # 输入窗口 preload
│   ├── renderer/
│   │   ├── index.html           # 桌宠 UI
│   │   ├── styles.css           # 桌宠样式与动画
│   │   ├── state.js             # DOM 引用与跨模块共享状态（最先加载）
│   │   ├── settings.js          # 设置读写 localStorage
│   │   ├── images.js            # 自定义桌宠图片
│   │   ├── layout.js            # 缩放布局 / 窗口尺寸上报
│   │   ├── connection.js        # WebSocket 连接、消息分发、自动重连
│   │   ├── bubble.js            # 气泡队列与动画
│   │   ├── status.js            # 状态微光条 / 重连提示
│   │   ├── dnd.js               # 勿扰模式与消息暂存/重放
│   │   ├── menu.js              # 桌宠右键菜单
│   │   ├── drag.js              # 桌宠 JS 拖拽
│   │   ├── index.js             # 入口：事件绑定与初始化（最后加载）
│   │   └── input-window/
│   │       ├── index.html       # 独立悬浮输入窗口
│   │       └── renderer.js      # 输入窗口逻辑
│   └── server/
│       ├── index.js             # 入口：ws 服务、启动日志（npm run server）
│       └── handlers.js          # join / message / dnd-status / leave 处理
├── assets/
│   └── tray-icon.png            # 托盘图标
├── package.json                 # 项目配置与启动脚本
├── README.md                    # 本文件
└── AGENTS.md                    # AI Agent 开发约束
```

## 快速启动

### 1. 安装依赖

```bash
npm install
```

> **下载超时？** 使用国内镜像：
> ```bash
> ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" npm install
> ```

### 2. 启动服务器

```bash
npm run server
```

```
==================================================
  💕  Bubbly 服务器已启动  💕
==================================================
  端口: 8080
  局域网连接地址: ws://<你的局域网IP>:8080
  本机连接地址:   ws://localhost:8080
==================================================
```

### 3. 启动客户端

```bash
npm start
```

或：

```bash
./node_modules/.bin/electron .
```

### 4. 配对

1. 窗口打开后显示**设置面板**
2. 填写服务器地址、昵称、桌宠大小
3. 点击 **💕 连接**
4. 设置面板消失，桌宠出现

| 场景 | 服务器地址 |
|------|-----------|
| **本机测试** | 双方都填 `ws://localhost:8080` |
| **局域网** | 连接方填 `ws://服务器IP:8080` |
| **公网** | 连接方填 `ws://公网IP或域名:8080` |

> **注意**：服务器全局最多同时连接 2 人，无需输入房间号，连接即配对。

## 操作说明

| 操作 | 效果 |
|------|------|
| **左键拖拽标题栏** | 移动设置面板窗口 |
| **左键拖拽桌宠** | 移动桌宠窗口（整个桌宠区域） |
| **双击桌宠** | 弹出输入框，发送消息 |
| **右键桌宠** | 弹出上下文菜单（发送消息 / 勿扰 / 历史 / 返回设置 / 重启 / 退出） |
| **Enter / 发送** | 发送消息，输入框自动收起 |
| **光标离开输入框** | 输入框自动隐藏 |
| **双击状态灯** | 返回设置面板 / 立即重连 |
| **托盘心形图标右键** | 重启应用 / 退出 |

## 项目配置

### 服务器端口（`src/server/index.js` 的 `PORT`）

```js
const PORT = 8080;  // 修改为其他端口
```

### 窗口初始尺寸（`src/main/state.js` 的 `winW` / `winH`）

```js
winW: 280,  // 窗口宽度
winH: 340,  // 窗口高度
```

### 窗口初始位置（`src/main/windows.js` 的 `createWindow`）

```js
x: 400,  // 初始 X 坐标
y: 300,  // 初始 Y 坐标
```

### 气泡停留时间（`src/renderer/bubble.js`）

```js
setTimeout(() => { /* 淡出 */ }, 2500);  // 2.5 秒
setTimeout(() => { /* 清理 */ }, 2850);  // 淡出动画 0.35s 后清理
```

## 局域网 / 公网部署

### 局域网

1. 查看本机局域网 IP：
   ```bash
   ipconfig  # Windows
   ifconfig  # macOS/Linux
   ```
2. 连接方在设置面板填写：`ws://192.168.x.x:8080`

### 公网

1. 确保服务器所在机器有公网 IP 或域名
2. 路由器配置端口转发（8080 → 服务器内网 IP）
3. 连接方填写：`ws://公网IP:8080`

### 云服务器（推荐）

在云服务器（如阿里云 / AWS）上运行服务器，双方都连接公网 IP 即可。

```bash
# 服务器端
npm run server

# 客户端填写
ws://云服务器公网IP:8080
```

## 打包发布

### macOS (.dmg)

```bash
npx electron-builder --mac
```

### Windows (.exe)

```bash
npx electron-builder --win
```

> 打包后客户端仍需服务器在运行，启动后填写服务器地址即可。

## 开发调试

- **查看控制台日志**：终端运行 `npm start` 可见主进程日志
- **页面调试**：`npm start` 后使用 [Electron DevTools](https://www.electronjs.org/docs/latest/api/devtools-extension)

## 技术栈

| 技术 | 用途 |
|------|------|
| **Electron 28** | 桌面应用框架 |
| **WebSocket (ws)** | 实时双向通信 |
| **纯 CSS** | 桌宠造型与动画，无需图片资源 |
| **IPC 通信** | 主进程与渲染进程控制窗口行为 |

## 通信协议

**客户端 → 服务器：**

```json
{"type": "join", "id": "user123"}
{"type": "message", "id": "user123", "text": "hello"}
{"type": "dnd-status", "id": "user123", "dnd": true}
{"type": "leave", "id": "user123"}
```

**服务器 → 客户端：**

```json
{"type": "welcome", "id": "user123"}
{"type": "message", "from": "user456", "text": "hello"}
{"type": "peer-joined", "id": "user456"}
{"type": "peer-disconnected", "id": "user456"}
{"type": "dnd-status", "from": "user456", "dnd": true}
{"type": "error", "msg": "连接已满"}
```

## 常见问题

### Q1: 启动客户端后什么也看不到？

确保 `src/main/windows.js` 的 `createWindow()` 在内容加载完成后调用了 `setAlwaysOnTop(true)`。缺少此设置，窗口可能被其他窗口遮挡。

### Q2: 设置面板显示但点不动？

鼠标穿透由 CSS `-webkit-app-region` 与 `src/main/windows.js` 的 `updateMousePenetration()` 共同控制（窗口始终接收鼠标事件，空白区域穿透由 CSS 区域决定）。检查 `src/renderer/styles.css` 中设置面板的 `-webkit-app-region` 配置是否正确。

### Q3: 桌宠和设置面板都看不到？

可能是窗口位置超出屏幕范围。修改 `src/main/windows.js` 的 `createWindow()` 中的窗口坐标：

```js
x: 400,  // 屏幕左侧偏移
y: 300,  // 屏幕顶部偏移
```

### Q4: 气泡不显示？

1. 确认连接成功（桌宠状态指示灯为绿色）
2. 检查 `src/renderer/bubble.js` 中 `showNextBubble()` 和 `src/renderer/styles.css` 动画类 `.bubble.show`

### Q5: 服务器连接失败？

1. 确认服务器正在运行：终端看到启动日志
2. macOS 防火墙可能拦截 8080 端口：系统设置 → 网络 → 防火墙 → 允许
3. 局域网时确认双方在同一网络，IP 地址正确

### Q6: 如何同时运行两个客户端？

```bash
# 终端 1
npm start

# 终端 2
./node_modules/.bin/electron . --no-single-instance
```

### Q7: 如何完全停止应用？

**Windows:**
```powershell
Get-Process electron | Stop-Process
Get-Process node | Where-Object { $_.CommandLine -like "*src/server/index.js*" } | Stop-Process
```

**macOS/Linux:**
```bash
pkill -f "electron"
pkill -f "node src/server/index.js"
```

或点击系统托盘 ❤ 图标 → 右键 → 退出

---

## License

MIT © 2025 Bubbly
