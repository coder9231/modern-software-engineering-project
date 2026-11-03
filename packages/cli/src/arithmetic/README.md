# 四则运算命令行工具

CLI 与网站通过 `@se-lab/core/math` 复用[数学核心](../../../core/src/math/core.mjs)：调度场算法生成逆波兰表达式，以精确分数求值；不使用 eval，也不执行输入的算式或源码。

## 运行

需要 Node.js **22.22.1 或以上**。以下命令均在仓库根目录执行：

```powershell
npm ci
node packages/cli/src/arithmetic/cli.mjs --help
node packages/cli/src/arithmetic/cli.mjs --count 300 --answers
node packages/cli/src/arithmetic/cli.mjs --operators "+,-,*,/" --ops 2 --parentheses --answers
node packages/cli/src/arithmetic/cli.mjs --fractions --division fraction --denominator 12 --answers
node packages/cli/src/arithmetic/cli.mjs --count 10000 --seed course-10000 --json --answers --output reports/arithmetic-10000.json
```

默认生成 20 题，每题 2 个运算符，使用加减法，整数操作数与最终答案范围均为 0～100；括号、分数与负中间结果默认关闭。--answers 才附加答案，JSON 输出也遵循该规则。所有参数以 --help 为准。

同参数、同种子生成相同题目；按表达式结构去重，数量上限 10000，条件过窄时报错，不以重复题补足。输出只新建 txt/json 文件，拒绝覆盖已有文件。

## 验证与界面

```powershell
npm run verify
npm run test:coverage
npm run cli:bundle
npm run cli:native
```

网站提供可编辑教学预设、计时作答、错题本、试卷/独立答案卷打印、24 点挑战与 OCR 复核批改；CLI 专注确定性出题和题目数据导出。见[教师指南](../../../../docs/guides/teacher.md)、[学生指南](../../../../docs/guides/student.md)、[原生 CLI 说明](../../../../docs/native-cli.md)与[项目入口](../../../../README.md)。历史 tools/ 命令保留兼容入口，现行实现位于 packages/。
