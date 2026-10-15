# SE Lab · 软件工程实践平台

现代软件工程课程项目的网站，包含 React 页面与同源统计 API。代码统计为当前可用功能，自主功能和真实个人主页内容待后续迭代。

## 运行

需要 Node.js >=22.13.0：

```powershell
npm ci
npm run dev
```

访问终端输出的地址，默认 http://localhost:5173。`npm run build` 构建 Cloudflare Worker；`npm start` 在本机预览构建结果，不会自动上线。

## 功能与目录

- `app/page.tsx`：文件/文件夹上传、筛选、批次进度、结果图表、明细与下载。
- `app/api/code-count/**`：配置、示例、上传统计、报告导出。
- `lib/code-counter/`：与课程项目 CLI 共用的统计和序列化核心。
- `lib/code-count-service.mjs`：输入验证、编码解码、内存统计和导出校验。
- `.openai/hosting.json`：绑定当前 Sites 站点；不包含凭据。

支持 C/C++、Java、JavaScript/TypeScript、Python、CSS、JSON。每批最多 100 文件、4 MiB，单文件最多 4 MiB。源码只用于当前请求，不执行或持久保存。超大报告在浏览器中用同一序列化器导出，避免再次上传大报告。

## 验证

```powershell
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js app lib/code-count-service.mjs lib/code-count-service.test.mjs lib/code-count-service.d.mts
```

在完整课程仓库中，另从根目录运行 CLI、API 服务及 HTTP 联调测试；服务测试中的 CLI 对照项依赖仓库根目录的 `tools/`。完整接口说明和工程决策见课程仓库 `docs/web-code-counter.md` 与 `docs/decisions/0002-web-code-counter.md`。

线上演示：https://se-practice-coder9231.a0910663736.chatgpt.site 。站点现已公开，访问与统计均不需要 ChatGPT 账号登录。源码按项目根目录 MIT 许可证开放，第三方代码保留各自许可。使用本地构建产物发布；开发预览的模拟登录不会包含在生产版本中。尚未进行一万用户并发压测。
