# 网站代码量统计工具

网站源码位于 `website/`，使用 React/Vinext，前端页面和后端 API 在同一项目运行。首版提供文件或目录选择、分批上传、代码量汇总、语言分布、文件明细、跳过和错误列表、JSON/CSV 报告导出；首页还为课程实践及个人展示预留入口。

## 本地运行

安装 Node.js **22.13.0 或以上**，在课程仓库根目录执行：

```powershell
cd website
npm ci
npm run dev
```

打开 [http://localhost:5173](http://localhost:5173)。若默认端口已占用，可通过 `npm run dev -- --port 5174` 指定其他端口。开发服务默认用于本机预览。

生产构建及本地 Worker 预览：

```powershell
npm run build
npm start
```

`npm start` 使用构建后的 Worker，访问地址以命令输出为准；它不会发布线上站点。网站为独立的 Sites Git 工作区，线上发布遵循 Sites 的构建及发布流程。

线上演示地址：[软件工程实践站](https://se-practice-coder9231.a0910663736.chatgpt.site)。2026-10-15 已完成部署并设为公开访问，无需登录 ChatGPT 账号。站点的公开访问与 [GitHub 源码仓库](https://github.com/coder9231/modern-software-engineering-project)的协作写入权限分别管理。

## 使用方式

1. 先使用内置示例，核对结果：2 个文件、14 行，其中代码 8 行、注释 4 行、空白 2 行。
2. 选择本地源码文件或项目目录。
3. 按需选择编码、扩展名及排除模式。默认排除版本控制、依赖和构建目录。
4. 开始统计，等待各批完成，查看汇总、明细和跳过原因。
5. 导出 JSON 或 CSV。导出只包含报告，不包含源码内容。

浏览器读取本地文件，后端接收内容进行统计；源文件不会被执行，也不由本应用写入数据库、磁盘或对象存储。报告保留在当前页面内存中，刷新后需要重新统计。

## 统计规则与边界

- 支持 C、C++、Java、JavaScript、TypeScript、Python、CSS 和 JSON。扩展名集合以配置接口为准；首版不支持 JSX、TSX、SCSS、`.pyi`。
- 按物理行统计，满足 `total = code + comment + blank`。末尾换行不增加额外一行。
- 一行同时有代码和注释时归为代码行；只有空白字符的行归为空白行；其余只有注释的行归为注释行。
- Python 三引号字符串和文档字符串、Java 文本块归为代码；JSON 非空行归为代码，不验证 JSON 语法。
- 自动编码识别 UTF-8、UTF-16LE/BE 的 BOM；没有 BOM 时严格使用 UTF-8。GB18030 需要手动选择，BOM 优先于手动编码。
- 二进制签名、NUL 字符、无法解码的内容、未支持的扩展名等会记录为跳过，不作为有效源码计数。
- C/C++ 在识别注释前处理反斜杠续行，并保留物理行映射；Python 按 3.12 / PEP 701 区分 f-string 字面量、替换表达式和格式说明；JS/TS 使用 Babel 语法解析器的 token 与注释范围进行分类。JS/TS 每文件超过 64 KiB UTF-8 解析预算、包含未支持语法或发生无法恢复的语法错误时回退到原词法扫描，仍可能有上下文误判，结果为尽力统计。
- 不展开 C/C++ 宏，不进行完整编译或 Python 语法验证；JSX、TSX、SCSS 仍未支持。具体支持边界与回归证据见[语法边界修复记录](code-counter-lexical-fixes.md)。

默认排除目录名：`.git`、`.svn`、`.hg`、`node_modules`、`.venv`、`venv`、`__pycache__`、`dist`、`build`、`target`、`coverage`、`reports`。可关闭默认排除或添加 glob，例如 `**/*.test.js`、`src/generated`、`fixtures/**`。

每批最多 **100 个文件**，解码后的原始内容合计最多 **4 MiB**；单文件最多 **4 MiB**。浏览器依此分批，超限单文件记录为 `too_large`。JSON 请求流上限为 **6 MiB**，包含 Base64 与元数据开销。后端报告导出各条目数组最多 20,000 行，仍受请求流总大小限制；超过后端导出限制时，网页使用共享序列化器在浏览器生成完整报告，不丢弃记录。

## API

所有接口使用同源访问，响应设置 `Cache-Control: no-store`。POST 请求必须是 `Content-Type: application/json`。错误格式为：

```json
{ "error": { "code": "invalid_request", "message": "错误说明" } }
```

无效参数返回 400，跨站提交返回 403，超限返回 413，不支持的媒体类型返回 415。服务端内部异常使用通用 500 响应。

| 方法及路径 | 请求与响应 |
| --- | --- |
| `GET /api/health` | 返回 `{ "status": "ok" }` |
| `GET /api/code-count/config` | 返回 `languages`、`defaultExcludes`、`limits`、`rules` |
| `GET /api/code-count/demo` | 通过实际分析器生成两份固定样例的报告 |
| `POST /api/code-count` | 接收 `files` 和 `options`，返回当前批次的报告 |
| `POST /api/code-count/export` | 接收 `{ format: "json" 或 "csv", report }`，返回附件 |

上传请求示例，`contentBase64` 为 UTF-8 源码 `x = 1` 的规范 Base64：

```json
{
  "files": [{ "path": "src/example.py", "contentBase64": "eCA9IDE=" }],
  "options": {
    "encoding": "auto",
    "exclude": ["**/*.test.js"],
    "useDefaultExcludes": true,
    "extensions": [".py"]
  }
}
```

`encoding` 可为 `auto`、`utf8` 或 `gb18030`；`extensions: []` 表示不过滤支持的扩展名。路径须为不超过 512 字符的项目内相对路径，不允许绝对路径、`.`、`..` 路径段和同批重复路径。接口不接收服务器本地扫描路径。

报告字段为：

```text
version: 1
input: 上传的项目
generatedAt: ISO 时间
totals: { files, total, code, comment, blank }
languages: [{ language, files, total, code, comment, blank }]
files: [{ path, language, total, code, comment, blank }]
skipped: [{ path, reason }]
errors: [{ path, message }]
```

浏览器汇总多批结果并保留跳过及读取失败信息。导出接口重新验证行数非负、分类恒等式、路径唯一性及语言和总计与明细一致；它不接收源文件内容。CSV 以 UTF-8 BOM 输出，并对可能被解释为电子表格公式的文件名作文本处理。

## 复用与验证

唯一的统计和报告核心位于 `website/lib/code-counter/`；`tools/code-counter/analyzer.mjs` 与 `report.mjs` re-export 同一份实现。CLI 扫描磁盘文件，网站统计上传的内存内容，两种入口保持相同的行分类规则。

在课程仓库根目录执行：

```powershell
npm --prefix website ci
node --test tools/code-counter/analyzer.test.mjs tools/code-counter/c-family.test.mjs tools/code-counter/javascript.test.mjs tools/code-counter/python-fstring.test.mjs tools/code-counter/language-integration.test.mjs tools/code-counter/scanner.test.mjs tools/code-counter/cli.test.mjs
node --test website/lib/code-count-service.test.mjs
```

在 `website/` 下执行以下静态检查：

```powershell
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js app lib/code-count-service.mjs lib/code-count-service.test.mjs lib/code-count-service.d.mts
```

本地网站启动后，从课程仓库根目录运行真实 HTTP 联调：

```powershell
node --test tools/code-counter/web-api.test.mjs
```

本轮验证结果见 [网站测试记录](web-test-results.md)。后端测试覆盖与 CLI 的 8 种语言及 glob 一致性、编码、二进制伪装、非法路径及 Base64、严格限额、精确 4 MiB 文件、报告校验与 CSV 公式处理。

尚未开展一万用户同时访问的压测，也没有以功能测试证明相应服务容量。自主功能、真实个人介绍、团队成员和成果材料待补充，后续按课程需求继续迭代。
