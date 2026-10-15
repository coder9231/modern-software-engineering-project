# 许可与第三方材料说明

本项目自行编写的源码和文档采用根目录的 [MIT 许可证](LICENSE)，版权所有者为 `2026 coder9231 and contributors`。明确标注第三方来源的文件遵循其原有许可证。

## 随源码保留的第三方许可

| 材料 | 原版权所有者 | 许可证与保留位置 |
| --- | --- | --- |
| Sites Vite 集成插件 | OpenAI，2026 | MIT；[website/build/sites-vite-plugin.LICENSE](website/build/sites-vite-plugin.LICENSE) |
| shadcn Tailwind 样式 | shadcn，2023 | MIT；[website/vendor/shadcn-tailwind-4.13.0.LICENSE.md](website/vendor/shadcn-tailwind-4.13.0.LICENSE.md) |

通过 npm 安装的依赖遵循各自软件包的许可证。依赖声明与锁定版本见 `website/package.json` 和 `website/package-lock.json`；依赖目录不提交到本仓库。

## 本地课程与测试材料

`testcase1/`、`testcase2/`、`testcase3/`、生成的 `reports/`、原始课堂照片和课件转录文档仅用于本地课程学习与验证，不随本仓库公开分发，也不包含在项目 MIT 授权范围中。其内容可能包含第三方代码或课程材料，不能因本项目开源而推定可以重新授权或分发。

公开测试记录仅汇总实际观察到的结果。仓库中的 `tools/code-counter/examples/` 及自行编写的测试夹具用于复现工具行为，不需要上述本地数据集。
