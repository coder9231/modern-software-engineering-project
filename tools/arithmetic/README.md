# 四则运算旧入口

维护中的 CLI 位于 [`packages/cli`](../../packages/cli/)，数学核心位于 [`packages/core`](../../packages/core/)。先在仓库根目录运行 `npm ci`，推荐使用 `npm exec se-math -- --count 20 --answers`。

旧命令仍可使用：

```powershell
node tools/arithmetic/cli.mjs --count 20 --answers
node tools/arithmetic/load-test.mjs --help
```

本目录只保留兼容入口，统一在根目录运行 `npm test`。容量测试默认仅允许本机目标，具体参数及授权要求见 `--help`。
