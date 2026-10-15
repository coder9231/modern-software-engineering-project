# testcase1–3 测试报告

测试对象：项目中的 `testcase1`、`testcase2`、`testcase3`。统计规则采用现行工具说明中的物理行、互斥分类和编码规则。

这些课程测试数据和生成的验证证据仅保留在本地，不随公开仓库分发，也不包含在项目 MIT 授权范围。本文保留实际结果摘要；公开源码中的自有样例与自动测试不依赖这些数据。

## 主测试配置与结果

主测试使用 `--no-default-excludes`，完整遍历测试目录，并按 `auto` 编码读取；仍只统计当前支持的扩展名。关闭默认目录排除是为了包含 testcase3 中名为 `coverage` 的真实 Python 源码包。JSON 记录文件明细、跳过项及错误，CSV 记录已统计文件。

| 用例 | 已统计文件 | 总行 | 代码行 | 注释行 | 空白行 | 读取错误 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| testcase1 | 3,599 | 1,150,242 | 541,302 | 481,401 | 127,539 | 0 |
| testcase2 | 0 | 0 | 0 | 0 | 0 | 0 |
| testcase3 | 1,130 | 483,925 | 356,946 | 60,127 | 66,852 | 0 |

三组 CLI 均返回退出码 0，表示扫描完成；有明确原因的跳过项仍保留在报告中。零读取错误不代表所有文件均被统计。

明细输出（本地生成，存放于被 Git 忽略的 `reports/`）：

- testcase1：`reports/testcase1-full.json`、`reports/testcase1-full.csv`。
- testcase2：`reports/testcase2-full.json`、`reports/testcase2-full.csv`。
- testcase3：`reports/testcase3-full.json`、`reports/testcase3-full.csv`。
- 全量物理行核对与旧编码检查：`reports/testcase-validation.json`。
- 独立抽样核对：`reports/large-case-audit.md`、`reports/large-case-audit.json`。
- testcase2 文件签名核验：`reports/testcase2-audit.json`。

以上路径指原验证工作区中的本地文件，公开仓库不提供这些下载。

## testcase2：伪装成源码的图片

共有 150 个文件：`.cpp`、`.java`、`.py` 各 50 个。独立检查确认全部具备 JPEG 起始 `FF D8 FF` 与结束 `FF D9` 标记，并含 NUL 字节；150 个文件的 SHA-256 均不同。

工具在 `auto`、`utf8` 和 `gb18030` 三种配置下均统计为零文件、零行，全部跳过，符合二进制不计入源码的预期。当前分类原因是 `invalid_encoding`：解码检查先于 NUL 检查。这组验证图片数据的拒绝行为，不适合作为源码注释分类的参考答案。

## 编码与扩展名边界

- testcase1 有 **9** 个源码文件无法按默认编码读取：**3 个旧 CRT C 文件、6 个 Java 策略示例**。
- testcase3 有 **6** 个旧 C 示例无法按默认编码读取。
- 对以上 15 个文件逐个追加 `--encoding gb18030` 检查，**12 个中文旧编码文件成功读取**；其结果单独记录在 `testcase-validation.json`，未混入上表的 auto 统计。
- 剩余 **3 个 CRT C 文件**含 Windows-1252 单字节版权符号等内容，UTF-8 与 GB18030 均不适用。当前 CLI 不支持 Windows-1252，需要作为后续编码兼容项。
- testcase1 跳过 **1,393** 个不支持扩展名的文件；testcase3 跳过 **2,627** 个，其中 **2,211 个为 `.pyi` 类型声明文件**。首版支持 `.py`/`.pyw`，尚未声明支持 `.pyi`。

本次保持混合编码目录的默认配置，只对具体旧文件使用显式编码。将整棵混合 UTF-8/GBK 目录统一按 GB18030 读取，可能改变正常 UTF-8 文件的解释。

## 验证证据与范围

- 对上表 **4,729 个已统计文件、1,634,167 个物理行**独立核对总行数和空白行；逐文件、语言汇总、整体汇总均满足 `总行 = 代码 + 注释 + 空白`，没有不一致。
- 对 **15 个代表性文件、9,377 行**作独立语义抽查：8 个 Python 文件使用标准库 `tokenize` 逐行核对，7 个 C/C++/Java 文件使用独立的字符串与注释词法检查，结果一致。
- 独立抽查包括大小写扩展名、中文注释、三引号文档字符串、原始字符串以及字符串中的注释符号。部分旧编码样本在明确解码后验证分析器分类。
- 原有自动测试共 **50 项：45 通过、0 失败、5 跳过**。跳过项为当前 Windows/沙箱下无法构造的链接或 POSIX 权限场景。

全量核对覆盖物理行和统计一致性；代码/注释的外部逐行语义核对覆盖上述抽样文件。目录中没有发现随附的完整标准统计答案，因此结果不作为全体文件的语义正确率结论。

## 默认配置的对照

默认配置下，testcase1 和 testcase2 与主测试相同；testcase3 统计为 **1,037 个文件、455,790 行**，其中代码 336,570、注释 57,639、空白 61,581。

差异来自 `coveragepy_new/coverage` 和 `coveragepy_old/coverage` 两个目录触发默认排除，合计 **93 个源文件、28,135 行**。完整测试目录需要 `--no-default-excludes`；日常项目扫描继续采用工具说明中的默认规则。

默认配置报告分别为 `reports/testcase1.json`、`reports/testcase2.json`、`reports/testcase3.json`。

## 复现命令

公开仓库可在项目根目录运行自有自动测试：

```powershell
node --test tools/code-counter/analyzer.test.mjs tools/code-counter/scanner.test.mjs tools/code-counter/cli.test.mjs
```

以下命令仅适用于保留了原课程数据与本地复核脚本的验证工作区。`reports/verify-testcases.mjs` 是本地证据脚本，未随公开源码分发：

```powershell
node tools/code-counter/cli.mjs testcase1 --no-default-excludes --format json --output reports/testcase1-full.json
node tools/code-counter/cli.mjs testcase2 --no-default-excludes --format json --output reports/testcase2-full.json
node tools/code-counter/cli.mjs testcase3 --no-default-excludes --format json --output reports/testcase3-full.json
node reports/verify-testcases.mjs
```

示例旧编码文件的单独检查：

```powershell
node tools/code-counter/cli.mjs testcase1/testcase1/src_java/strategy/BubbleSort.JAVA --encoding gb18030 --details
```

本轮结论：真实源码的已统计结果通过物理行检查和抽样分类核对；JPEG 伪装文件被拒绝。后续兼容性改进可以针对 Windows-1252、`.pyi`，以及默认排除目录与真实源码包同名的情况分别增加需求和验收样例。
