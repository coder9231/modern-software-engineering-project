# 代码统计语法边界修复记录

日期：2026-10-21。范围：共享统计核心、CLI 和上传服务；实现与验证在本地完成，本轮按用户要求同步 GitHub，网站未部署。

## 已修复的复现

| 自有回归输入 | 修复后预期 |
| --- | --- |
| C：`// continued comment \` 换行 `not_code();` 换行 `int actual = 1;` | 3 行：代码 1、注释 2 |
| TS：`const ratio = class {} / 2; /* block` 换行 `still a comment */` 换行 `// last` | 3 行：代码 1、注释 2 |
| Python：f-string 替换表达式中的独立 `#` 注释行 | 注释行；字面量中的 `#` 仍为代码 |

三类输入均经过 CLI 实际子进程、上传服务及 JSON 导出，核对人工预期。接口、报告字段与互斥分类口径不变：`total = code + comment + blank`，空白行优先，代码与注释混合的行计代码。

## 新增回归范围

- C/C++ 13 项：三种换行、单双反斜杠、跨物理行组成注释分隔符、字符串转义、宏续行、raw string、数字分隔、C++23 横向空白及长续行链。
- JS/TS 15 项：class 表达式与声明、arrow、async/await/yield、类型断言、泛型、非空断言、模板、正则字符类、hashbang、范围映射、非法源码及解析预算。
- Python 21 项：PEP 701 表达式注释、同引号复用、嵌套 f-string、格式说明、raw 前缀、双花括号、转义、debug/conversion、深嵌套及可选标准库分词核对。
- CLI/上传服务/导出一致性 3 项。

上述专项与集成共新增 52 项测试；真实 HTTP 测试另新增 1 项，将三类输入同时上传到本地 Worker。Python 的 Node 回归无需安装 Python；设置 `CODE_COUNTER_PYTHON` 指向 Python 3.12+ 后，额外启用标准库 `tokenize` 独立核对。

## 本轮实际验证

在 Windows、Node.js 24.19.0 运行覆盖统计、扫描、CLI、上传服务及原有四则运算的完整回归：**176 项，171 通过、0 失败、5 跳过**。5 项跳过均为当前环境不可构造的 hard link、symbolic link 或 POSIX 权限场景；没有跳过本轮语法修复用例。

设置 bundled Python 3.12.14 后，**15 个有效 Python 样例与标准库 `tokenize` 的逐行分类一致**。分词器仅读取字符串，不执行被统计源码。

复现命令（仓库根目录，先安装依赖）：

```powershell
npm --prefix website ci
# 可选：填写自己本机 Python 3.12+ 的路径，启用独立核对
$env:CODE_COUNTER_PYTHON = 'C:\path\to\python.exe'
node --test tools/code-counter/analyzer.test.mjs tools/code-counter/c-family.test.mjs tools/code-counter/javascript.test.mjs tools/code-counter/python-fstring.test.mjs tools/code-counter/language-integration.test.mjs tools/code-counter/scanner.test.mjs tools/code-counter/cli.test.mjs website/lib/code-count-service.test.mjs website/lib/math/core.test.mjs website/lib/math-service.test.mjs website/lib/math-ocr.test.mjs tools/arithmetic/cli.test.mjs
```

本地 `tsc --noEmit --incremental false`、统计核心与服务的 ESLint 检查均以退出码 0 完成。官方 `build-site.mjs` 本地构建成功，client、SSR、RSC 及现有 API 路由均完成编译；未保存线上版本或发起部署。构建仍有框架插件耗时与首页路由静态分类提示，不作为统计接口失败。本记录不将这些检查推断为线上或浏览器验收通过。

在 `http://127.0.0.1:8787` 启动构建后的本地 Worker，设置 `CODE_COUNTER_URL` 后执行 `tools/code-counter/web-api.test.mjs`：**7/7 通过、0 跳过**。新增请求中 C、TS、Python 三文件的合计为 11 行、代码 5、注释 6、空白 0，逐文件也符合人工预期；原健康检查、示例、编码、参数拒绝、4 MiB 边界、二进制跳过及下载回归同时通过。没有向线上演示站提交请求。

原自有示例 CLI 实测仍为 2 文件、14 行、代码 8、注释 4、空白 2。本地预览仅用于后端验证，未进行浏览器 UI 验收。

原 `testcase1–3` 报告是旧版本历史结果，本轮没有将其全量语义验证重新执行。

## 仍需明确的边界

- JS/TS 在每文件 64 KiB UTF-8 预算内走语法解析。超预算、未支持的语法或无法恢复的语法错误会回退到原词法扫描，仍可能存在上下文误判。预算限制额外解析工作，不代表已证明生产内存或并发容量。
- C/C++ 没有展开宏、求值条件编译或转换旧式 trigraph；C 与 C++23 的续行空白规则分别处理。
- Python 以 3.12 / PEP 701 词法为依据，不验证完整语法，未新增 3.14 t-string。
- 本轮未扩展 JSX、TSX、HTML、SQL 等语言支持范围。

架构与依赖取舍见[决策 0006](decisions/0006-code-counter-lexical-context.md)。
