# 现代软件工程课程项目

这是一个由团队逐步完成的课程项目。我们将结合《现代软件工程》的学习，记录需求、设计、实现、验证和复盘过程，并通过可运行的软件展示成果。

已实现代码量统计工具的命令行版本和网站首版前后端。网站使用 React/Vinext，提供项目文件选择、统计结果、过滤与报告导出，并预留课程实践、个人主页与后续自主功能入口。自主功能的主题和个人展示信息仍待团队补充。

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
- **自主设计功能**：围绕实际问题设计功能，具体主题待确定。
- **个人主页与成果展示**：网站已有展示入口，个人介绍、成员信息和成果材料待补充。

## 阶段里程碑

| 阶段 | 预期成果 | 状态 |
| --- | --- | --- |
| 需求澄清 | 确认课程要求、统计规则、技术栈和任务分工 | 统计规则和网站技术栈已定义；自主功能与分工待确认 |
| 统计工具最小版本 | 完成约定范围的统计功能及验收样例 | CLI 与网站前后端首版已实现 |
| 自主功能迭代 | 明确使用场景，逐步实现并收集反馈 | 待开展 |
| 主页与展示 | 整理成果、演示流程和课程实践记录 | 网站入口已有；个人信息与成果材料待补充 |

## 仓库导航

- [需求草案](docs/requirements.md)：已确认的范围、待讨论的问题和首版验收建议。
- [学习笔记](docs/learning-notes.md)：将课程概念关联到具体工程实践。
- [团队与分工](docs/team.md)：成员、职责和协作约定。
- [统计工具设计决策](docs/decisions/0001-code-counter.md)：首版实现范围、取舍与验收依据。
- [网站说明](docs/web-code-counter.md)：本地运行、前后端接口、上传限制与验证方式。
- [网站设计决策](docs/decisions/0002-web-code-counter.md)：共享统计核心、无状态接口和部署边界。
- [协作说明](CONTRIBUTING.md)：Issue、分支、Pull Request 与评审流程。
- [许可与第三方材料](THIRD_PARTY_NOTICES.md)：自有源码、依赖与本地课程材料的授权边界。
- `.github/`：功能与缺陷 Issue 模板、Pull Request 模板。

代码量用于观察规模与变化，项目评价同时关注功能正确性、可维护性和团队协作。

课程测试目录 `testcase1`–`testcase3`、生成报告和原始课堂资料保留在本地，不随公开源码分发。仓库内自有样例与自动测试可以独立运行。
