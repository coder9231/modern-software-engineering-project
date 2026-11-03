# 开发者指南

以 packages/ 为唯一业务源码，根目录负责依赖和工程检查。[架构说明](../architecture.md)给出依赖图与数据时序，[贡献指南](../../CONTRIBUTING.md)说明协作规则。

## 环境与运行

要求 Node.js ≥22.22.1；CI 与 Docker 当前配置使用 Node 24。只在根目录安装，根 package-lock.json 是依赖解析依据，不要为子包生成另一份锁文件。

```powershell
npm ci
npm run ocr:prepare
npm run dev
```

开发站点为 [http://localhost:5173](http://localhost:5173)。ocr:prepare 从已安装且由锁文件校验的 npm 包复制 Worker、WASM、英文印刷体模型、许可与 manifest 到 packages/web/public/ocr/，自身不联网下载；首次 npm ci 仍需要依赖来源可访问。生成资源被忽略，不提交。build 的 prebuild 也会准备 OCR 资源。

```powershell
npm run build
npm start
```

build 通过 Vinext/Vite 生成 packages/web/dist；start 使用 Wrangler 本地 Worker 运行构建产物，默认 127.0.0.1:5173。它不是发布命令。website/、tools/ 是历史兼容入口；修改 packages/ 中的源码，不复制业务实现回旧目录。

## 工作区职责

| 包           | 职责与入口                                         | 约束                                                        |
| ------------ | -------------------------------------------------- | ----------------------------------------------------------- |
| @se-lab/core | ./math、./counter、./report、./quality、./learning | 共享算法；严格 JSDoc/checkJs；无 UI、文件系统、OCR 反向依赖 |
| @se-lab/cli  | src/code-counter/cli.mjs、src/arithmetic/cli.mjs   | Node 文件扫描、参数、报告输出；通过公开包接口调用 core      |
| @se-lab/web  | app/、components/、lib/                            | React/Vinext 页面，Worker API，界面与 HTTP 边界             |
| @se-lab/ocr  | ./browser、./server                                | 本机 Tesseract 与可选 AI 适配；不反向依赖 web               |

core 的 .mjs 是实现，JSDoc 和 .d.mts 提供契约；tsconfig 启用 allowJs、checkJs、strict、noEmit。修改公开字段时同步声明、类型契约样例与消费者。跨包使用 @se-lab/* 导出，包内相对引用只留在本包。

## 命令与质量门禁

| 根命令                | 用途                                                                      |
| --------------------- | ------------------------------------------------------------------------- |
| npm run verify        | 依赖边界→类型→lint→格式→自动测试                                          |
| npm test              | 发现 packages 中的 .test.mjs，运行算法、CLI、服务与组件导出辅助测试       |
| npm run test:coverage | 运行同套测试，对 core/src 行、分支、函数分别设 90% 门禁                   |
| npm run test:e2e      | Playwright 桌面 Chromium、Firefox、WebKit 与 Chromium 手机视口流程        |
| npm run build         | 准备本机 OCR 资源并生产构建                                               |
| npm run bench         | 固定种子数学 1000 题、JS 1000 行测量，输出 reports/benchmark-results.json |
| npm run cli:bundle    | 打包两个单文件 ESM CLI；运行仍需 Node                                     |
| npm run cli:native    | 使用 Node 24 SEA 构建当前系统/架构的原生单文件 CLI                        |
| npm run format        | 格式化工程脚本与工作区代码                                                |
| npm run ocr:prepare   | 从已安装依赖准备同站点 OCR 资源                                           |

bench 预热后取 5 次中位数；有 .baseline 时比较同类任务，没有基线就只核对绝对预算。当前预算是数学 3000 ms、JS 1000 ms；有基线时上限为 min（绝对预算，max（20 ms，基线 × 3））。20 ms 下限用于减少短任务计时波动，绝对预算始终保留。因此它只提供指定任务的粗粒度退化检测，不是生产容量或浏览器帧率承诺。

需要 Playwright 浏览器时，在开发环境明确安装：

```powershell
npx playwright install chromium firefox webkit
npm run test:e2e
```

可指定已有受支持浏览器通道（例如本机 Edge）：

```powershell
$env:PLAYWRIGHT_CHANNEL = "msedge"
npm run test:e2e -- --project=chromium --project=mobile
Remove-Item Env:PLAYWRIGHT_CHANNEL
```

PLAYWRIGHT_CHANNEL 只作用于 Chromium 与 mobile 项目；上例选中这两个项目，不会启动 Firefox/WebKit。完整跨引擎检查需要安装三种引擎后运行未筛选的 test:e2e。WebKit 测试也不等同于安装版 Safari 或特定苹果设备验收。

E2E_BASE_URL 可指向已启动的**本地测试服务**，设置后测试不会自动启服务。测试会上传自有样例、生成/批改练习并写浏览器记录，不要随意指向真实公共站点。手机项目是 Chromium 手机视口，不是实体 iPhone。人工修正 OCR 识别错误后再批改符合产品流程；此流程通过不表示识别逐字准确。

## HTTP 接口与传输

| 接口                                                   | 用途                                           |
| ------------------------------------------------------ | ---------------------------------------------- |
| GET /api/health                                        | 本地/容器健康检查                              |
| GET /api/code-count/config、/api/code-count/demo       | 统计规则与自有示例                             |
| POST /api/code-count、/api/code-count/export           | 分批源码统计、报告格式化导出                   |
| POST /api/code-quality                                 | 有限源码的教学质量估计                         |
| GET /api/math/config                                   | 数学规则与状态                                 |
| POST /api/math/generate、/api/math/generate/stream     | 普通出题、NDJSON 按需分块出题                  |
| POST /api/math/grade、/api/math/evaluate、/api/math/24 | 重新计算批改、解析与 24 点                     |
| GET/POST /api/math/ocr                                 | 可选 AI 状态/识别；本机 OCR 不向此接口上传图片 |

统计每批最多 100 文件、4 MiB 原始内容，单文件最多 4 MiB；HTTP 请求还校验实际体积、类型、来源、相对路径与编码。质量分析另有累计 1 Mi 字符预算和不可用情形。不是所有代码统计可接受的输入都能给出可靠的质量估计。

流式生成从请求规则调用 core 迭代器，ReadableStream 每次拉取最多 32 题，30 秒服务端期限，客户端 35 秒保护；完整性验证通过后才提交到当前练习。取消、连接断开与失败会清理迭代器，避免把部分题目替换成正式卷。

## OCR 配置

本机模式使用同站点 /ocr/ 资源，图片在浏览器处理，无外部 CDN 或 AI 请求；并不代表整个网站无需网络。默认英文数字/符号模型不适合可靠手写识别；置信度与“不确定行”不能替代人工核对。

可选服务端 AI 适配器读取 OPENAI_API_KEY、OCR_ACCESS_TOKEN，可选 OPENAI_OCR_MODEL。名称示例见 [packages/web/.env.example](../../packages/web/.env.example)；使用运行环境支持的服务端秘密配置方式，不把真实值加入源码或前端变量。GET /api/math/ocr 的 configured 状态是应用是否读到配置的依据，不会返回密钥。未配置时本机识别和手动转录仍可用；已配置也需要真实服务验收，不能由状态推断效果。

AI 模式点击上传后，图片经本站转发给 OpenAI；访问码在面板内存中使用。识别文本必须编辑校正并人工确认，批改只发送核对后的文本到本站数学服务。

## CLI 交付

```powershell
node packages/cli/src/code-counter/cli.mjs . --details
node packages/cli/src/arithmetic/cli.mjs --count 300 --seed course-weekly --answers
npm run cli:bundle
node packages/cli/dist/se-count.mjs . --json
node packages/cli/dist/se-math.mjs --count 20 --answers
```

ESM 打包用于减少分发文件；无需 Node 的原生程序用 Node 24 运行 npm run cli:native，走独立 Node SEA 构建流程，见[原生 CLI 交付](../native-cli.md)。Windows x64 已在空 PATH、独立目录验证帮助页与实际 JSON 输出；产物未做发行者签名。macOS 仅提供同机 arm64 构建路径，尚未实测，不承诺 Intel Mac。平台、签名与完整证据以该文档和对应 manifest 为准，不把一种平台成功推广到其他平台。

代码统计 --output 覆盖指定报告；数学 --output 只新建 .txt/.json，存在则失败。生成报告与 dist 都不提交。

## 容器与 CI

```powershell
docker compose up --build
docker compose ps
docker compose logs web
```

Compose 将 127.0.0.1:8080 映射到容器 8080，Dockerfile 采用多阶段构建、非 root 用户与 /api/health 健康检查。停止使用 docker compose down。本轮机器未提供 Docker 命令，尚未实跑；配置文件不是目标机器实跑证据，需单独检查镜像构建、容器启动、健康状态和实际页面请求。可选 AI 秘密未写进镜像或 Compose 示例，需要维护者单独安排。

CI 入口见[工作流](../../.github/workflows/ci.yml)：根 npm ci、verify、覆盖率、提交信息检查、基准、构建、CLI 打包、浏览器流程及产物留存。工作流不部署现有站点。记录时区分工作流定义、当前提交实际运行结果和人工验收；基准、覆盖率、浏览器报告/截图位于被忽略的 reports/、playwright-report/ 等目录，不加入源代码提交。

当前工作区实际结果与待验收范围见[本轮优化状态](../upgrade-status.md)。最终完整检查、其他浏览器、真实打印、真实手写/AI 与目标环境 Docker 需有各自证据；历史记录不能替代本次验收。
