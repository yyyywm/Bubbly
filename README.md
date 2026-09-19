# 💕 Bubbly

> 双人桌面桌宠应用 — 你和对方各自运行客户端，通过 WebSocket 连接后，对方发送的消息会以气泡形式弹出在桌宠头顶。

[![CI](https://github.com/yyyywm/Bubbly/actions/workflows/ci.yml/badge.svg)](https://github.com/yyyywm/Bubbly/actions/workflows/ci.yml)
[![Release](https://github.com/yyyywm/Bubbly/actions/workflows/release.yml/badge.svg)](https://github.com/yyyywm/Bubbly/actions/workflows/release.yml)
[![Release Version](https://img.shields.io/github/v/release/yyyywm/Bubbly?include_prereleases)](https://github.com/yyyywm/Bubbly/releases/latest)

## 预览

### 设置面板

```
┌──────────────────────────┐
│   💕 Bubbly             │ ← 拖拽标题栏移动窗口
│   与对方配对，开始聊天     │
├──────────────────────────┤
│ 服务器地址                │
│ [wss://your-server.com ] │
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
| **拖拽移动** | 设置面板左键拖拽标题栏、桌宠左键拖拽移动 |
| **隐藏菜单栏** | 无边框、无菜单、无 Dock 图标，系统托盘/菜单栏显示心形图标 |
| **系统托盘退出** | 托盘图标右键：重启应用 / 退出 |
| **自动重连** | 连接断开后 5s 自动重连，显示重连提示 |
| **勿扰模式** | 🌙 开启后消息暂存，关闭后一次性重放 |
| **自定义图片** | 支持上传默认状态和收到消息时的自定义桌宠图片 |

## 下载安装（推荐）

到 [GitHub Releases](https://github.com/yyyywm/Bubbly/releases/latest) 下载对应平台安装包（每次发版由 CI 自动构建）：

| 文件 | 说明 |
|------|------|
| `Bubbly-Setup-x.y.z.exe` | Windows 安装版（NSIS，可选安装目录，自动创建桌面快捷方式） |
| `Bubbly-Portable-x.y.z.exe` | Windows 便携版（免安装，双击即用） |
| `Bubbly-x.y.z-arm64.dmg` | macOS（Apple Silicon） |
| `Bubbly-x.y.z-x64.dmg` | macOS（Intel） |

> 使用前需要有一台运行信令服务器的机器，见[服务器部署](#服务器部署)。

## 快速启动（开发模式）

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

### 4. 配对

1. 窗口打开后显示**设置面板**
2. 填写服务器地址、昵称、桌宠大小
3. 点击 **💕 连接**
4. 设置面板消失，桌宠出现

| 场景 | 服务器地址 |
|------|-----------|
| **本机测试** | 双方都填 `ws://localhost:8080` |
| **局域网** | 连接方填 `ws://服务器IP:8080` |
| **公网（直连）** | 连接方填 `ws://公网IP或域名:8080` |
| **公网（TLS）** | 连接方填 `wss://你的域名`（经反向代理，推荐） |

> **注意**：服务器全局最多同时连接 2 人，无需输入房间号，连接即配对。

## 服务器部署

信令服务器极轻（无状态、无数据库，1C1G 云主机即可），支持三种部署方式：

| 方式 | 一句话 |
|------|--------|
| **Docker Compose**（推荐） | `git clone` 后 `docker compose up -d` |
| **GHCR 镜像** | `docker run -d -p 8080:8080 ghcr.io/yyyywm/bubbly-server:latest` |
| **裸机 systemd** | `npm ci --omit=dev` + systemd 托管 |

完整步骤（端口配置、防火墙、**WSS 反向代理**、安全须知、升级回滚、运维速查）见 **[DEPLOY.md](DEPLOY.md)**。

服务健康状态：

```bash
curl http://你的服务器:8080/health
# {"status":"ok","clients":1,"version":"1.0.0","uptime":86400}
```

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
│       ├── index.js             # 入口：ws 服务、/health 健康检查（npm run server）
│       └── handlers.js          # join / message / dnd-status / leave 处理
├── tests/
│   └── server/                  # 服务端单元测试 + 端到端集成测试
├── build/                       # 打包图标（icon.png / icon.ico，由脚本生成）
├── scripts/
│   └── generate-icons.ps1       # 品牌图标生成脚本（npm run icons）
├── .github/workflows/
│   ├── ci.yml                   # 持续集成：lint + 测试矩阵
│   └── release.yml              # 发布流水线：打 tag 自动出安装包与镜像
├── assets/
│   └── tray-icon.png            # 托盘图标
├── Dockerfile                   # 信令服务器生产镜像
├── docker-compose.yml           # 云端部署编排
├── eslint.config.js             # ESLint 配置
├── DEPLOY.md                    # 云端部署指南
├── CHANGELOG.md                 # 版本变更记录
├── docs/RELEASE.md              # 版本发布流程
├── AGENTS.md                    # AI Agent 开发约束
└── package.json                 # 项目配置与启动脚本
```

## 项目配置

### 服务器端口（环境变量 `PORT`）

```bash
PORT=9000 npm run server          # 本地
BUBBLY_PORT=9000 docker compose up -d   # Docker（宿主机映射端口）
```

不设置时默认 `8080`。

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

## 研发与质量

### 常用命令

| 命令 | 说明 |
|------|------|
| `npm test` | 运行服务端单元测试 + 端到端集成测试 |
| `npm run lint` | ESLint 代码检查 |
| `npm run dist` | 打包 Windows 安装版 + 便携版 |
| `npm run dist:mac` | 打包 macOS DMG |
| `npm run dist:dir` | 仅输出免安装目录（快速验证打包） |
| `npm run icons` | 重新生成应用品牌图标 |

### 研发 → 测试 → 上线流程

分支模型：`develop` 为默认开发分支；`main` 为稳定发布分支，**禁止直接 push**，只能由 develop 经"CI 全绿 + 人工审核"后合并进入；版本标签只从 main 打出。

```
feat/fix 分支 ──PR──▶ develop（CI 门禁：lint + 测试矩阵）
                          │
                    人工审核通过，PR 合入 main
                          │
                 main 上更新 CHANGELOG + npm version 打 v* 标签
                          │
                 Release 流水线（先过门禁，再自动构建）
                  ├── 客户端安装包 → GitHub Release 草稿 → 人工验证后 Publish
                  └── 服务器镜像   → GHCR → 按 DEPLOY.md 升级服务器
```

详细规范见 **[docs/RELEASE.md](docs/RELEASE.md)**（版本号规则、标准发布步骤、热修、回滚），分支与版本约束见 **[AGENTS.md](AGENTS.md)**。

## 打包发布

```bash
npm run dist        # Windows：dist/Bubbly-Setup-x.y.z.exe + Bubbly-Portable-x.y.z.exe
npm run dist:mac    # macOS：dist/Bubbly-x.y.z-*.dmg
```

正式版本发布**无需手动打包**：推送 `v*` 标签后 CI 自动构建所有平台产物并上传 GitHub Release，流程见 [docs/RELEASE.md](docs/RELEASE.md)。

> 打包后客户端仍需信令服务器在线，启动后填写服务器地址即可。

## 技术栈

| 技术 | 用途 |
|------|------|
| **Electron 28** | 桌面应用框架 |
| **WebSocket (ws)** | 实时双向通信 |
| **纯 CSS** | 桌宠造型与动画，无需图片资源 |
| **IPC 通信** | 主进程与渲染进程控制窗口行为 |
| **node:test** | 单元与集成测试（Node 原生，零测试框架依赖） |
| **ESLint 10** | 代码静态检查 |
| **GitHub Actions** | CI 门禁与自动化发布 |
| **Docker** | 信令服务器云端交付 |

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

1. 确认服务器正在运行：`curl http://服务器:8080/health` 应返回 JSON
2. 云服务器检查安全组/防火墙是否放行对应端口
3. 局域网时确认双方在同一网络，IP 地址正确
4. 填写 `wss://` 时确认反向代理已正确配置（见 DEPLOY.md）

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
```

**macOS/Linux:**
```bash
pkill -f "electron"
```

或点击系统托盘 ❤ 图标 → 右键 → 退出

---

## License

MIT © 2025-2026 Bubbly
