# CLI 单文件交付

`se-count`（代码量统计）和 `se-math`（四则运算出题）支持两种交付：

| 产物                                                              | 构建命令             | 使用者环境                              |
| ----------------------------------------------------------------- | -------------------- | --------------------------------------- |
| `packages/cli/dist/se-count.mjs`、`se-math.mjs`                   | `npm run cli:bundle` | 已安装项目要求版本的 Node.js            |
| `packages/cli/dist/<系统>-<架构>/se-count[.exe]`、`se-math[.exe]` | `npm run cli:native` | 对应系统和架构；无需安装 Node.js 或 npm |

每个原生工具各自是一个文件，包含 Node.js 运行时和所需算法、解析器。不需要相邻的源码、`node_modules` 或 `.mjs` 文件。终端参数、输出报告、数学题目输出仍沿用 CLI 规则。原生构建不会包含网站、OCR 模型或课程资料。

## 构建

构建者安装 Node.js **24 LTS**，在仓库根目录执行 `npm ci`。精确依赖版本由根目录锁文件管理，其中打包器为 `esbuild@0.28.2`，资源注入工具为 `postject@1.0.0-alpha.6`。

```sh
npm run cli:native
```

脚本只构建当前机器的系统和 CPU 架构，不下载其他平台的 Node.js，也不接受跨平台参数。Windows x64 在 Windows x64 构建，Windows arm64 在 Windows arm64 构建；macOS 使用 Apple Silicon 的 arm64 Node.js，并预先安装包含 `codesign` 的 Apple 命令行开发工具。构建支持与实际验证状态见下表。

| 目标               | 产物目录                          | 当前验证状态                                                    |
| ------------------ | --------------------------------- | --------------------------------------------------------------- |
| Windows x64        | `packages/cli/dist/win32-x64/`    | 本机实际验证记录见下文                                          |
| Windows arm64      | `packages/cli/dist/win32-arm64/`  | 提供同机构建路径，尚未实测                                      |
| macOS arm64        | `packages/cli/dist/darwin-arm64/` | 提供同机构建路径，尚未实测                                      |
| macOS x64（Intel） | 无                                | 此构建脚本明确拒绝；Node 24 官方 SEA 文档说明其 CI 未支持此目标 |

构建采用 Node 24 的官方 SEA 流程：将 canonical CLI 打包成 CommonJS，使用运行脚本的同一个 Node 二进制生成 SEA blob，将 Node **复制到仓库内的临时构建目录**，然后由 `postject` 注入 blob。`import.meta.url` 在 CommonJS bundle 中转换为当前文件 URL，以保留数学 CLI 入口判断。所有非内置模块都必须已合并进 bundle；若仍存在外部 npm 依赖，构建会失败。生成 blob 不启用 V8 快照或代码缓存，并禁止通过 `NODE_OPTIONS` 扩展发行程序的 Node 参数。

脚本不会修改已安装的 `node.exe`，并在成功构建后比较其 SHA-256。输出目录拒绝符号链接，临时文件会在构建结束时清理。重复构建会替换对应目标目录中的生成文件，不改源码。

每个原生程序都必须通过帮助页及实际 JSON 输出检查，检查时从不含依赖的临时目录启动，并清空 `PATH`。出题工具生成 3 道题并核对答案字段；统计工具统计 JavaScript 和 Python 样例，核对文件数与代码、注释、空白行计数。通过后写入目标目录，`manifest.json` 保存运行时版本、文件大小、SHA-256 和签名状态。构建失败返回非零退出码。

## 使用

Windows PowerShell：

```powershell
.\packages\cli\dist\win32-x64\se-count.exe . --json
.\packages\cli\dist\win32-x64\se-math.exe --count 20 --answers
```

macOS arm64：

```sh
./packages/cli/dist/darwin-arm64/se-count . --json
./packages/cli/dist/darwin-arm64/se-math --count 20 --answers
```

可以把所需的单个程序复制到其他目录使用。不要把 Windows 文件当作 macOS 程序，也不要将 x64 与 arm64 产物混用。

## 签名与分发边界

Windows 产物未进行发行者 Authenticode 签名。本机运行不依赖证书；下载分发时的系统提示及组织策略需要单独验证。原始 Node 的签名不能作为修改后程序的发行者签名。构建遵循官方说明，省略可选的 Windows SDK `signtool remove` 步骤；出现原始签名相关提示不代表获得有效发行签名。

macOS 构建会先去除复制文件上的原签名，注入后执行 `codesign --sign -` 本地 ad-hoc 签名及签名结构检查。此步骤不等同于 Developer ID 签名或 Apple 公证，也不能证明从互联网下载后的 Gatekeeper 验收已通过。若要公开分发，应由持有证书的发行者完成 Developer ID、适当的 Hardened Runtime 配置、公证及下载验收。此仓库脚本不读取开发者账号、证书私钥，不上传公证、不发布制品。

## 实际验证记录

2026-11-01，在 Windows x64、Node.js v24.22.1 上实际执行 `node scripts/build-native-cli.mjs`，退出码 0。两个程序均通过空 `PATH`、独立工作目录下的帮助和功能检查；`se-count.exe` 样例统计为 2 文件、6 总行、2 代码行、2 注释行、2 空白行，`se-math.exe` 返回含标准答案的 3 道题。

| 文件           | 大小（字节） | Windows 签名检查                         |
| -------------- | -----------: | ---------------------------------------- |
| `se-count.exe` |   94,462,464 | `Get-AuthenticodeSignature`：`NotSigned` |
| `se-math.exe`  |   93,871,104 | `Get-AuthenticodeSignature`：`NotSigned` |

构建工具对复制文件报告了原签名相关警告；最终两个文件均可直接执行，且确认无有效发行者签名。原安装 Node 文件 SHA-256 在构建前后相同。每次产物的完整 SHA-256 见同目录的 `manifest.json`。本次未在另一台无 Node 的物理机器验收，也未执行签名、公证或分发；macOS 和 Windows arm64 不记作已实测。

## 官方依据

- [Node.js v24.22.1 SEA 官方文档](https://github.com/nodejs/node/blob/v24.22.1/doc/api/single-executable-applications.md)：CommonJS、同版本 Node、postject 注入、平台支持和签名步骤。
- [nodejs/postject](https://github.com/nodejs/postject)：官方文档使用的资源注入工具。
- [Apple：分发前公证 macOS 软件](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)：Developer ID、公证和分发要求。
