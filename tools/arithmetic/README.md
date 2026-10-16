# 四则运算命令行工具

网站与命令行直接调用 `website/lib/math/core.mjs`，用调度场算法生成逆波兰表达式，再以精确分数求值。不会使用 `eval`，也不会执行输入的算式或源码。运行需要 Node.js 22 或更高版本，无第三方依赖。

默认生成 20 道题，每题 2 个运算符，使用加减法，整数操作数 0～100，答案 0～100；负数中间结果、括号、分数默认关闭。`--answers` 才会附加标准答案，JSON 也遵循这一规则。

```powershell
node tools/arithmetic/cli.mjs --help
node tools/arithmetic/cli.mjs --count 300 --answers
node tools/arithmetic/cli.mjs --operators "+,-,*,/" --ops 2 --parentheses --answers
node tools/arithmetic/cli.mjs --min -20 --max 20 --negative --result-min -100 --answers
node tools/arithmetic/cli.mjs --fractions --division fraction --denominator 12 --answers
node tools/arithmetic/cli.mjs --operators / --ops 1 --division remainder --answers
```

`--min`、`--max` 控制操作数范围；`--result-min`、`--result-max` 控制最终答案范围。关闭负数时，操作数及每个中间结果均不能为负。分数模式使用精确分子、分母；带余数模式限于非负整数的单次除法，答案形式为 `商 R 余数`，例如 `2 R 1`。

用固定种子生成一万道不重复算式：

```powershell
node tools/arithmetic/cli.mjs --count 10000 --seed course-10000 --json --answers --output reports/arithmetic-10000.json
```

按表达式结构去重，加法、乘法的交换及结合变形视为同题；并不是按文本去重。数量上限 10000；条件太窄时，工具明确报错并退出，不会用重复题补足。相同参数和种子生成相同结果。输出仅允许新建 `.txt` 或 `.json` 文件，拒绝覆盖任何已有文件。

```powershell
node --test tools/arithmetic/cli.test.mjs website/lib/math/core.test.mjs website/lib/math-service.test.mjs
```

打印排版、计时练习、历史记录及 AI 识别批改由网站界面提供；CLI 负责确定性出题和可导出的题目数据。
