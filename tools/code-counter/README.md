# 代码量统计工具

命令行与网站后端共用统计核心；建议使用 Node.js 22.13 或以上。JS/TS 使用锁定版本的 `@babel/parser` 处理语法上下文，首次使用在仓库根目录执行 `npm --prefix website ci`。统计核心、文件扫描、报告格式和命令行入口分别组织，源文件只被分析，不会执行。

## 直接运行

在项目根目录执行：

```powershell
# 统计当前项目，并显示每个文件及跳过原因
node tools/code-counter/cli.mjs . --details

# 统计一个文件或其他项目；含空格的路径需要引号
node tools/code-counter/cli.mjs "D:/my project/main.py"
node tools/code-counter/cli.mjs "D:/my project"

# 只统计指定扩展名，排除测试目录
node tools/code-counter/cli.mjs . --extensions .java,.py --exclude "tests/**"

# 导出报告；指定报告文件本身会自动从这次扫描中排除
node tools/code-counter/cli.mjs . --format json --output reports/code-count.json
node tools/code-counter/cli.mjs . --format csv --output reports/code-count.csv --exclude "reports/**"

# 旧编码源码可显式指定 GB18030（也兼容常见 GBK 文件）
node tools/code-counter/cli.mjs "D:/legacy project" --encoding gb18030

# 查看全部参数与语言
node tools/code-counter/cli.mjs --help
node tools/code-counter/cli.mjs --languages
```

指定 `--output` 时会覆盖该报告文件并自动创建父目录；不会覆盖与输入相同的路径、硬链接或路径别名，也不允许报告文件为符号链接。文本与 JSON 报告包含语言汇总，JSON 还保留文件明细、跳过条目和读取错误；CSV 导出文件明细，采用带 BOM 的 UTF-8 编码。CSV 中以 `=`、`+`、`-`、`@` 或控制字符开头的文件名会加单引号前缀，便于表格软件按文本显示；JSON 保留原始路径。

## 支持的扩展名

| 语言 | 扩展名 |
| --- | --- |
| C | `.c`、`.h` |
| C++ | `.cpp`、`.cc`、`.cxx`、`.hpp`、`.hh`、`.hxx` |
| Java | `.java` |
| JavaScript | `.js`、`.mjs`、`.cjs` |
| TypeScript | `.ts`、`.mts`、`.cts` |
| Python | `.py`、`.pyw` |
| CSS | `.css` |
| JSON | `.json` |

扩展名不区分大小写；`.h` 默认归入 C。首版不处理 JSX、TSX、SCSS、HTML/Vue、SQL 等其他语法，未支持的扩展名会被明确记录为跳过。

## 统计规则

- 按**物理行**计数，支持 LF、CRLF 和 CR 换行。空文件为零行，末尾换行不会额外制造一行。
- 分类互斥：**总行数 = 代码行 + 注释行 + 空白行**。
- 只含空白字符的物理行归为空白行，即使位于多行注释或字符串内。
- 一行只包含注释及空白时归为注释行；同时有代码和注释时归为代码行。
- 字符串中的 `//`、`/* */`、`#` 不视为注释。Python 三引号字符串（包括文档字符串）归为代码。
- C/C++、Java、JS/TS 识别 `//` 和 `/* */`；CSS 识别 `/* */`；Python 识别 `#`。JSON 的非空白行全部计为代码，不校验 JSON 是否有效。
- JS/TS 支持常见正则表达式、模板字符串及模板插值；C++ 支持原始字符串，Java 支持文本块。

语言分类分工如下：C/C++ 在注释识别前处理反斜杠续行并映射回原始物理行；Python 按 3.12 / PEP 701 用状态栈区分 f-string 字面量、替换表达式和格式说明；JS/TS 用 Babel 语法解析器的 token 与注释范围识别正则、除法和模板。为限制 AST 分配，JS/TS 解析预算为每文件 64 KiB（按 UTF-8 计算）；超预算、未支持的语法或无法恢复的语法错误会回退到原词法扫描，此时仍可能有上下文误判，结果为尽力统计。C/C++ 不展开宏或判断条件编译，不翻译旧式 trigraph；Python 不做完整语法验证，也未新增 3.14 t-string。统计的是源码行数，文件能否编译以及代码质量需另行验证。

## 扫描与排除

默认递归扫描目录，跳过其中的 `.git`、`.svn`、`.hg`、`node_modules`、`.venv`、`venv`、`__pycache__`、`dist`、`build`、`target`、`coverage`、`reports` 目录，避免把本工具导出的报告再次算作源码。明确作为输入选中的根目录仍会扫描；可用 `--no-default-excludes` 关闭默认排除。

`--exclude` 可重复使用。无斜杠的模式（例如 `*.test.mjs`）匹配任意层级的文件或目录名；含斜杠的模式相对输入目录匹配。`*` 匹配单个路径段，`**` 可跨目录，`?` 匹配单个字符。例如 `generated/**` 会排除该目录及其全部后代，`**/test/*.js` 匹配各层级 test 目录下的 JS 文件。不会自动读取 `.gitignore`。

不会跟随文件或目录的符号链接。默认跳过超过 10 MB 的文件，可用 `--max-size` 调整。默认识别 UTF-8/UTF-16 的 BOM，无 BOM 时严格按 UTF-8 读取；指定 `gb18030` 时，BOM 仍优先。含 NUL 的解码文本、无法解码的文件及其他跳过项都保留原因。

退出码：`0` 表示扫描完成（可存在有说明的跳过项），`1` 表示参数、输入路径或保存报告失败，`2` 表示部分文件或目录读取失败，报告可能不完整。使用 JSON/CSV 输出时诊断消息写到标准错误，不会破坏标准输出的报告内容；CSV 的读取错误会逐条显示在标准错误中。

## 验收与测试

在项目根目录执行：

```powershell
node tools/code-counter/cli.mjs tools/code-counter/examples --details
node --test tools/code-counter/analyzer.test.mjs tools/code-counter/c-family.test.mjs tools/code-counter/javascript.test.mjs tools/code-counter/python-fstring.test.mjs tools/code-counter/language-integration.test.mjs tools/code-counter/scanner.test.mjs tools/code-counter/cli.test.mjs
```

示例目录只有两个源文件，人工预期如下：

| 文件 | 总行 | 代码 | 注释 | 空白 |
| --- | ---: | ---: | ---: | ---: |
| `sample.java` | 7 | 3 | 3 | 1 |
| `sample.py` | 7 | 5 | 1 | 1 |
| 合计 | 14 | 8 | 4 | 2 |

自动测试使用 [Node.js 内置测试运行器](https://nodejs.org/docs/latest-v24.x/api/test.html)，包含词法边界、编码、目录遍历、排除与过滤、汇总一致性、JSON/CSV 导出及 CLI 错误处理。Windows 环境无法构造的权限或符号链接场景会说明原因后跳过；可在支持这些能力的环境中运行对应测试。
