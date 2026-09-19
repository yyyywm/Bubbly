# 更新日志

本项目遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)，
变更记录格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。
发布流程见 [`docs/RELEASE.md`](docs/RELEASE.md)。

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
