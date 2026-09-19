# Bubbly 版本发布流程

> 本文档定义从日常开发到版本上线的标准流程（研发 → 测试 → 发布 → 部署）。
> 发布动作只有一个触发点：**推送 `v*` 标签**，其余全部由 CI 自动完成。

---

## 1. 总览

```
feature 分支 ──PR──▶ main ──CI 门禁──▶ 合并
                                        │
                        CHANGELOG 更新 + npm version 打标
                                        │
                              git push --tags
                                        │
                    ┌───────────────────┴───────────────────┐
                    ▼            Release 流水线              ▼
          客户端安装包 → GitHub Release(草稿)      服务器镜像 → GHCR
                    │                                       │
             人工验证后 Publish                      按 DEPLOY.md 升级服务器
```

| 阶段 | 载体 | 质量门禁 |
|------|------|----------|
| 研发 | feature 分支 | 本地 `npm run lint && npm test` |
| 测试 | PR / main | CI 矩阵（Node 20/22 × lint + test） |
| 发布 | `v*` 标签 | Release 流水线先跑同一套门禁，再构建产物 |
| 上线 | GitHub Release + GHCR | 人工验证草稿产物后 Publish、按 DEPLOY.md 升级 |

---

## 2. 日常开发规范

1. 从 `main` 拉出特性分支：
   ```bash
   git checkout -b feat/message-preview
   ```
2. 提交信息遵循 Conventional Commits（见 `AGENTS.md`，commit-msg 钩子强制校验）：
   ```
   feat(renderer): 添加消息预览
   fix(server): 修复断线后未清理房间
   ```
3. 推送并发起 PR，**CI 全绿后**方可合并。禁止直接 push 到 `main` 绕过 CI（协作约定）。

## 3. 版本号规则（Semantic Versioning）

`主版本.次版本.修订号`（如 `1.2.3`）：

| 升级位 | 时机 | 命令 |
|--------|------|------|
| 修订号 | bug 修复，不影响功能 | `npm version patch` |
| 次版本 | 新增向后兼容的功能 | `npm version minor` |
| 主版本 | 不兼容的协议/配置变更 | `npm version major` |

> `npm version X` 会自动：更新 `package.json` → 创建 commit → 创建 `vX` 标签。

## 4. 标准发布步骤

```bash
# 0. 确认 main 分支 CI 全绿，工作区干净
git checkout main && git pull
git status          # 应无任何未提交变更

# 1. 更新 CHANGELOG.md：新增版本段落（变更分类：Added/Changed/Fixed/Removed）

# 2. 提交 changelog
git add CHANGELOG.md
git commit -m "docs: 更新 CHANGELOG 准备发布 vX.Y.Z"

# 3. 打版本标签（自动修改 package.json 并生成 tag）
npm version patch   # 或 minor / major

# 4. 推送主干与标签 —— 标签推送即触发 Release 流水线
git push origin main --tags
```

## 5. Release 流水线产物与验证

推 tag 后在 GitHub → **Actions** 中观察 `Release` 工作流，包含三个阶段：

1. **质量门禁**：lint + 全量测试（不绿不构建）
2. **客户端打包**：
   - Windows：`Bubbly-Setup-x.y.z.exe`（NSIS 安装版）、`Bubbly-Portable-x.y.z.exe`（免安装便携版）
   - macOS：`Bubbly-x.y.z-{x64,arm64}.dmg`
   - 产物自动上传到 **GitHub Releases 草稿**
3. **服务器镜像**：推送 `ghcr.io/yyyywm/bubbly-server`（`x.y.z` / `x.y` / `latest` 三个标签）

**人工验证清单（发布前必做）：**

- [ ] Windows 安装版：安装 → 启动 → 连接服务器 → 双人互发消息
- [ ] macOS DMG（如适用）：同上
- [ ] 拉取镜像：`docker pull ghcr.io/yyyywm/bubbly-server:x.y.z` 并本地 `docker run` 验证 `/health`

验证通过后，在 GitHub Releases 页面**点击 Publish** 正式发布，随后按 [`DEPLOY.md`](../DEPLOY.md) 升级线上服务器。

## 6. 热修复（Hotfix）

```bash
# 从出问题的版本标签拉出修复分支
git checkout -b hotfix/fix-crash v1.2.3
# ...修复并提交...
git checkout main && git merge hotfix/fix-crash
npm version patch && git push origin main --tags
# 修复合回主干后删除 hotfix 分支
```

## 7. 回滚

- **客户端**：GitHub Releases 页面保留全部历史安装包，重装旧版即可。
- **服务器**：将 `docker run` / compose 的镜像 tag 换回上一个 `x.y.z`（见 DEPLOY.md「回滚」）。
- **代码**：`git revert` 出问题的合并提交，禁止 `reset --hard` 已推送的主干。

## 8. 当前状态约定

- 服务器协议变更（消息类型、字段）必须升**主版本**，并同步更新 README「通信协议」章节。
- 每次发布后确认 `package.json` 的 `version` 与最新 tag、CHANGELOG 顶部版本三者一致。
