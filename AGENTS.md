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

scope 使用小写文件名或模块名（`main` / `renderer` / `server` / `preload`）。

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

## 3. 提交后必须 push

```bash
git push
```

---

## 4. 违反后果

项目已配置 `commit-msg` 钩子（位于 `.githooks/commit-msg`），不符合上述格式的消息会被自动拒绝。请先修改消息再重新提交。

完整规范文档见 `COMMIT_GUIDELINES.md`。
