# 现代软件工程课程项目

这是一个由团队逐步完成的课程项目。我们将结合《现代软件工程》的学习，记录需求、设计、实现、验证和复盘过程，并通过可运行的软件展示成果。

已实现代码量统计工具的命令行版本和网站前后端。自主功能现选为课堂图片中的四则运算：提供可配置出题、精确批改、打印、双语界面、计时与本地历史，并重用数学核心实现 24 点。网站使用 React/Vinext；个人展示信息仍待团队补充。四则运算的真实网页联调与发布状态见[本轮测试记录](docs/arithmetic-test-results.md)。

2026-10-17 已发布网站第 4 版“SE Lab · 工程宇宙”：以星图首页和五颗功能星球承接代码统计、四则运算、工程实践、个人主页与项目档案，并加入进入功能的镜头过渡和约 5.4 秒的星系开场。采用原生 CSS/SVG 的 2.5D 表现，保留文字导航、功能直达链接与减少动态效果策略。类型检查、lint、生产构建及本地与线上各 14 项 HTTP 回归通过；桌面与手机本地交互已验收，线上另验星图、开场、键盘进入起源星、部分直达，以及重播和往返星图后的题目与答案保留。代码已推送 GitHub，[代码提交对应 CI](https://github.com/coder9231/modern-software-engineering-project/actions/runs/38988762989) 全部通过。设计与实际结果见[宇宙导航设计决策](docs/decisions/0005-universe-navigation.md)和[验证记录](docs/universe-test-results.md)。

## 运行网站

需要 Node.js **22.13.0 或以上**。在本仓库根目录执行：

```powershell
cd website
npm ci
npm run dev
```

浏览器打开 [http://localhost:5173](http://localhost:5173)。选择项目文件或目录后，浏览器分批提交源码，后端调用共享统计核心返回结果；可使用内置示例验证 2 个文件、14 行、8 行代码、4 行注释、2 行空白。

线上演示：[软件工程实践站](https://se-practice-coder9231.a0910663736.chatgpt.site)。2026-10-15 已设为公开访问，无需登录 ChatGPT 账号。验证过程与边界见 [网站测试记录](docs/web-test-results.md)。

源码仓库：[coder9231/modern-software-engineering-project](https://github.com/coder9231/modern-software-engineering-project)，包含完整前后端、CLI 工具、自有测试和工程文档，欢迎 Fork 与提交 Pull Request。项目自有源码与文档采用 [MIT 许可证](LICENSE)；第三方许可和未公开课程材料的范围见 [许可说明](THIRD_PARTY_NOTICES.md)。

网站运行、接口与限制见 [网站说明](docs/web-code-counter.md)，架构取舍见 [网站设计决策](docs/decisions/0002-web-code-counter.md)。

通过星图中的逻辑星、侧边栏或 [`#math` 入口](https://se-practice-coder9231.a0910663736.chatgpt.site/#math)进入“四则运算”模块，可配置题量、运算符、操作数及答案范围、括号、负数、分数和除法模式。默认每题 2 个运算符、整数 0～100、答案 0～100；固定种子可复现题目，单次最多 10000 道。四则运算于 2026-10-16 随网站第 3 版上线，其历史版本与验收边界见[测试记录](docs/arithmetic-test-results.md)；当前第 4 版加入宇宙导航并通过线上 HTTP 回归。

AI OCR 已实现服务端适配器与人工校正界面，模拟接口测试通过。密钥配置流程中断，尚未取得真实密钥，不能把功能入口视为已通过手写识别验收；人工转录、校正与数学批改独立于 AI 服务。第 3 版曾加入约 4.8 秒的原创胶片氛围开场，可跳过、按 Escape 退出或手动重播；未使用外部电影素材或音乐。该版设计与实测边界见[开场动画设计决策](docs/decisions/0004-cinematic-opening.md)，本轮宇宙主题升级的验收另行记录。

## 运行四则运算工具

需要 Node.js 22 或以上，无第三方依赖：

```powershell
node tools/arithmetic/cli.mjs --count 300 --answers
node tools/arithmetic/cli.mjs --count 10000 --seed course-10000 --json --answers --output reports/arithmetic-10000.json
node --test website/lib/math/core.test.mjs website/lib/math-service.test.mjs website/lib/math-ocr.test.mjs tools/arithmetic/cli.test.mjs
```

CLI 与网站共用数学核心，用调度场算法、逆波兰表达式及精确分数计算；结构去重，题空间不足或搜索达限时明确报错，输出文件仅新建、不覆盖。参数与示例见[四则运算工具说明](tools/arithmetic/README.md)，完整课程需求映射见[四则运算需求](docs/arithmetic-requirements.md)。

启动网站后可运行 `node --test tools/arithmetic/web-api.test.mjs` 做真实 HTTP 功能验收。当前第 4 版的本地与线上回归分别通过数学 8 项和代码统计 6 项 HTTP 检查。容量实验另用 `node tools/arithmetic/load-test.mjs`，历史本地开发服务曾完成 5 并发、100 请求的测量；这不是生产容量承诺。万级并发尚未验证，不能由“生成一万道题”推断。

## 运行代码量统计工具

需要 Node.js 20 或以上，无需安装第三方依赖。在本仓库根目录执行：

```powershell
node tools/code-counter/cli.mjs . --details
node tools/code-counter/cli.mjs tools/code-counter/examples --details
```

支持 C/C++、Java、JavaScript/TypeScript、Python、CSS 和 JSON。可按语言汇总、显示文件明细、排除目录并导出 JSON/CSV；完整参数、统计规则和验收样例见 [工具说明](tools/code-counter/README.md)。

运行自动测试：

```powershell
node --test tools/code-counter/analyzer.test.mjs tools/code-counter/scanner.test.mjs tools/code-counter/cli.test.mjs
```

## 项目方向

- **代码量统计工具**：作为第一个可运行的功能，分析代码文件并展示统计结果。
- **四则运算自主功能**：面向老师出题和学生练习，提供可配置规则、精确批改、可打印练习及 24 点重用案例。
- **个人主页与成果展示**：本轮起源星展示已知 GitHub 账号与真实项目作品；个人介绍和成员职责待补充，不提供资料编辑或云同步。

## 阶段里程碑

| 阶段 | 预期成果 | 状态 |
| --- | --- | --- |
| 需求澄清 | 确认课程要求、统计规则、技术栈和任务分工 | 统计规则和网站技术栈已定义；四则运算主题已选，团队分工待填写 |
| 统计工具最小版本 | 完成约定范围的统计功能及验收样例 | CLI 与网站前后端首版已实现 |
| 自主功能迭代 | 四则运算、可配置练习、批改及模块重用 | 第 3 版首次上线，当前第 4 版宇宙导航继续保留功能；本地与线上 HTTP 已验证，真实 OCR 等独立流程待验收 |
| 主页与展示 | 整理成果、演示流程和课程实践记录 | 第 4 版星图与起源星已上线；个人信息、成员职责与更多成果材料待补充 |

## 仓库导航

- [需求草案](docs/requirements.md)：已确认的范围、待讨论的问题和首版验收建议。
- [学习笔记](docs/learning-notes.md)：将课程概念关联到具体工程实践。
- [团队与分工](docs/team.md)：成员、职责和协作约定。
- [统计工具设计决策](docs/decisions/0001-code-counter.md)：首版实现范围、取舍与验收依据。
- [网站说明](docs/web-code-counter.md)：本地运行、前后端接口、上传限制与验证方式。
- [网站设计决策](docs/decisions/0002-web-code-counter.md)：共享统计核心、无状态接口和部署边界。
- [四则运算需求](docs/arithmetic-requirements.md)：四张课程照片的需求映射、实现规则和验收状态。
- [四则运算设计决策](docs/decisions/0003-arithmetic.md)：RPN、精确有理数、结构去重、种子与 24 点重用。
- [四则运算测试记录](docs/arithmetic-test-results.md)：单元测试、真实 HTTP 验收和容量验证边界。
- [开场动画设计决策](docs/decisions/0004-cinematic-opening.md)：原创胶片意象、跳过与重播、焦点恢复、减少动态效果和浏览器实测。
- [宇宙导航设计决策](docs/decisions/0005-universe-navigation.md)：功能星球、直达导航、业务状态保留与轻量视觉实现。
- [宇宙导航验证记录](docs/universe-test-results.md)：本轮星图、转场、无障碍及功能回归的实际验收状态。
- [协作说明](CONTRIBUTING.md)：Issue、分支、Pull Request 与评审流程。
- [许可与第三方材料](THIRD_PARTY_NOTICES.md)：自有源码、依赖与本地课程材料的授权边界。
- `.github/`：功能与缺陷 Issue 模板、Pull Request 模板。

代码量用于观察规模与变化，项目评价同时关注功能正确性、可维护性和团队协作。

课程测试目录 `testcase1`–`testcase3`、生成报告和原始课堂资料保留在本地，不随公开源码分发。仓库内自有样例与自动测试可以独立运行。
