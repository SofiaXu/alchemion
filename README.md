# Alchemion

Alchemion 面向晶体和分子结构的浏览器解析、科学计算、三维显示与基础编辑。目标交付是可嵌入 SDK 和独立演示应用。

## 当前状态

2026-10-29 已完成 M0 重构文档与接管阶段。历史代码基准为 `06784cf0a61d09c76906086bebac773459f5b33d`；M0 只添加文档，没有重写业务代码或安装依赖。代码重构从尚未开始的 M1 进入，当前实际进度见 [交接记录](docs/handoff.md)。

现有代码包含 Babylon.js 编辑器、CIF/MOL 解析、CIF/POSCAR 导出和调试页。部分功能仅有类型声明或实验代码，不能据此视为已完成。详见 [现状审计](docs/baseline.md)。本轮未运行历史构建、lint 或测试。

## 新版方向

- TypeScript、纯浏览器运行、现代桌面 WebGL2；渲染层在 Three.js 与 Babylon.js 的对照验证后定案。
- 以扩胞后 10,000 个原子显示实例为主要性能场景。
- 空间填充和球棍显示，晶格、对称与邻胞、倒易晶格、第一布里渊区，选择、坐标拾取和距离/角度/二面角测量。
- 原子增删、元素和坐标修改、晶胞编辑，以及撤销重做。
- CIF1/CIF2 晶体读写、MOL V2000/V3000 读写、周期结构 POSCAR 导出。
- 重新设计 API 和工程结构，不提供旧版兼容层。

这些是目标能力，具体支持字段、诊断和完成条件以 [产品规范](docs/product.md) 为准。

## 现有工程入口

当前 `package.json` 固定包管理器为 pnpm 9.7.0。仓库目前没有 Node `engines` 声明。安装前先按 [M1 执行计划](docs/plans/m1-foundation.md) 核对 manifest 与 lockfile 的依赖归类差异。

以下是历史工程已经定义的命令；定义存在不代表本轮已经运行通过。

| 命令 | 当前作用 |
|---|---|
| `pnpm dev` | 启动现有 Vite 调试页，页面入口为 `src/test.ts`。 |
| `pnpm build` | 执行 `tsc && vite build`，历史配置输出 ES/CJS。 |
| `pnpm preview` | 预览现有构建产物。 |
| `pnpm lint` | ESLint 检查 JS/TS。 |
| `pnpm exec vitest run` | 单次执行已有 CIF 测试；`pnpm test` 默认进入 Vitest 开发模式。 |
| `pnpm format` | 重写 JS/TS/HTML/JSON 格式；不是只读检查，也不覆盖 Markdown。 |

新版 workspace、子路径导出和 CI 命令尚未建立，见 [架构](docs/architecture.md) 与 [质量规范](docs/quality.md)。

## 文档导航

| 入口 | 用途 |
|---|---|
| [AGENTS.md](AGENTS.md) | Codex 项目指令和必读顺序。 |
| [PLANS.md](PLANS.md) | 执行计划规则及模板。 |
| [现状审计](docs/baseline.md) | 基准代码、已知风险与待验证项目。 |
| [产品规范](docs/product.md) | 功能编号、范围、格式和验收。 |
| [领域规范](docs/domain.md) | 坐标、身份、科学规则和编辑语义。 |
| [架构规范](docs/architecture.md) | 模块、公开接口、异步和生命周期。 |
| [质量规范](docs/quality.md) | 测试编号、目标命令与性能口径。 |
| [数据来源](docs/data-sources.md) | 数据来源、许可与参考规范台账。 |
| [路线图](docs/roadmap.md) | M0–M6 的依赖与交付物。 |
| [当前交接](docs/handoff.md) | 已完成证据、未解决事项及下一步。 |
| [初始架构决策](docs/decisions/0001-project-foundation.md) | 已确认的重构方向。 |
| [渲染选型记录](docs/decisions/0002-renderer-selection.md) | 尚待实测定案的选型。 |

## 继续开发

新 Codex 会话从 `AGENTS.md` 和 `docs/handoff.md` 开始，核对 Git 工作区后执行对应计划。不要根据 README 的目标描述跳过工程基线、科学正确性或渲染选型验收。

仓库代码使用 [MIT License](LICENSE)。样例和科学数据的归属分别见 [数据来源台账](docs/data-sources.md)，不能仅凭根许可证推断全部数据来源。
