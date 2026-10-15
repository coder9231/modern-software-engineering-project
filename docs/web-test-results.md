# 网站代码统计验证记录

日期：2026-10-15；环境：Windows、Node.js 24.19.0、Vinext 本地 Cloudflare Worker。

## 自动化验证

| 检查 | 结果 |
| --- | --- |
| CLI 与共享分析器测试 | 45 通过、5 环境跳过、0 失败 |
| API 服务测试 | 31 通过、0 失败 |
| 真实 HTTP 联调 | 6 通过、0 失败 |
| TypeScript | `tsc --noEmit` 通过 |
| 应用静态检查 | `eslint app` 及服务文件通过 |
| 生产构建 | `build-site.mjs` 通过，生成 Worker 与客户端资源 |

5 项跳过源于当前环境无法创建硬链接/符号链接，或 Windows 缺少 POSIX 权限夹具。真实 HTTP 联调覆盖健康与配置、服务端示例、UTF-8/UTF-16LE/UTF-16BE/GB18030、路径与来源校验、100 文件批量上限、恰好 4 MiB、二进制伪装及 JSON/CSV 附件响应。

复现命令见 [运行说明](web-code-counter.md)。GitHub 工作流 `.github/workflows/ci.yml` 在推送和 Pull Request 时执行共享核心、API 服务、类型、应用静态检查和构建；远程执行结果见 [GitHub Actions](https://github.com/coder9231/modern-software-engineering-project/actions)。首次 Linux 执行启用了本机 Windows 跳过的权限案例，并发现 JSON 模式的测试应从 `report.errors` 检查文件详情、从 stderr 检查摘要；已按 CLI 的实际契约修正测试，未更改 CLI 行为或添加跳过。

## 网页操作验收

- 上传项目内 `sample.java` 和 `sample.py`：2 文件、14 总行、8 代码、4 注释、2 空白；表格语言与逐文件分类符合 CLI 样例。
- 点击内置示例：后端真实分析两份专用示例，结果同为 2/14/8/4/2，界面明确标注示例数据。
- 下载 CSV：实际浏览器下载成功，包含两份文件与正确计数；文件搜索可筛到单个文件。
- 选择真实 `testcase2` 文件夹：150 文件、约 9.8 MiB，自动跨批处理；统计为 0 文件、0 行，150 条跳过记录为二进制文件。CLI 对同一数据也全部拒绝，但其先解码，因此跳过原因标为 `invalid_encoding`。
- 390 像素宽度检查移动导航和布局，无页面横向溢出；表格通过自身横向滚动容器展示。桌面宽度显示导入、选项、指标与图表布局。
- 独立复核前端实际批次函数，验证 4 MiB/100 文件、取消、批次失败不产生部分报告、读取失败提示结果不完整；验证 20,001 文件 CSV 与约 7.3 MB JSON 使用浏览器完整导出，普通报告调用后端。

## 部署与验证边界

- 线上地址：https://se-practice-coder9231.a0910663736.chatgpt.site
- Site：`appgprj_6ad06aab5bbc8191b779b7a7acd1aaac`
- 源码提交：`cc97282a07eb8b5473397c7123c763b72643bf28`
- 版本：`appgprj_6ad06aab5bbc8191b779b7a7acd1aaac~appgver_2d34f7277150819199beb4ae7ca85b6e`
- 部署：`appgdep_6ad06f8ae7008191839a74c5d7f2ac7d`，服务返回 `succeeded`。

首次部署采用私有访问，上述功能验收在真实本地 Worker 完成。2026-10-15 根据用户要求将站点访问策略更新为 `public`，平台返回修订号 `2`，已取消 ChatGPT 账号登录限制。浏览器在未登录 ChatGPT 的会话中已直接打开统计页面；对公开线上地址运行 6 项真实 HTTP 联调，全部通过，包括配置、示例、四种编码、非法请求、4 MiB 文件、二进制文件和 JSON/CSV 导出。

线上复现：

```powershell
$env:CODE_COUNTER_URL = 'https://se-practice-coder9231.a0910663736.chatgpt.site'
node --test tools/code-counter/web-api.test.mjs
```

本轮没有进行一万用户并发压测，没有重复宣称对 testcase1/testcase3 的完整网页验收；这两组此前 CLI 验证记录见 `testcase-results.md`。
