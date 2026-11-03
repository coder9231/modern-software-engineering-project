# 贡献指南

欢迎从文档、可复现缺陷和最小回归样例开始。先在 Issue 说明使用场景、范围与可观察的验收条件；初次参与可使用[首次贡献模板](.github/ISSUE_TEMPLATE/first-contribution.yml)。模板和标签元数据不代表任务已经创建或指派。

## 开始开发

需要 Node.js 22.22.1 或以上。在仓库根目录运行：

```powershell
npm ci
npm run ocr:prepare
npm run dev
```

仅使用根目录 npm workspaces 与 package-lock.json。添加依赖时指定工作区，例如 npm install 包名 -w @se-lab/web，并一并评审根锁文件。不要在 packages/ 内新建锁文件或复制 node_modules。

当前业务实现位于 packages/core、cli、web、ocr。跨包调用使用 @se-lab/* 的公开导出；core 不依赖文件系统、UI 或 OCR。core 使用严格 JSDoc、声明文件和 checkJs；修改公开数据结构时同步声明与调用方。完整说明见[开发者指南](docs/guides/developer.md)与[架构](docs/architecture.md)。

## 从 Issue 到 Pull Request

1. 在 Issue 中写清输入、预期输出、范围与验收条件，先认领再开始，避免重复劳动。
2. 从最新 main 建立聚焦的分支；自动化协作默认使用 codex/ 前缀，例如 codex/12-fix-review-filter。外部贡献者可 Fork 后提交 PR，写入权限由仓库管理者配置。
3. 小步修改，一次解决一个问题。新增算法行为时加入能区分对错的边界样例；简单文案或样式改动用合适的检查与实际查看验证，不编写复述实现的测试。
4. 使用 Conventional Commits，例如 feat(math): add worksheet option、fix(counter): preserve physical lines、docs: clarify OCR boundary。安装时 prepare 会尝试设置本地提交钩子；钩子不替代 CI。
5. 提交 PR，关联 Issue，说明改变了什么、用户能观察到什么、实际执行了哪些检查、哪些仍未验证。截图、报告和日志应去除隐私，避免加入被忽略的 reports/。
6. 根据反馈修改；由具备权限的成员在检查与评审完成后合并。更新 Issue 与必要的决策记录。

## 提交前检查

```powershell
npm run verify
npm run test:coverage
npm run build
```

verify 包含依赖边界、类型、lint、格式与单元/服务测试；core 的行、分支、函数覆盖率分别至少 90%。格式问题可运行 npm run format 后重新检查。涉及实际用户流程时运行 npm run test:e2e，并记录浏览器、视口与结果；涉及性能时运行 npm run bench，说明机器、Node 版本与基准范围。

新增或修改 OCR 应区分模拟接口测试、真实印刷体、本机图片传输检查、可选 AI 和真实手写验收。提供 Dockerfile、工作流或浏览器测试脚本，不能写成已实跑通过。检查未执行或受环境限制时，直接写明原因与剩余验证。

## 评审标准

- 需求：Issue 的验收条件是否能逐条观察，范围是否集中，界面是否用用户能理解的语言。
- 正确性：正常输入与错误、取消、超时、边界条件是否有证据；分数、物理行等口径是否保持一致。
- 架构：算法是否继续共享，包依赖是否单向，声明、接口和文档是否同步。
- 数据：是否说明上传与本地存储；服务端密钥是否留在服务端；错误信息是否避免暴露密钥和堆栈。
- 使用体验：键盘焦点、标签、手机视口、高对比度、静态模式与打印是否适合本次改动。
- 证据：区分已实现、已验证、已部署；记录对应提交、命令与限制，避免拿历史截图证明新版本。

## 文件与发布边界

不要提交令牌、密码、真实 .env、个人作业、课堂照片、testcase1–testcase3、reports/、生成 OCR 资源、构建产物、浏览器录像或课件转录。需要回归输入时编写最小自有样例；引入第三方材料时保留许可并更新[第三方说明](THIRD_PARTY_NOTICES.md)。贡献者需有权按项目 [MIT](LICENSE) 许可提交自有内容。

本轮保留现有线上站点，只交付源码、CI 与 Docker 配置。合并、推送与部署是不同动作；任何部署均须另行明确安排。不要声称分支保护、审批规则或 GitHub Projects 已启用，除非仓库管理者已经配置并提供可核对证据。职责与建议节奏见[团队文档](docs/team.md)。
