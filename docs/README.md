# Alchemion 文档

Alchemion 提供浏览器 TypeScript SDK 和独立中英工作台。当前公开入口为 `alchemion/core`、`alchemion/formats`、`alchemion/viewer`，正式渲染后端为 Three.js。

## 使用与接口

| 文档                           | 内容                                                |
| ------------------------------ | --------------------------------------------------- |
| [集成说明](integration.md)     | 交付包安装、浏览器集成、独立 demo 部署与许可        |
| [快速开始](getting-started.md) | 构建、使用真实 tarball、最小导入/显示/编辑/导出示例 |
| [工作台指南](demo.md)          | 导入、三维交互、批量编辑、超胞、配位、视图与导出    |
| [core API](api/core.md)        | 结构模型、超胞、配位分析与同步编辑事务              |
| [formats API](api/formats.md)  | CIF/MOL/POSCAR 读写、文档语法、诊断与损失           |
| [viewer API](api/viewer.md)    | 选择、三维显示、PNG 与视图、事件和独立异步控制器    |

## 规范与维护

| 文档                         | 内容                                   |
| ---------------------------- | -------------------------------------- |
| [产品](product.md)           | 已交付能力、稳定需求编号、格式边界     |
| [科学领域](domain.md)        | 单位、坐标、身份、数学、编辑与诊断语义 |
| [架构](architecture.md)      | 模块、单一科学实现、Worker 与资源归属  |
| [开发指南](development.md)   | 工具链、真实命令、测试工具与 CI        |
| [质量与独立参考](quality.md) | 验收场景、参考方法、性能口径与验证限制 |
| [数据来源](data-sources.md)  | 当前数据、样例、转换与许可             |
| [未完成需求](plan/README.md) | 下一项任务及尚未实施的维护与验证工作   |

运行目标是现代桌面 WebGL2；Node.js 只用于开发。Playwright WebKit 验证不能替代真实 Safari，软件驱动结果不能作为硬件性能结果。当前验证边界和后续任务分别见质量文档与计划索引。可打包产物不等于已经发布到 npm 或线上站点。
