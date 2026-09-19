# 更新日志

本项目遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)，
变更记录格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。
发布流程见 [`docs/RELEASE.md`](docs/RELEASE.md)。

## [Unreleased]

### Added

- 自动部署：新增 GitHub Webhook 监听器 `scripts/deploy-webhook.js`（零依赖，`npm run webhook`），`main` 分支收到 push 后自动同步远端代码（fetch + reset --hard）并执行 `docker compose up -d --build` 重启服务，含 HMAC-SHA256 签名校验、分支/事件过滤、部署排队合并与部署后健康检查；附 systemd 单元 `deploy/bubbly-webhook.service`、环境变量模板 `deploy/webhook.env.example` 及 DEPLOY.md 完整部署指南

暂无其他在途改动。功能性改动（feat/fix/perf/refactor）合入 develop 前在此登记，
分类使用 Added / Changed / Fixed / Removed（规范见 AGENTS.md 第 4 节）。

## [1.1.0] - 2026-09-19

### Added

- 本地联调：`npm run start:pair` 一条命令同时启动信令服务器与两个客户端，关闭窗口或 Ctrl+C 自动清理全部进程

### Removed

- 从未激活的 `.githooks/commit-msg` 钩子（如需恢复见 AGENTS.md 第 7 节）
- `docs/superpowers/` 一次性 AI 过程文档（git 历史可查）

### Fixed

- 文档一致性：README 与发布流程统一为"CHANGELOG 在 develop 整理后再合 main"；DEPLOY.md systemd 安装路径与 WorkingDirectory 衔接；ESLint 配置覆盖 scripts 目录

## [1.0.0] - 2026-09-19

首个正式版本：双人桌宠传信应用，客户端 + 信令服务器 + 完整研发发布基础设施。

### Added

- **桌宠核心**：置顶透明桌宠、气泡消息动画、双击弹出悬浮输入窗口、状态微光条
- **连接能力**：WebSocket 单房间双人配对、断线 5 秒自动重连、对方上线/离线通知
- **勿扰模式**：开启后消息暂存，关闭后一次性重放
- **个性化**：桌宠 小/中/大/特大 四档缩放、自定义默认/收信桌宠图片、右键菜单与消息历史
- **信令服务器**（`src/server/`）：join/message/dnd-status/leave 协议、30s 心跳保活、64KB 报文上限、优雅关闭
- **可观测性**：`GET /health` 健康检查端点（返回状态、在线人数、版本、运行时长）
- **测试**：23 项自动化测试（handlers 单元测试 + 真实进程端到端集成测试），`npm test` 一键运行
- **云端部署**：Docker 多阶段生产镜像（非 root + HEALTHCHECK）、docker-compose 编排，见 `DEPLOY.md`
- **客户端打包**：electron-builder 配置（Windows NSIS 安装版/便携版、macOS DMG）、品牌图标及生成脚本 `scripts/generate-icons.ps1`
- **CI/CD**：GitHub Actions 持续集成（Node 20/22 矩阵 lint + test）与发布流水线（推 `v*` 标签自动出安装包与 Docker 镜像），见 `docs/RELEASE.md`

### Changed

- 工程结构模块化：单文件拆分为 `src/main`、`src/preload`、`src/renderer`、`src/server` 四层
- 服务器端口支持 `PORT` 环境变量注入，便于云端与容器部署

### Fixed

- 修复托盘图标不显示的问题（改用 PNG 文件加载）
- 修复状态光条与气泡/桌宠重叠的定位问题
- 修复 localStorage 配额超时分支使用不存在全局构造器导致的运行时引用错误
