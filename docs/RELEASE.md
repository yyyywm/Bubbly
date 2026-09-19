# Bubbly 版本发布流程

> 本文档定义从日常开发到版本上线的标准流程（研发 → 测试 → 发布 → 部署）。
>
> **分支模型（强制，见 AGENTS.md 第 3 节）：**
> - `develop` — 默认开发分支，日常改动都在这里；
> - `main` — 稳定发布分支，**禁止直接 push**，只能由 develop 经"CI 全绿 + 人工审核"后合并进入；
> - 版本标签（`v*`）只从 main 打出，标签推送即触发 Release 流水线。

---

## 1. 总览

```
feat/fix 分支 ──PR──▶ develop ──CI 门禁──▶ 合并
                                            │
                             （准备发布：CHANGELOG 整理）
                                            │
                          PR: develop ▶ main（人工审核）──▶ 合并 main
                                            │
                            main 上 npm version 打 v* 标签 + push
                                            │
                    ┌───────────────────────┴──────────────────────┐
                    ▼              Release 流水线                   ▼
          客户端安装包 → GitHub Release(草稿)            服务器镜像 → GHCR
                    │                                              │
             人工验证后 Publish                        按 DEPLOY.md 升级服务器
                    │
                    └──▶ 把 main 回合同步到 develop（保持一致）
```

| 阶段 | 载体 | 质量门禁 |
|------|------|----------|
| 研发 | feature 分支 → develop | 本地 `npm run lint && npm test` |
| 集成 | develop | CI 矩阵（Node 20/22 × lint + test） |
| 发布 | main（PR 审核合入） | Release 流水线先跑同一套门禁，再构建产物 |
| 上线 | GitHub Release + GHCR | 人工验证草稿产物后 Publish、按 DEPLOY.md 升级 |

---

## 2. 日常开发规范

1. **从最新的 develop 开始**（默认开发分支，见 AGENTS.md 第 3 节）：
   ```bash
   git checkout develop && git pull
   ```
2. 较大或风险较高的改动，从 develop 切出特性分支：
   ```bash
   git checkout -b feat/message-preview
   ```
3. 提交信息遵循 Conventional Commits（见 `AGENTS.md`，commit-msg 钩子强制校验）：
   ```
   feat(renderer): 添加消息预览
   fix(server): 修复断线后未清理房间
   ```
4. **功能性改动（feat/fix/perf/refactor）合入前，先在 `CHANGELOG.md` 的 `[Unreleased]` 段登记**（见 AGENTS.md 第 4 节）。
5. 推送并发起 PR（目标分支选 **develop**），**CI 全绿后**方可合并。禁止直接 push 到远程 `main`。

## 3. 版本号规则（Semantic Versioning）

`主版本.次版本.修订号`（如 `1.2.3`）：

| 升级位 | 时机 | 命令 |
|--------|------|------|
| 修订号 | bug 修复，不影响功能 | `npm version patch` |
| 次版本 | 新增向后兼容的功能 | `npm version minor` |
| 主版本 | 不兼容的协议/配置变更 | `npm version major` |

> `npm version X` 会自动：更新 `package.json` → 创建 commit → 创建 `vX` 标签。
> 当前版本基线：**v1.0.0**。

## 4. 标准发布步骤

```bash
# ---- 阶段一：在 develop 上完成发布准备 ----
git checkout develop && git pull
git status          # 应无任何未提交变更

# 1. 整理 CHANGELOG.md：把 [Unreleased] 改为即将发布的版本号与日期
# 2. 提交
git add CHANGELOG.md
git commit -m "docs: 更新 CHANGELOG 准备发布 vX.Y.Z"
git push

# 确认 develop CI 全绿

# ---- 阶段二：人工审核后合入 main ----
# 3. 发起 PR: develop → main，人工审核通过后合并
#    （或审核确认后本地执行：）
git checkout main && git pull
git merge develop --no-ff   # --no-ff 保留合并记录，便于追溯

# ---- 阶段三：在 main 上打标发布 ----
# 4. 打版本标签（自动修改 package.json 并生成 tag）
npm version patch   # 或 minor / major

# 5. 推送 main 与标签 —— 标签推送即触发 Release 流水线
git push origin main --tags

# ---- 阶段四：同步回 develop ----
git checkout develop
git merge main      # 让 develop 拿到版本号提交，保持两分支一致
git push
```

## 5. Release 流水线产物与验证

推 tag 后在 GitHub → **Actions** 中观察 `Release` 工作流，包含三个阶段：

1. **质量门禁**：lint + 全量测试（不绿不构建）
2. **客户端打包**：
   - Windows：`Bubbly-Setup-x.y.z.exe`（NSIS 安装版）、`Bubbly-Portable-x.y.z.exe`（免安装便携版）
   - macOS：`Bubbly-x.y.z-{arm64,x64}.dmg`
   - 产物自动上传到 **GitHub Releases 草稿**
3. **服务器镜像**：推送 `ghcr.io/yyyywm/bubbly-server`（`x.y.z` / `x.y` / `latest` 三个标签）

**人工验证清单（发布前必做）：**

- [ ] Windows 安装版：安装 → 启动 → 连接服务器 → 双人互发消息
- [ ] macOS DMG（如适用）：同上
- [ ] 拉取镜像：`docker pull ghcr.io/yyyywm/bubbly-server:x.y.z` 并本地 `docker run` 验证 `/health`

验证通过后，在 GitHub Releases 页面**点击 Publish** 正式发布，随后按 [`DEPLOY.md`](../DEPLOY.md) 升级线上服务器。

## 6. 热修复（Hotfix）

```bash
# 1. 从出问题的 main 版本标签拉出修复分支
git checkout -b hotfix/fix-crash v1.2.3

# 2. 修复、提交、验证（CHANGELOG 补记到下个版本段）

# 3. 合回 main 并发布（审核后）
git checkout main && git merge hotfix/fix-crash
npm version patch
git push origin main --tags

# 4. 必须同步合回 develop，否则下次发布会丢失修复
git checkout develop && git merge hotfix/fix-crash && git push

# 5. 删除 hotfix 分支
git branch -d hotfix/fix-crash
```

## 7. 回滚

- **客户端**：GitHub Releases 页面保留全部历史安装包，重装旧版即可。
- **服务器**：将 `docker run` / compose 的镜像 tag 换回上一个 `x.y.z`（见 DEPLOY.md「回滚」）。
- **代码**：`git revert` 出问题的提交（main 与 develop 都要 revert），禁止 `reset --hard` 已推送的分支。

## 8. 当前状态约定

- 服务器协议变更（消息类型、字段）必须升**主版本**，并同步更新 README「通信协议」章节。
- 每次发布后确认 `package.json` 的 `version` 与最新 tag、CHANGELOG 顶部版本三者一致。
- `main` 只接受经审核的合并；若 GitHub 上已配置分支保护（Settings → Branches），以保护规则为准。
