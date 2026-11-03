# 代码量统计命令行工具

CLI 负责本机文件扫描与报告输出，网站和命令行通过 `@se-lab/core/counter`、`@se-lab/core/report` 复用同一统计核心。支持 C/C++、Java、JS/TS、Python、Go、Rust、C#、CSS、JSON；源码只被分析，不会执行。

## 运行

需要 Node.js **22.22.1 或以上**。以下命令均在仓库根目录执行：

```powershell
npm ci
node packages/cli/src/code-counter/cli.mjs . --details
node packages/cli/src/code-counter/cli.mjs "D:/my project" --json --output reports/code-count.json
node packages/cli/src/code-counter/cli.mjs . --format csv --output reports/code-count.csv
node packages/cli/src/code-counter/cli.mjs . --extensions .go,.rs,.cs --exclude "tests/**"
node packages/cli/src/code-counter/cli.mjs --help
node packages/cli/src/code-counter/cli.mjs --languages
```

按物理行互斥分类：总行数 = 代码行 + 注释行 + 空白行。字符串中的注释符号不会直接视为注释；C/C++ 续行、JS/TS 正则上下文与 Python f-string 使用各自分类器。解析预算和语言边界见[共享统计核心](../../../core/src/code-counter/analyzer.mjs)。默认跳过依赖、构建与报告目录，不跟随符号链接；可通过参数调整筛选、大小和编码。

--output 会覆盖指定报告，但拒绝与输入源码相同的路径或别名。JSON 保留明细与跳过原因；CSV 使用 UTF-8 BOM 并转义公式形式的文件名。完整参数以 --help 为准。

## 质量与验证

教学用复杂度估计、纯注释率、片段重复率与版本报告比较由 `@se-lab/core/quality` 提供，见[质量算法](../../../core/src/code-quality.mjs)；它们不能替代评审或用于判定抄袭。网站使用步骤见[教师指南](../../../../docs/guides/teacher.md)。

```powershell
npm run verify
npm run test:coverage
npm run cli:bundle
npm run cli:native
```

单文件与原生交付的运行条件见[原生 CLI 说明](../../../../docs/native-cli.md)。项目入口和最新验收边界见[根 README](../../../../README.md)与[优化状态](../../../../docs/upgrade-status.md)。历史 tools/ 命令保留兼容入口，新功能在 packages/ 中维护。
