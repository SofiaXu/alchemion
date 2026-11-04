# Alchemion

Alchemion 是面向晶体与分子结构的浏览器 TypeScript SDK，提供独立的中英双语科研工作台、离线示例库和跟做教程。运行目标是现代桌面 WebGL2；Node.js 用于开发和验证。

SDK 提供 `alchemion/core`、`alchemion/formats`、`alchemion/viewer` 三个公开入口，支持 CIF1/2、MOL V2000/V3000 和含 Selective Dynamics 的 VASP5 POSCAR 读写。结构工具覆盖晶体创建与对称、倒易晶格与第一布里渊区、测量与配位，以及[周期、分子和纳米建模](docs/api/modeling.md)。viewer 提供可取消的建模预览、撤销重做、PNG 导出和视图保存恢复。格式边界见[产品规范](docs/product.md)。

[计算结果工作台](docs/demo.md#计算结果)可配准本地 VASP 和版本化结果，叠加等值面、切片、结构差异、原子属性、振动和费米面，并联动轨迹、频谱、能带及 DOS。

[项目主页](https://sofiaxu.github.io/alchemion/) · [在线工作台](https://sofiaxu.github.io/alchemion/demo/)

## 开始使用

使用 [.node-version](.node-version) 固定的 Node **26.13.0** 和 [package.json](package.json) 固定的 pnpm **12.16.1**：

```sh
npm install --global pnpm@12.16.1
pnpm install --frozen-lockfile
pnpm dev
```

Windows 本机已有 `.tools/pnpm.cmd` 时可用它调用固定工具。SDK 与 demo 可通过 `pnpm build` 构建；仓库外使用方式和完整示例见[快速开始](docs/getting-started.md)。

## 文档

- [文档导航](docs/README.md)、[集成说明](docs/integration.md)与[工作台指南](docs/demo.md)
- API：[core](docs/api/core.md)、[formats](docs/api/formats.md)、[viewer](docs/api/viewer.md)
- 规范：[产品](docs/product.md)、[科学领域](docs/domain.md)、[架构](docs/architecture.md)
- 维护：[开发指南](docs/development.md)、[质量与独立参考](docs/quality.md)、[数据来源与许可](docs/data-sources.md)
- [未完成需求](docs/plan/README.md)、[项目指令](AGENTS.md)、[计划规则](PLANS.md)

项目代码和自产样例使用 [MIT 许可](LICENSE)。随 SDK 分发的科学数据 manifest 和第三方声明、demo 的离线来源页面记录各项数据与依赖的来源和许可。
