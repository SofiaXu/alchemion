# Alchemion

Alchemion 面向晶体和分子结构的浏览器 TypeScript SDK，交付一个 SDK 和独立 demo。运行目标为现代桌面 WebGL2；Node.js 仅用作开发工具。

## 当前状态

M1–M4已完成，M2已选定Three.js0.186.1。M5正式viewer正在按[当前计划](docs/plans/m5-viewer.md)实施验收；完整demo流程和最终分发复核由M6完成。实际状态与证据入口见[交接](docs/handoff.md)。

正式core/formats/viewer采用同一新版模型。viewer只保留Three后端和M4独立控制器/运行时，历史Babylon代码、Worker和旧数据已退出正式产物，不提供旧API适配。科学约定见[领域规范](docs/domain.md)，三维接口见[ADR0005](docs/decisions/0005-formal-viewer.md)。

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
| pnpm test:browser                                  | 准备 SDK，运行三个浏览器的工程创建/真实 Worker/拾取/销毁冒烟。                                      |
| pnpm test:browser -- --phase=m2                    | 构建 M2 宿主，定向运行三个浏览器的候选正确性、Worker、更新与生命周期场景。                          |
| pnpm test:browser -- --phase=m4                    | 准备SDK和M4宿主，定向运行三个浏览器的计算运行时、编辑控制器与异步终结场景。                         |
| pnpm test:package                                  | pack 后在仓库外安装 tarball，检查全部公开声明、生产构建和三个浏览器的模块 Worker 场景。             |
| pnpm test:package -- --phase=m4 --project=chromium | 真实tarball编译core/formats无DOM声明，核对Worker、格式、编辑及新viewer入口；不依赖源码alias。       |
| pnpm check:m1                                      | 复用一次 SDK 构建，执行历史 M1 工程检查、新版 CIF 目录、浏览器与 tarball 验收；不作为 M2 默认验证。 |
| pnpm check                                         | 显式全量检查入口；新增阶段后可能扩大，不作为默认任务验证。                                          |
| pnpm bench -- --smoke                              | 128 原子、120 帧的真实采集冒烟，输出 .tmp/bench/m1-smoke.json；不验收 T-PERF-01。                   |
| pnpm bench -- --renderer-selection                 | 获选 Three 的两模式各三轮硬件复验；完整双候选对照检出 07527f8，原始输出在 .tmp/bench/m2。           |
| pnpm docs:check                                    | 检查本地 Markdown 链接。                                                                            |

测试默认 4 个进程，可用 TEST_WORKERS 覆盖浏览器并行数。资源允许时使用 4–8；资源不足时记录降并行的原因。只运行与变更直接相关的检查，重复或扩大验证须记录技术理由。

M2 Ubuntu 软件功能场景因实际资源超时降为 2 进程，保留完整数量与画质，采用显式软件同步配置；硬件采样独占串行，软件数据不用于性能验收。失败及复验理由见 M2 证据。

M5入口已建立：

```sh
pnpm test:browser -- --phase=m5
pnpm test:package -- --phase=m5 --project=chromium
pnpm bench -- --phase=m5
```

browser默认三个浏览器/4进程、无重试；可传`--grep=<正则>`只复验受影响场景。`--prepared`仅复用同轮SDK构建。M5硬件bench从真实tarball采集两模式各三轮，GPU独占串行；软件渲染只用于功能验证。模式/轮次、resume及原始数据规则见质量规范，不能用子集宣称性能关卡完成。

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

纯事务也可从`alchemion/core`使用`createDocumentStore`。导出默认拒绝科学损失；显式接受该次损失可传`allowLoss:true`，硬性格式前提仍需满足。完整字段矩阵见[产品规范](docs/product.md)。正式三维门面复用相同控制器。当前`pnpm dev`已最小迁移到新API；完整导入、编辑表单和导出工作流留M6。

```ts
import { createViewer } from 'alchemion/viewer'
import type { StructureSnapshot } from 'alchemion/core'

const sourceSnapshot: StructureSnapshot = {
  kind: 'molecular',
  atoms: [{ id: 'C1', element: 'C', cartesian: [0, 0, 0] }],
  bonds: []
}

const viewer = createViewer(document.querySelector<HTMLElement>('#viewer')!, {
  renderMode: 'ball-and-stick',
  interactionMode: 'select',
  showLattice: true
})
viewer.subscribe((event) => console.log(event))
await viewer.load(sourceSnapshot)
await viewer.execute({ type: 'set-element', atomId: sourceSnapshot.atoms[0].id, element: 'O' })
await viewer.undo()
viewer.dispose()
```

异步方法在对应完整帧提交后完成。新请求取代、clear或dispose可能返回`AbortError`，宿主应处理这种正常控制流；源校验失败保留原结构，接受有效源后的计算/渲染失败保留新源并呈现error。空间填充默认范德华半径，球棍和颜色/尺寸可配置；自由点、测量、选择事件的单位和来源见架构规范。

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

结果携带诊断，失败分支没有半成品；实例携带可逆来源。无对称信息时只假定恒等操作并报告警告。该快照供正式格式、编辑和计算接口使用；可直接传给正式`createViewer`。

## 文档导航

- [Codex 指令](AGENTS.md)、[执行计划规则](PLANS.md)、[当前交接](docs/handoff.md)
- [产品](docs/product.md)、[领域](docs/domain.md)、[架构](docs/architecture.md)、[质量](docs/quality.md)
- [历史审计](docs/baseline.md)、[数据来源](docs/data-sources.md)、[路线图](docs/roadmap.md)
- [基础决策](docs/decisions/0001-project-foundation.md)、[已接受的渲染决策](docs/decisions/0002-renderer-selection.md)

仓库代码使用[MIT License](LICENSE)。科学表与格式数据的来源、版本、散列和许可见随包`SCIENTIFIC_DATA_MANIFEST.json`、`dist/FORMAT_DATA_MANIFEST.json`及`THIRD_PARTY_NOTICES.md`。M5新增范德华数据的来源、散列和许可见随包`VDW_DATA_MANIFEST.json`；默认配色为项目独立定义。最终demo资产和分发复核留M6。
