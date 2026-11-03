# 旧网站目录兼容入口

网站实现已迁移至 [`packages/web`](../packages/web/)，共享算法位于 [`packages/core`](../packages/core/)，OCR 位于 [`packages/ocr`](../packages/ocr/)。请从仓库根目录运行 `npm ci`、`npm run dev`、`npm run build`；项目只维护根目录的一份依赖锁文件。

为兼容旧操作方式，本目录的 `npm run dev`、`npm run build`、`npm start` 会转到新工作区。不要在本目录单独安装依赖或修改旧构建产物。保留的 `.env*`、`.openai/`、Git 元数据及本机运行缓存没有迁移或删除；如需现有本机配置生效，请自行核对并在 `packages/web` 配置环境变量。

功能、验证状态和协作约定见[根目录说明](../README.md)与[开发者指南](../docs/guides/developer.md)。
