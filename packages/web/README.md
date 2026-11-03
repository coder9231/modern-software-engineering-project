# 网站工作区

React / Vinext 前端与同源 Worker API，提供代码统计、教学质量指标、版本对比、班级 ZIP 汇总，以及四则运算出题、错题本、24 点挑战和 OCR 复核批改。当前界面与验收范围见[项目说明](../../README.md)和[优化状态](../../docs/upgrade-status.md)。

## 启动与检查

需要 Node.js **22.22.1 或以上**和 npm。以下命令都在仓库根目录执行；四个工作区共用根锁文件和依赖，不在本包独立安装。

```powershell
npm ci
npm run ocr:prepare
npm run dev
```

本机服务启动后打开 [创作空间](http://localhost:5173/#overview)、[代码统计](http://localhost:5173/#counter)或[四则运算](http://localhost:5173/#math)。

```powershell
npm run verify
npm run test:coverage
npm run build
npm start
```

build 准备本机 OCR 资源并生成网站；start 在本地运行构建产物，不自动发布。完整命令、浏览器验收和 Docker 运行说明见[开发者指南](../../docs/guides/developer.md)。

## 维护入口

- [页面](app/page.tsx)、[四则运算界面](components/math-workspace.tsx)：展示与交互。
- [代码服务](lib/code-count-service.mjs)、[数学服务](lib/math-service.mjs)：请求验证与业务调用。
- [共享核心](../core/package.json)：通过 `@se-lab/core/*` 导出算法；本包不维护另一份统计或数学核心。
- [OCR 工作区](../ocr/package.json)：本机印刷体识别与可选 AI 适配器。
- [教师指南](../../docs/guides/teacher.md)、[学生指南](../../docs/guides/student.md)：功能使用与数据边界。

源码只做统计，不执行或持久保存；班级 ZIP 在浏览器有界解包。本机 OCR 仅处理印刷样例，识别文本需要人工逐行核对。可选 AI 识别需要服务端配置，真实手写效果仍待验收。现有线上站点可能运行较早版本，不能由本机测试推断云端功能已更新。
