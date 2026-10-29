# M1：可重复的工程基线与 SDK / demo 边界

状态：进行中，等待最终干净 checkout 验收。
需求：R-001、R-023、R-024。
测试：T-PKG-01、T-DOC-01；仅建立后续业务测试的工程入口。

## 目的与可见结果

从干净 checkout 冻结安装、启动独立 demo、检查类型、构建唯一 ESM SDK，并在仓库外安装真实 tarball，验证三个子路径和两层模块 Worker。此阶段只证明工程迁移，不宣称科学核心、完整格式或最终渲染后端已经完成。

## 上下文与入口条件

- 遵循根 [AGENTS](../../AGENTS.md)、[PLANS](../../PLANS.md)、[架构](../architecture.md) 和 [质量规范](../quality.md)。原始代码基准 06784cf，M0 文档前置提交 9742727。
- 开始时系统 Node 24.14.0、pnpm 9.7.0，无 node_modules，22 份 M0 文档未跟踪。文档已按授权提交；未覆盖其他会话改动。
- 本地任务与 CI 固定 Node 24.22.1、pnpm 9.7.0；具体工具版本和原始安装事实见 [证据](../evidence/m1-foundation.md)。原始冻结安装实际通过，未复现锁冲突。
- Babylon 7.23.0 仅作为历史搬迁实现；M2 仍负责 Three.js/Babylon.js 同条件对照并决定唯一正式引擎。

## 实施步骤

1. 在 codex/m1-foundation 中保留并提交 M0 文档；对原始 manifest/lockfile 冻结安装，分别取证原始 lint/build 和两个 CIF 文件。
2. 建立 packages/alchemion、apps/demo 和根私有 orchestrator。搬迁唯一实现与 fixtures，保留署名，更新源码链接，不留下旧根入口或跨目录源 alias。
3. 建立 alchemion/core、alchemion/formats、alchemion/viewer 的显式 ESM 和声明导出；纯入口无 DOM/Worker/引擎依赖。旧计算器归入 viewer 私有模块，隐藏 camera 等引擎访问。
4. 两层 Worker 使用原生模块 URL，Worker 内部依赖闭合。Vite 库模式的生成包装需正规化为静态 URL，确保第二次消费者构建能遍历嵌套 Worker 图；build/watch 都执行，不由宿主复制资源兜底。
5. 只修复已阻塞迁移的缺失 CIF 可选列、错误源原子断言、字符串 matcher 类型、等价 lint 词法问题，以及创建/销毁/resize 的基本资源问题。完整科学和异步语义留给后续阶段。
6. 建立 README 中的真实命令。SDK 构建先于 demo/宿主类型检查；独立命令准备产物，check:m1 内部只构建一次。test 单次退出，test:watch 才监听；浏览器和单元默认最多 4 进程，无自动重试。
7. test:package 在 OS 临时目录新建消费者，仅依赖 tarball 和开发工具。检查全部公开声明（不跳过声明内部检查）、生产构建及三浏览器嵌套 Worker。与工作区测试共用断言，但资产和依赖来自真正的包。
8. 提交候选后，在独立干净 clone 冻结安装，先验证无 dist 的 dev，再运行一次 check:m1。bench 仅做一次 128 原子/120 帧采集冒烟。更新文档后提交结果，合并 master，普通推送 origin/master 并核对提交。

## 验证与完成条件

本次用户明确要求最小充分验证：不默认执行无过滤的完整套件，不再二次拆分工作包。子代理仅只读审查，主会话负责全部实现和验证。

- check:m1 只选两个迁移 CIF 文件；工程格式/lint/类型/链接；三个浏览器的创建、真实 Worker、可见渲染、输入隔离、销毁；真实 tarball 的声明与两层 Worker。
- 嵌套 Worker 使用一个碳原子、单位正交晶胞、2000 个候选邻胞和零 cutoff，触发并行分支而只保留一个显示原子；内部池最多 4 个。
- 测试默认 4 进程；任务不足时按实际任务数运行，不为凑进程数拆测试。资源不足时记录后降低；不自动重试。每次扩展或复测都有明确原因并写入证据。
- Linux CI 固定 Ubuntu 24.04、工具与浏览器版本，冻结安装并执行相同 check:m1；本地 Windows 与 CI 结果分开，不声称真实 Safari 通过。
- bench 的真实时间和环境采集不是 T-PERF-01 达标结论；正式一万实例/两模式/全指标由 M2 补齐。
- 所有必要工程关卡通过后才标记完成；失败、未运行与通过分别记录。

## 中断与恢复

先查 Git 状态和本计划，不覆盖已移动文件。冻结安装失败先区分网络与锁文件，不删除锁文件碰运气。浏览器缺失或无 WebGL2 必须明确失败，不能跳过后算通过。临时消费者和干净 clone 保留为可复核产物，删除前核对绝对路径。

## 进展（Progress）

- [x] 提交 M0 前置文档，记录原始冻结安装、lint、build 和 CIF 失败。
- [x] 固定工具与依赖归属，建立 workspace、公开子路径、声明和模块边界。
- [x] 建立两层模块 Worker，发现并修复二次构建资源遗漏。
- [x] 建立目标脚本、定向浏览器/消费者/bench harness 和 CI 配置。
- [ ] 最终三浏览器和真实消费者通过。
- [ ] 干净 checkout 冻结安装、无 dist 的 dev、check:m1 和 bench 冒烟。
- [ ] 完成证据/交接、合并并推送 origin/master。

## 发现（Surprises & Discoveries）

原始冻结安装成功；旧 CIF 可选列缺失和 29 原子断言失败已实录。Vite 库产物需要正规化静态 Worker URL，才能让隔离消费者收集内层 Worker。具体诊断、修复与复测理由集中在 [证据](../evidence/m1-foundation.md)。

## 决策（Decision Log）

- 2026-10-29：按用户确认的一个集成工作包实施；子代理只做边界审查。
- 2026-10-29：采用受支持的 Vite 7.3.5 与精确工具版本；声明交给 TypeScript，不使用旧 dts 插件。
- 2026-10-29：check:m1 是当前 CI/会话入口；保留显式 check 全量入口，但本轮不默认运行它。
- 2026-10-29：完整模型/科学/格式/异步/历史与引擎选择仍遵循既定阶段，不因迁移而提前完成。

## 结果与回顾（Outcomes & Retrospective）

工程实现已建立，最终验收进行中。全部通过后更新本段与 [handoff](../handoff.md)，下一关卡为 [M2](m2-renderer-selection.md)。
