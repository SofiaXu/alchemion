# Alchemion

Alchemion 是面向晶体与分子结构的浏览器 TypeScript SDK，提供独立的中英双语 demo。运行目标是现代桌面 WebGL2；Node.js 用于开发和验证。

SDK 提供 `alchemion/core`、`alchemion/formats`、`alchemion/viewer` 三个公开入口，支持 CIF1/2、MOL V2000/V3000 读写及 POSCAR VASP5 导入与导出。结构工具包括对称与邻胞、倒易晶格与第一布里渊区、测量、多选与批量编辑、整数超胞与空位/替位、配位分析和多面体；viewer 提供 PNG 导出、视图保存恢复及撤销重做。格式边界见[产品规范](docs/product.md)。

## 开始使用

使用 [.node-version](.node-version) 固定的 Node **26.13.0** 和 [package.json](package.json) 固定的 pnpm **12.16.1**：

```sh
npm install --global pnpm@12.16.1
pnpm install --frozen-lockfile
pnpm dev
```

Windows 本机已有 `.tools/pnpm.cmd` 时可用它调用固定工具。SDK 与 demo 可通过 `pnpm build` 构建；仓库外使用方式和完整示例见[快速开始](docs/getting-started.md)。当前仓库提供可打包产物，不表示已经发布到 npm 或线上站点。

## 文档

- [文档导航](docs/README.md)与[工作台指南](docs/demo.md)
- API：[core](docs/api/core.md)、[formats](docs/api/formats.md)、[viewer](docs/api/viewer.md)
- 规范：[产品](docs/product.md)、[科学领域](docs/domain.md)、[架构](docs/architecture.md)
- 维护：[开发指南](docs/development.md)、[质量与独立参考](docs/quality.md)、[数据来源与许可](docs/data-sources.md)
- [未完成需求](docs/plan/README.md)、[项目指令](AGENTS.md)、[计划规则](PLANS.md)

项目代码和自产样例使用 [MIT 许可](LICENSE)。随 SDK 分发的科学数据 manifest 和第三方声明、demo 的离线来源页面记录各项数据与依赖的来源和许可。
