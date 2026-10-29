# Alchemion

Alchemion 面向晶体和分子结构的浏览器 TypeScript SDK，交付一个 SDK 和独立 demo。运行目标为现代桌面 WebGL2；Node.js 仅用作开发工具。

## 当前状态

M1工程基线和M3科学核心已完成。M4正在交付新版CIF/MOL/POSCAR、编辑事务/历史和独立计算运行时；实际验证状态见[当前计划](docs/plans/m4-formats-runtime.md)。正式Three viewer与完整demo仍由M5/M6完成。

M2 已完成并选定 Three.js 0.186.1，Windows 与 Ubuntu 定向验证通过；现有 SDK viewer 仍为历史 Babylon 路径，M5/M6 迁移。实际进展见 [交接](docs/handoff.md)、[M2 计划](docs/plans/m2-renderer-selection.md) 和 [M2 证据](docs/evidence/m2-renderer-selection.md)。历史代码基准为 06784cf。

正式`core`和`formats`使用同一新版科学模型。科学能力、参考和验证见[M3计划](docs/plans/m3-scientific-core.md)、[独立参考](docs/evidence/m3-scientific-reference.md)与[ADR0003](docs/decisions/0003-scientific-core.md)；M4接口决策见[ADR0004](docs/decisions/0004-formats-runtime.md)。历史Babylon viewer/demo暂用自产旧模型输入，不提供新旧模型适配。

## 现有工程入口

固定 Node **24.22.1**（见 .node-version）与 pnpm **9.7.0**（packageManager）。先配置对应 Node，再运行：

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm exec playwright install chromium firefox webkit
pnpm dev
```

Linux 安装浏览器时使用 Playwright 的 --with-deps 选项。不要跳过安装脚本。CI 使用 Ubuntu 24.04；本地 Windows 和 Linux 的运行结果分别记录。

| 命令                                               | 当前作用                                                                                            |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| pnpm dev / pnpm demo                               | 等价入口；先构建 SDK/声明，再监听 SDK 更新并启动独立 demo。                                         |
| pnpm build                                         | SDK 类型检查、ESM/模块 Worker/声明构建，然后构建 demo。                                             |
| pnpm typecheck                                     | 先准备 SDK，再检查纯 core/formats、demo、测试和构建配置。                                           |
| pnpm lint                                          | 只读 ESLint，包含模块边界限制。                                                                     |
| pnpm format:check                                  | 只读 Prettier，包含代码、配置和 Markdown。                                                          |
| pnpm test -- <文件路径>                            | 单次 Vitest；可指定相关文件，默认最多 4 个进程，无重试。                                            |
| pnpm test:watch                                    | 显式启用 Vitest watch。                                                                             |
| pnpm test:browser                                  | 准备 SDK，运行三个浏览器的 M1 创建/真实 Worker/拾取/销毁冒烟。                                      |
| pnpm test:browser -- --phase=m2                    | 构建 M2 宿主，定向运行三个浏览器的候选正确性、Worker、更新与生命周期场景。                          |
| pnpm test:browser -- --phase=m4                    | 准备SDK和M4宿主，定向运行三个浏览器的计算运行时、编辑控制器与异步终结场景。                         |
| pnpm test:package                                  | pack 后在仓库外安装 tarball，检查全部公开声明、生产构建和三个浏览器的嵌套 Worker 场景。             |
| pnpm test:package -- --phase=m4 --project=chromium | 真实tarball编译core/formats无DOM声明，核对新Worker、格式、编辑及受影响历史入口；不依赖源码alias。   |
| pnpm check:m1                                      | 复用一次 SDK 构建，执行历史 M1 工程检查、新版 CIF 目录、浏览器与 tarball 验收；不作为 M2 默认验证。 |
| pnpm check                                         | 显式全量检查入口；新增阶段后可能扩大，不作为默认任务验证。                                          |
| pnpm bench -- --smoke                              | 128 原子、120 帧的真实采集冒烟，输出 .tmp/bench/m1-smoke.json；不验收 T-PERF-01。                   |
| pnpm bench -- --renderer-selection                 | 获选 Three 的两模式各三轮硬件复验；完整双候选对照检出 07527f8，原始输出在 .tmp/bench/m2。           |
| pnpm docs:check                                    | 检查本地 Markdown 链接。                                                                            |

测试默认 4 个进程，可用 TEST_WORKERS 覆盖浏览器并行数。资源允许时使用 4–8；资源不足时记录降并行的原因。只运行与变更直接相关的检查，重复或扩大验证须记录技术理由。

M2 Ubuntu 软件功能场景因实际资源超时降为 2 进程，保留完整数量与画质，采用显式软件同步配置；硬件采样独占串行，软件数据不用于性能验收。失败及复验理由见 M2 证据。

## SDK 与 demo 边界

唯一 SDK 位于 packages/alchemion，独立应用位于 apps/demo。三个入口为 alchemion/core、alchemion/formats、alchemion/viewer；无旧根入口、CJS 或内部深层导入。demo 和消费者不使用源码 alias。SDK 的常规浏览器依赖由其 manifest 声明，模块 Worker 的计算依赖随资源打包。

M4的控制器可以独立使用，不创建canvas。先构建SDK后，浏览器消费者通过公开入口读取结构并编辑：

```ts
import { parseStructure, writeStructure } from 'alchemion/formats'
import { createEditorController } from 'alchemion/viewer'

const parsed = parseStructure(cifText, { format: 'cif' })
if (!parsed.structure) throw new Error(JSON.stringify(parsed.diagnostics))
const editor = createEditorController()
editor.subscribe((state) => console.log(state.status, state.revision, state.diagnostics))
await editor.load(parsed.structure)
await editor.execute({ type: 'set-element', atomId: parsed.structure.atoms[0].id, element: 'O' })
await editor.undo()
const exported = writeStructure(editor.getState().snapshot!, { format: 'cif', version: '2' })
console.log(exported.text, exported.diagnostics)
// 宿主卸载时调用；dispose 可重复调用。
window.addEventListener('pagehide', () => editor.dispose(), { once: true })
```

纯事务也可从`alchemion/core`使用`createDocumentStore`。导出默认拒绝科学损失；显式接受该次损失可传`allowLoss:true`，硬性格式前提仍需满足。完整字段矩阵见[产品规范](docs/product.md)。正式三维门面由M5接入上述控制器；当前`pnpm dev`仍运行暂存历史demo。

## 科学核心示例

```ts
import { createCell, createStructureSnapshot, deriveStructure } from 'alchemion/core'

const cell = createCell({ a: 4, b: 4, c: 4, alpha: 90, beta: 90, gamma: 90 })
if (!cell.ok) throw new Error(cell.diagnostics[0].message)
const source = createStructureSnapshot({
  kind: 'periodic',
  cell: cell.value,
  atoms: [{ id: 'C-source-1', element: 'C', fractional: [0.25, 0.25, 0.25] }],
  bonds: []
})
if (source.ok) {
  const displayed = deriveStructure(source.value, { neighborCells: [[1, 0, 0]] })
  console.log(displayed)
}
```

结果携带诊断，失败分支没有半成品；实例携带可逆来源。无对称信息时只假定恒等操作并报告警告。该快照供正式格式、编辑和计算接口使用；历史`AlchemionEditor`仍在M5迁移。

## 文档导航

- [Codex 指令](AGENTS.md)、[执行计划规则](PLANS.md)、[当前交接](docs/handoff.md)
- [产品](docs/product.md)、[领域](docs/domain.md)、[架构](docs/architecture.md)、[质量](docs/quality.md)
- [历史审计](docs/baseline.md)、[数据来源](docs/data-sources.md)、[路线图](docs/roadmap.md)
- [基础决策](docs/decisions/0001-project-foundation.md)、[已接受的渲染决策](docs/decisions/0002-renderer-selection.md)

仓库代码使用[MIT License](LICENSE)。科学表与格式数据的来源、版本、散列和许可见随包`SCIENTIFIC_DATA_MANIFEST.json`、`dist/FORMAT_DATA_MANIFEST.json`及`THIRD_PARTY_NOTICES.md`。旧格式实现和失去消费者的样例已替换/移除；历史viewer元素/配色仍由M5/M6处理，不替后续阶段宣称完成审核。
