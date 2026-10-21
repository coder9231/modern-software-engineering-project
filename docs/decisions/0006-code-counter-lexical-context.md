# 决策 0006：代码统计的语言上下文

日期：2026-10-21。范围：代码统计修复、验证和 GitHub 源码同步，不发布网站。

## 问题与选择

已有扫描器在普通字符串和注释上有效，但 C/C++ 的反斜杠续行、JS/TS 的正则与除法上下文、Python f-string 表达式内注释可使代码行与注释行混淆。继续叠加通用正则难以对应各语言的不同词法阶段。

保留 `analyzeText(text, language)` 入口与现有报告协议，按语言委派处理：

- C/C++ 用逻辑字符游标删除续行并保留物理行映射。跨行组成的注释分隔符也能识别；C++ raw string 回到原始字符流。
- Python 用迭代状态栈区分普通字符串、f-string 字面量、替换表达式和格式说明。以 Python 3.12 / PEP 701 为依据，表达式注释与字符串中的 `#` 分开。
- JS/TS 使用 `@babel/parser` 的 token 与注释范围，依靠语法上下文选择正则或除法。解析后的范围按物理行映射，零长度模板 token 与 EOF 不产生额外代码行。

CLI 和网站服务都通过同一入口使用这些实现，避免出现两套分类规则。

## 取舍与边界

为提高 JS/TS 正确性，从首版零第三方运行依赖改为显式、锁定的 Babel 运行依赖。先安装 `website` 依赖，再运行 CLI 或测试；CI 同样先安装后测试。

AST 解析有额外内存开销，因此每个 JS/TS 文件设置 64 KiB UTF-8 输入预算。超预算或解析器不能恢复时沿用词法回退，保持大文件与未完成源码可统计，但不保证该路径消除所有正则/除法歧义。此预算限制额外解析工作，不是 Worker 峰值内存或容量保证。规则接口、CLI 文档和验证记录都说明这一边界。

C/C++ 不展开宏、求值 `#if` 或转换旧式 trigraph。C 要求反斜杠紧邻换行，C++ 同时接受 C++23 的中间横向空白。仅剩续行标记的非空行，在代码区计代码、注释区计注释；纯空白物理行仍优先计空白。

Python 不进行完整语法验证，未新增 Python 3.14 t-string；JSX、TSX、SCSS 的扩展名支持范围不变。源码不会被执行。

## 验收

先保留能复现错误的人工逐行预期，再执行语言专项测试、CLI/上传服务/导出一致性测试及原有回归。Python 有效样例另用标准库 `tokenize` 独立核对。实际结果见[语法边界修复记录](../code-counter-lexical-fixes.md)。不把旧数据集结果或线上旧版本的验证作为本轮通过证据。

## 依据

- [C N1570 §5.1.1.2](https://www.open-std.org/jtc1/sc22/wg14/www/docs/n1570.pdf)
- [C++ 翻译阶段](https://eel.is/c++draft/lex.phases)、[raw string 规则](https://eel.is/c++draft/lex.pptoken)
- [Python 3.12 词法规范](https://docs.python.org/3.12/reference/lexical_analysis.html#f-strings)、[PEP 701](https://peps.python.org/pep-0701/)
- [Babel parser API](https://babeljs.io/docs/babel-parser)
