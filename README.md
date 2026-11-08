# 💕 Bubbly

双人桌面桌宠应用。两人各自运行客户端，连接到同一台 WebSocket 服务器；一方发送的文字会以气泡显示在另一方的桌宠上方。

[![CI](https://github.com/yyyywm/Bubbly/actions/workflows/ci.yml/badge.svg)](https://github.com/yyyywm/Bubbly/actions/workflows/ci.yml)
[![Release](https://github.com/yyyywm/Bubbly/actions/workflows/release.yml/badge.svg)](https://github.com/yyyywm/Bubbly/actions/workflows/release.yml)
[![Release Version](https://img.shields.io/github/v/release/yyyywm/Bubbly?include_prereleases)](https://github.com/yyyywm/Bubbly/releases/latest)

## 开始使用

1. 从 [GitHub Releases](https://github.com/yyyywm/Bubbly/releases/latest) 下载 Windows 安装版、便携版或 macOS DMG，双方各安装一份。
2. 准备一台信令服务器。可以按 [部署指南](DEPLOY.md)部署；本机测试可从源码运行 `npm run server`（见下方「本地开发」）。
3. 两个客户端填写**同一个服务器地址**并点击「连接」。本机测试用 `ws://localhost:8080`；跨设备连接时填写服务器的实际地址。
4. 双击桌宠打开输入框，输入消息后按 Enter 发送。

服务器全局只允许两人同时加入，不需要房间号。公网使用建议配置 `wss://`，步骤见 [部署指南](DEPLOY.md)。

## 功能与操作

| 功能 | 说明 |
|------|------|
| 桌宠窗口 | 透明置顶，可拖拽和选择四档大小；支持自定义默认及收信图片 |
| 消息气泡 | 收到消息后依次播放，不会互相覆盖 |
| 发送消息 | 双击桌宠打开悬浮输入框；Enter 发送，Esc 关闭 |
| 自动重连 | 连接断开后每 5 秒尝试重连，也可双击状态灯立即重连 |
| 勿扰模式 | 开启后暂存最近 **5 条**收到的消息；关闭后依次重放 |
| 右键菜单 | 发送消息、切换勿扰、查看勿扰暂存消息、返回设置、重启和退出 |
| 系统托盘 | 可从托盘菜单重启或退出应用 |

设置面板中的昵称目前仅保存在本机，不参与配对或消息显示。当前窗口空白区域也会接收鼠标事件，尚不支持空白区域穿透。

## 本地开发

建议使用 Node.js 22（与发布流水线一致）。安装依赖后，一条命令可启动服务器和两个客户端：

```bash
npm ci
npm run start:pair
```

两个客户端的服务器地址都填 `ws://localhost:8080`，点击「连接」即可互发消息。关闭两个客户端或按 Ctrl+C 会结束联调进程。

分别启动时：

```bash
npm run server  # 默认监听 8080；可用 PORT 环境变量覆盖
npm start       # 在另一个终端启动客户端
```

| 命令 | 用途 |
|------|------|
| `npm run lint` | ESLint 检查 |
| `npm test` | 服务端与部署监听器测试 |
| `npm run dist` | 构建 Windows 安装版和便携版 |
| `npm run dist:mac` | 在 macOS 上构建 DMG |
| `npm run dist:dir` | 构建免安装目录 |

## 部署与发布

- 服务器部署、TLS 反向代理、健康检查和 GitHub Webhook 自动部署：[DEPLOY.md](DEPLOY.md)
- 版本号、分支、CI 门禁和正式发布步骤：[docs/RELEASE.md](docs/RELEASE.md)
- 版本变更记录：[CHANGELOG.md](CHANGELOG.md)

健康检查可通过 `GET /health` 查看在线人数、当前版本和运行时长：

```json
{"status":"ok","clients":1,"version":"<当前版本>","uptime":86400}
```

实际响应的版本号取自 `package.json`，随部署版本变化。

## 代码结构

| 路径 | 用途 |
|------|------|
| `src/main/` | Electron 窗口、托盘与 IPC |
| `src/preload/` | 向渲染进程暴露受限 IPC API |
| `src/renderer/` | 设置面板、桌宠、气泡与连接逻辑 |
| `src/server/` | 双人 WebSocket 信令服务器与 `/health` |
| `scripts/` | 本地双开、自动部署监听器和图标生成 |
| `tests/` | 服务端及部署监听器测试 |

客户端与服务器交换 `join`、`message`、`dnd-status` 和 `leave` 消息；服务器发送 `welcome`、`peer-joined`、`peer-disconnected` 和错误消息。服务端处理逻辑见 [`src/server/handlers.js`](src/server/handlers.js)。

## 常见问题

**连接失败？** 先访问服务器的 `/health` 地址检查服务是否在线，再检查端口、防火墙和 `ws://` / `wss://` 地址。反向代理配置见 [部署指南](DEPLOY.md)。

**窗口不见了？** 先检查系统托盘；若窗口位置超出屏幕，可调整 [`src/main/windows.js`](src/main/windows.js) 中的初始坐标后重新启动。

**对方收不到消息？** 两端须连到同一台服务器，且对方在线；当前服务器最多容纳两人。勿扰开启时，消息会暂存，关闭后依次显示。

## License

[MIT](LICENSE) © 2025-2026 Bubbly
