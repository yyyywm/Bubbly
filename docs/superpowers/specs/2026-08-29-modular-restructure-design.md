# Bubbly 项目模块化拆分设计

日期：2026-08-29
状态：已获用户批准

## 背景与目标

当前项目约 2400 行代码，全部挤在根目录的扁平文件中：

- `renderer.js`（805 行）：设置持久化、自定义图片、布局缩放、WebSocket、气泡队列、状态灯、勿扰模式、右键菜单、拖拽、事件绑定混在一起
- `main.js`（378 行）：主窗口、托盘、IPC、输入窗口、生命周期混在一起
- `server.js`（323 行）：ws 服务、配对状态、消息处理混在一起

目标：**纯结构重构，运行时行为完全不变**。不引入打包器、不引入框架、不改变任何函数实现，只做"剪切 + 粘贴 + 路径更新"。

## 已完成的配套修复

重构前先修复了托盘图标不显示的问题：`nativeImage.createFromDataURL` 不支持 SVG（实测返回 0x0 空图像），已改为加载 `assets/tray-icon.png`（32x32 心形 PNG，主题粉 #FF5C8A），并将 `assets/**` 加入 `package.json` 的 `build.files`。

## 目标结构

```
Bubbly/
├── src/
│   ├── main/                    # Electron 主进程
│   │   ├── index.js             # 入口：单实例锁、app 生命周期、初始化
│   │   ├── windows.js           # 主窗口 + 悬浮输入窗口（创建/定位/销毁）
│   │   ├── tray.js              # 托盘图标与菜单
│   │   └── ipc.js               # 全部 ipcMain 通道注册
│   ├── preload/
│   │   ├── main.js              # 原 preload.js
│   │   └── input-window.js      # 原 input-window.preload.js
│   ├── renderer/
│   │   ├── index.html           # 原 index.html（样式/脚本引用改路径）
│   │   ├── styles.css           # 原 styles.css
│   │   ├── index.js             # 渲染入口：初始化与事件绑定
│   │   ├── settings.js          # 设置读写 localStorage
│   │   ├── images.js            # 自定义桌宠图片（加载/上传/预览/重置）
│   │   ├── layout.js            # computeLayout / applyScale / 窗口尺寸上报
│   │   ├── connection.js        # WebSocket 连接、消息分发、自动重连
│   │   ├── bubble.js            # 气泡队列与动画
│   │   ├── status.js            # 状态微光条 / 重连提示
│   │   ├── dnd.js               # 勿扰模式与消息暂存/重放
│   │   ├── menu.js              # 桌宠右键菜单模板构建与动作处理
│   │   ├── drag.js              # 桌宠 JS 拖拽（mousemove/mouseup）
│   │   └── input-window/
│   │       ├── index.html       # 原 input-window.html
│   │       └── renderer.js      # 原 input-window.js
│   └── server/
│       ├── index.js             # 入口：ws 服务、双人配对状态、启动日志
│       └── handlers.js          # join / message / dnd-status / leave 处理
├── assets/
│   └── tray-icon.png            # 托盘图标
├── package.json                 # main → src/main/index.js
├── README.md / AGENTS.md        # 文档同步更新
└── .githooks/
```

## 关键决策

1. **不引入打包器**：渲染进程各模块保持经典脚本（classic scripts），用 `<script>` 标签按依赖顺序加载。函数声明在经典脚本中天然全局共享，模块间通信方式与拆分前完全一致，行为零变化的风险最低。
2. **模块边界沿用现有注释段**：`renderer.js` / `main.js` / `server.js` 中已有的 `// ====` 分段就是天然的模块边界，拆分基本是剪切粘贴，不改变任何函数实现。
3. **共享状态通过全局变量**：`renderer.js` 顶部的模块级常量与变量（`userId`、`messageQueue` 等）随其使用方就近迁移；被多个模块引用的放入先加载的模块。加载顺序在 `index.html` 中显式声明并加注释。
4. **配置同步**：
   - `package.json`：`main` → `src/main/index.js`；`build.files` → `["src/**", "assets/**", "package.json"]`
   - 主进程内 `path.join(__dirname, ...)` 的 preload/HTML 路径相应调整
   - `index.html` 中 `styles.css` 与脚本引用更新
5. **文档同步**：README 的项目结构、配置项路径引用更新为新路径；AGENTS.md 不变。

## 模块间依赖顺序（renderer）

`index.html` 中按以下顺序加载（前者不依赖后者）：

```
settings → images → layout → bubble → status → dnd → menu → connection → drag → index
```

- `connection` 依赖 `bubble`（收消息入队）、`status`（状态更新）、`dnd`（暂存）
- `menu` 依赖 `dnd`、`connection`（发消息）
- `index`（入口）最后加载，负责事件绑定与初始化调用

主进程依赖方向：`index` → `windows` / `tray` / `ipc`；`ipc` 依赖 `windows`。

server：`index` → `handlers`。

## 错误处理

沿用现有实现，不做任何变更（行为保持原则）。

## 验证方式

项目无测试框架，重构后人工冒烟验证：

1. `npm run server` 正常启动，输出启动横幅
2. `npm start` 窗口正常显示、托盘图标可见（验证本次 PNG 修复）
3. 双客户端（第二个加 `--no-single-instance`）配对、收发消息、气泡弹出
4. 拖拽移动、桌宠缩放、勿扰模式、双击输入窗口、右键菜单逐项正常
5. `npx electron-builder --win`（可选）打包配置不因路径变化而损坏
