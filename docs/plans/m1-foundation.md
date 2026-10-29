# M1：可重复的工程基线与 SDK / demo 边界

状态：未开始。
需求：R-001、R-023、R-024；支持全部后续需求的工程基础。
测试：T-PKG-01、T-DOC-01；建立后续 T-DOM、T-FMT、T-RUN、T-EDIT、T-VIEW、T-PERF 的运行入口。

## 目的与可见结果

开发者可以从干净 checkout 安装依赖、运行单次检查、启动独立 demo，并从 SDK 打包产物在隔离浏览器消费者中加载历史最小场景。形成 `packages/alchemion` 与 `apps/demo` 的工程边界；ESM SDK 明确导出 `alchemion/core`、`alchemion/formats`、`alchemion/viewer` 及其声明。此阶段验证搬迁和工程，不宣称新版科学核心、完整功能或渲染引擎已经定案。

## 上下文与入口条件

- 先读根 [AGENTS](../../AGENTS.md)、[PLANS](../../PLANS.md)、[交接](../handoff.md)、[现状](../baseline.md)、[架构](../architecture.md) 和 [质量契约](../quality.md)。M0 文档审查通过后开始。
- 基准为 `06784cf0a61d09c76906086bebac773459f5b33d`。历史 [manifest](../../package.json) 固定 pnpm 9.7.0，[lockfile](../../pnpm-lock.yaml) 中部分 dependency/peer 归类不一致。当前没有安装和构建成功证据；本轮起始没有 `node_modules`。
- 当前 [Vite 构建](../../vite.config.ts) 混合库、声明和内联 Worker；[演示页](../../index.html) 使用 `src/test.ts`。目标 workspace 尚未创建。
- 保留 TypeScript；Node 开发基线采用 24 系列，执行时根据官方支持和工具兼容性固定实际 patch。pnpm 先保留 9.7.0。不得用“最新版本”代替明确版本与兼容证据。
- Babylon.js 只是当前历史实现。M2 将比较 Babylon.js 与 Three.js；本阶段不创建永久双引擎架构，不把历史依赖写成已选中的新版引擎。

## 实施步骤

1. **记录原始安装事实。** 先运行 `git status --short`、`git rev-parse HEAD`、`node --version`、`pnpm --version`，保存工作目录与版本。查询 Node、pnpm 及拟保留/升级工具的官方支持记录，固定兼容的 Node 24 patch。对未改动的原始 manifest/lockfile 运行一次 `pnpm install --frozen-lockfile`，记录命令、退出码和诊断；不可先重锁、删除 lockfile、使用 `--no-frozen-lockfile` 或忽略安装错误后声称已验证原始基线。
2. **建立可解释的依赖基线。** 若冻结安装失败，区分锁文件差异、工具兼容、网络或原生依赖原因；网络失败不能当成已复现锁冲突。若可安装，执行历史 `pnpm exec vitest run`、`pnpm lint`、`pnpm build` 并分别记录结果。统一依赖归属、workspace importer 和直接依赖；工具升级先核查官方兼容，再固定 manifest 和 lockfile 的实际版本。修复说明记录在证据中；失败的历史行为不应被伪装为测试通过。
3. **机械迁移工程。** 创建目标 `pnpm-workspace.yaml`、私有根 orchestrator、`packages/alchemion` SDK 与 `apps/demo`。迁移当前源码、CIF fixtures 和演示资源，更新相对导入/配置，保留一个正式代码位置。demo 通过 workspace 包的公开子路径导入，不跨目录引用 SDK 内部源文件。历史 Worker 耦合和模型问题列为 M3/M4 待替换债务；不在本阶段顺带重写科学算法，也不宣称已经达到最终纯核心边界。
4. **明确库分发契约。** SDK 使用 `type: module` 和 ESM-only 输出；为 `./core`、`./formats`、`./viewer` 配置 exports 的类型/浏览器 import 目标，声明不泄漏 demo、测试或绝对路径。不提供 CJS、旧入口别名或兼容包。核心/格式入口不得因为 barrel 引用而初始化 viewer、DOM 或 Worker；现有浏览器专用计算保持私有，后续按新架构拆分。引擎对象不成为新的正式 API。
5. **使 Worker 可消费。** 在构建配置中明确 Worker 入口、所有权与产物引用，目标采用可随 SDK 分发的模块 Worker 文件，基于模块 URL 定位。消除 demo 服务器对源码路径的偶然兜底；检查 tarball 中 Worker 与其依赖闭合。若迁移中需暂保历史内联 Worker，必须明确列为本阶段未完成项，直到真实消费者证明目标产物可加载。SDK 自身内部依赖归属须显式配置；临时 Babylon 构建只证明机械迁移，M2 决策后再清除落选依赖。
6. **建立命令与测试 harness。** 按 [quality.md](../quality.md) 建立 `dev`/`demo`、`typecheck`、`lint`、`format:check`、`test`、`test:watch`、`test:browser`、`build`、`test:package`、`check`、`bench`。`test` 单次退出；format 检查包含 Markdown。单元测试、浏览器测试和 demo 分开配置，旧 CIF 用例迁移后保持覆盖意图；错误断言经独立证据说明后修正，不能为变绿随意删除。浏览器 harness 至少有 SDK 创建/销毁和 Worker 实际响应的冒烟场景。

   工程依赖顺序固定为 SDK 源检查/构建（声明与 Worker）→demo/测试宿主→消费者类型与浏览器验证。`check` 先构建再检查消费者；`dev`、`typecheck`、`test:browser` 独立运行时也须准备所需 SDK 产物，不能依赖旧 dist。聚合检查可复用一次准备，SDK 构建不能反向依赖 demo。将“无 dist 的干净 checkout 运行 check/dev”加入工程验收。
7. **建立隔离消费者与 CI。** `test:package` 将 SDK pack 到测试临时目录，新建只依赖 tarball 的浏览器消费者，验证三个子路径声明和实际运行；禁止仓库源码 alias。建立 CI：固定 Node/pnpm，冻结安装，安装明确版本的 Playwright 浏览器及系统依赖，运行 `pnpm check`；覆盖 Chromium/Firefox/WebKit，并保留失败日志与截图。Linux CI 与 Windows 本地记录分开，不据其声称所有 OS/真实 Safari 已验证。
8. **重新冻结并更新入口。** 完成依赖和 importer 变更后重新生成 lockfile；在可丢弃的独立 checkout 或 CI 中执行 `pnpm install --frozen-lockfile` 和完整检查，避免依赖既有 `node_modules` 掩盖问题。更新 README 的真实可用命令、路径证据、当前计划与 handoff，明确 M2 是下一关卡。

## 验证与完成条件

命令从仓库根运行。上述目标脚本在建立前为未来命令，不能在证据中写成 M0 已运行。

| 检查 | 观察结果 |
|---|---|
| 原始与修复后冻结安装记录 | 原始失败或成功有实录；修复后在干净环境可冻结安装，manifest/lockfile 一致；未使用忽略脚本/跳过检查掩盖失败。 |
| `pnpm check` | 格式、lint、类型、单次测试、三个浏览器、构建和消费者检查均完成并返回成功；历史限制与待实现业务能力另有记录。 |
| `pnpm dev`、`pnpm demo` | 等价启动独立 demo，历史最小结构从公开 SDK 导入后显示；只验证迁移，不当作完整产品验收。 |
| T-PKG-01 | 真 tarball 包含三个 ESM 入口、声明和 Worker 资源；隔离浏览器中加载与 Worker 响应成功，不访问旧 `src` 或 workspace 源码。 |
| `pnpm bench` | harness 可运行并记录测量环境/场景；M1 不要求历史实现达到一万实例性能预算，不可用空成功脚本充数。 |
| T-DOC-01 | 新会话能按更新后的指令找到真实命令、原始基线结果、当前边界和 M2 入口。 |

目标证据文件为 `docs/evidence/m1-foundation.md`，记录工具选择的一手资料、依赖差异、原始/修复后命令结果、浏览器版本、产物清单和限制。尚未创建。只有全部工程关卡有真实证据才完成 M1；M3–M5 的业务待办可以存在，但不能伪装为 M1 已验收能力。

## 中断与恢复

恢复时先检查当前 Git 差异和本计划进展，不重复覆盖已移动文件。安装失败保留原始诊断与 lockfile 差异；先定位原因，再有意重锁，不通过反复删除 lockfile 碰运气。消费者临时目录使用明确的测试工作区路径，不移动或删除用户其他目录。

已有 workspace 部分可保留；逐个核对 package 脚本、exports 目标和文件是否真的存在，再运行对应检查。未通过的命令保留失败状态；网络或浏览器依赖受阻时继续完成不依赖该条件的源码/配置工作，但不把未运行项目勾为完成。

## 进展（Progress）

- [ ] 记录原始环境与未改动锁文件的冻结安装尝试。
- [ ] 核实官方兼容，固定 Node 24 patch 与工具版本，解释依赖和锁文件修复。
- [ ] 迁移 SDK/demo workspace 并建立公开 ESM 子路径与声明。
- [ ] 验证 Worker 产物可在隔离浏览器消费者中加载。
- [ ] 建立全部目标脚本、单元/浏览器/消费者/性能 harness 与 CI。
- [ ] 在干净环境冻结安装并完成 M1 检查，更新文档和交接。

## 发现（Surprises & Discoveries）

尚无 M1 执行发现。静态前置观察：依赖归类差异、未安装依赖、ES/CJS 与内联 Worker 混合，见 [baseline.md](../baseline.md)。这些不是已经运行复现的失败。

## 决策（Decision Log）

- 2026-10-29：采用单 SDK 加独立 demo、ESM-only 子路径分发与 pnpm workspace；见 [基础决策](../decisions/0001-project-foundation.md)。
- 2026-10-29：Node 开发基线保留 24 系列，实际 patch 与依赖兼容在执行时核实；pnpm 初始保留 9.7.0。
- 2026-10-29：历史 Babylon 仅用于搬迁验证；引擎最终决定由 M2 实测 ADR 产生。

## 结果与回顾（Outcomes & Retrospective）

尚未实施。未安装依赖、未创建 workspace、未建立目标脚本，也没有任何运行通过结论。完成后填写实际交付与证据，并将下一步交给 [路线图](../roadmap.md) 中的 M2。
