# 💕 Bubbly - Git Commit 规范

## 提交格式

```
<type>(<scope>): <中文描述>
```

- **type**：变更类型，必须从下表选择
- **scope**：影响范围，使用文件名或模块名（小写）
- **描述**：一行中文，说明"做了什么"，不需要冒号

## type 取值

| type | 含义 | 示例 |
|------|------|------|
| `feat` | 新功能 | `feat(renderer): 添加表情包选择器` |
| `fix` | 修复缺陷 | `fix(server): 增加心跳保活机制` |
| `docs` | 文档变更 | `docs: 更新 README 常见问题` |
| `refactor` | 重构（无功能变更） | `refactor(main): 重构窗口创建逻辑` |
| `test` | 测试相关 | `test: 新增 peer-joined 测试用例` |
| `chore` | 构建/依赖/配置 | `chore: 补充 electron-builder 依赖` |
| `style` | 格式/样式（不影响逻辑） | `style: 统一缩进与格式化` |
| `perf` | 性能优化 | `perf(renderer): 减少区域穿透重算` |
| `ci` | CI/CD 配置 | `ci: 配置 GitHub Actions` |

## 分条提交原则

**一条 commit 只包含一个逻辑单元的变更。**

### ✅ 正确：按文件/模块拆分

```
fix(main): 修复跨平台崩溃与单实例锁定
fix(renderer): 清理调试代码并修复重连逻辑
fix(server): 增加心跳保活机制
chore: 补充依赖
test: 新增测试用例
```

### ❌ 错误：把所有改动混在一起

```
fix: 修复各种 bug 并更新依赖和测试
```

### 判断依据

- 改动的**目的不同** → 分开提交
- 涉及的文件**职责不同**（主进程 vs 渲染进程 vs 服务器） → 分开提交
- 功能代码和测试代码 → 分开提交
- 代码变更和纯文档/配置变更 → 分开提交

## 提交后检查

每次提交后确认远端已更新：

```bash
git push
```

## 违规处理

`commit-msg` 钩子会自动校验 commit message 格式。不符合规范的消息会被拒绝提交，请修改后重试。

---

## 历史记录示例

```
f3c2142 test: 新增 peer-joined 加入通知测试用例
0e0e102 chore: 补充 electron-builder 依赖与作者信息
5e153b7 fix(server): 增加心跳保活与消息大小限制
71353d7 fix(renderer): 清理调试代码并修复重连、消息队列与用户ID
408a463 fix(main): 修复跨平台崩溃、单实例锁定与透明背景
```
