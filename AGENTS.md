# AGENTS.md — Bubbly 项目开发约束

此文件是留给后续 AI agent 的执行规范。每次对本项目进行修改并提交时，**必须**遵循以下规则。

---

## 1. Commit 格式（Conventional Commits）

```
<type>(<scope>): <中文描述>
```

| type | 含义 | 示例 |
|------|------|------|
| `feat` | 新功能 | `feat(renderer): 添加表情包选择器` |
| `fix` | 修复缺陷 | `fix(server): 增加心跳保活机制` |
| `docs` | 文档变更 | `docs: 更新 README 常见问题` |
| `refactor` | 重构 | `refactor(main): 重构窗口创建逻辑` |
| `test` | 测试相关 | `test: 新增 peer-joined 测试用例` |
| `chore` | 构建/依赖/配置 | `chore: 补充 electron-builder 依赖` |
| `style` | 格式/样式 | `style: 统一缩进与格式化` |
| `perf` | 性能优化 | `perf(renderer): 减少区域穿透重算` |
| `ci` | CI/CD 配置 | `ci: 配置 GitHub Actions` |

scope 使用小写文件名或模块名（如 `main` / `renderer` / `server` / `preload` / `build` / `tests`），同一模块保持用词一致。

---

## 2. 分条提交原则（强制）

**一条 commit 只包含一个逻辑单元的变更，绝不允许把无关改动混在一起提交。**

按以下维度拆分：

- **目的不同** → 分开提交（如"修 bug"和"加测试"是两条）
- **文件职责不同** → 分开提交（主进程 vs 渲染进程 vs 服务器）
- **代码 vs 文档/配置** → 分开提交
- **业务代码 vs 测试代码** → 分开提交

❌ 反例：
```
fix: 修复各种 bug 并更新依赖和测试
```

✅ 正例：
```
fix(main): 修复跨平台崩溃与单实例锁定
fix(renderer): 清理调试代码并修复重连逻辑
chore: 补充 electron-builder 依赖
test: 新增 peer-joined 测试用例
```

---

## 3. 分支管理规范（强制）

| 分支 | 用途 | 保护级别 |
|------|------|----------|
| `main` | 稳定发布分支，所有版本标签只从 main 打出 | **禁止直接 push，禁止未经审核的改动** |
| `develop` | 默认开发分支，日常开发与功能集成在此进行 | 可 push |
| `feat/*` / `fix/*` | 单个功能或修复的开发分支，从 develop 切出，完成后合回 develop | 本地使用 |

**规则：**

1. **默认一律在 `develop` 分支开发**；较大或风险较高的改动从 develop 切出 `feat/xxx` 分支，完成后合回 develop。
2. **未经以下完整流程，绝不允许改动远程 `main`**：
   1. develop 上 CI 全绿（lint + 全部测试通过）；
   2. 人工审核确认；
   3. 通过 PR 或审核确认后的显式合并操作合入 main。
3. 版本发布标签（`v*`）**只允许打在 main 上**，develop 上禁止打发布标签。
4. 线上紧急修复：从 main 切出 `hotfix/*` → 修复 → 合回 main（随后发布），**并同步合回 develop**。
5. 提交后必须 push 到**当前开发分支**（见第 5 节），而非 main。
6. 每次开发前先 `git checkout develop && git pull` 确认在最新 develop 上工作。

---

## 4. 版本与变更日志规范（强制）

- **版本号唯一真源**是 `package.json` 的 `version` 字段，遵循 [SemVer](https://semver.org/lang/zh-CN/)（`主.次.修`）：
  - `patch`：bug 修复，不影响功能
  - `minor`：向后兼容的新功能
  - `major`：不兼容的协议/配置变更
- 当前版本基线：**v1.0.0**（2026-09-19 发布）。
- `CHANGELOG.md` 必须与版本同步维护：
  - 任何功能性改动（feat/fix/perf/refactor）合入 develop 前，先在 `CHANGELOG.md` 的 `[Unreleased]` 段登记，按 Added / Changed / Fixed / Removed 分类；
  - 发布时把 `[Unreleased]` 改为对应版本号与日期；**不允许出现"版本已发布但日志缺失"**；
  - 纯文档/CI 改动可不登记。
- **三处一致性**强制校验，发布前缺一不可：`package.json` 的 `version` = 最新 `v*` 标签 = CHANGELOG 最新版本段。
- 详细发布操作步骤见 `docs/RELEASE.md`。

---

## 5. 提交后必须 push

```bash
git push
```

推送到当前开发分支（develop 或 feature 分支），**不要**为了"同步"而直接 push main。

---

## 6. 禁止遗留临时/测试文件（强制）

**完成开发后，必须清理所有临时文件、调试脚本、测试页面和残留产物，不得将其提交到 git。**

常见残留类型：

| 类型 | 示例 |
|------|------|
| 调试脚本 | `debug-*.mjs`、`debug-*.js` |
| 演示脚本 | `demo-*.js` |
| 测试页面 | `test-*.html` |
| 测试副本 | `test-*.js`（已有正式 `server.js` 时不应保留） |
| 系统残留 | `nul`、临时文件 |

**规则：**
- 调试/测试文件用完后**立即删除**，不得留在工作目录
- 提交前用 `git status` 检查，确认无非预期文件
- 项目目录中只保留正式的业务代码、配置文件和文档
- 测试工具如确有需要，放在独立的 `tests/` 目录并纳入 `.gitignore` 或作为依赖管理

**清理命令：**
```bash
# 删除未跟踪文件（谨慎使用，先确认）
git clean -fd

# 从 git 中删除已跟踪的残留文件
git rm <文件名>
```

---

## 7. 违反后果

不合规的 commit message、分支操作与版本/日志遗漏，会在人工审核（PR review）环节被驳回，必须修改后才能合入。

> 原 `.githooks/commit-msg` 自动校验钩子因从未激活（git 默认不读取 `.githooks/`）已移除；
> 如需恢复强制校验，可从 git 历史还原该文件并执行 `git config core.hooksPath .githooks`。

违反分支管理规范（未经审核改动 main）或版本/日志规范的行为，等同于破坏发布基线，必须在合入前纠正。

版本发布与上线流程见 `docs/RELEASE.md`。
