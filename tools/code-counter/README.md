# 代码统计旧入口

维护中的 CLI 位于 [`packages/cli`](../../packages/cli/)，算法位于 [`packages/core`](../../packages/core/)。先在仓库根目录运行 `npm ci`。推荐使用 `npm exec se-count -- . --details`。

旧命令仍可使用：

```powershell
node tools/code-counter/cli.mjs . --details
node tools/code-counter/cli.mjs tools/code-counter/examples --json
```

此目录只保留兼容入口和原示例，测试统一从根目录运行 `npm test`。请在新工作区修改算法与测试。
