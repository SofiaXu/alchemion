# Alchemion

Alchemion 是面向晶体和分子结构的浏览器 TypeScript SDK，交付唯一 SDK 和独立 demo。运行目标为现代桌面 WebGL2；Node.js 仅作为开发工具。

## 当前状态

M1–M6 已完成，正式 SDK 使用 Three.js 0.186.1。双语工作台、取消恢复、最终真实消费者及硬件六轮均有验收证据，见[M6报告](docs/evidence/m6-demo-distribution.md)、[执行计划](docs/plans/m6-demo-distribution.md)与[交接](docs/handoff.md)。

三个公开入口是 `alchemion/core`、`alchemion/formats`、`alchemion/viewer`。core/formats 无 DOM 依赖，viewer 组合唯一科学实现、编辑历史与模块 Worker；公开 API 不暴露引擎对象，无旧根入口、CJS、深层导入或兼容实现。

## 现有工程入口

固定 Node **24.22.1**（.node-version）和 pnpm **9.7.0**（packageManager）。Windows 本机可使用 `.tools/pnpm.cmd`，它同时固定 Node。配置工具链后运行：

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm exec playwright install chromium firefox webkit
pnpm dev
```

Linux 安装浏览器需使用 Playwright `--with-deps`。不要跳过安装脚本。CI 使用 Ubuntu 24.04；Windows 和 Linux 分别记录实际结果。

| 命令                                                 | 当前作用                                                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `pnpm dev` / `pnpm demo`                             | 准备 SDK/声明和离线来源资产，监听 SDK 更新并启动独立工作台。                                      |
| `pnpm dev -- --smoke --prepared`                     | 复用同轮 SDK，Chromium 验证开发模式的 Worker、编辑与导出。                                        |
| `pnpm build`                                         | SDK 类型检查、ESM/模块 Worker/声明及 demo 生产构建。                                              |
| `pnpm typecheck`                                     | 准备 SDK 后检查无 DOM core/formats、demo、测试和构建配置。                                        |
| `pnpm lint` / `pnpm format:check`                    | 显式全仓只读检查；任务默认只对改动文件运行对应工具。                                              |
| `pnpm test -- <文件路径>`                            | 单次定向 Vitest，默认最多4进程、无重试。                                                          |
| `pnpm test:watch`                                    | 显式 Vitest watch。                                                                               |
| `pnpm test:browser -- --phase=m6`                    | 实际生产 demo 的三浏览器完整用户路径；默认 phase 为 M6。                                          |
| `pnpm test:package -- --phase=m6`                    | 仓库外安装真实 tarball，核对声明、三个入口、静态嵌套 URL Worker、双实例和20轮释放。默认三浏览器。 |
| `pnpm test:browser -- --phase=m5 --grep=@m6-runtime` | 定向运行取消/重算及完整帧恢复集成，不重复全部 M5。                                                |
| `pnpm test:browser -- --phase=m4`                    | 显式运行独立编辑控制器和计算运行时历史关卡。                                                      |
| `pnpm bench -- --phase=m6`                           | 最终真实 tarball 的固定10k原子/20k键、两模式各三轮硬件采集；默认 phase 为 M6。                    |
| `pnpm bench -- --smoke`                              | 历史128原子/120帧采集，不验收 T-PERF-01。                                                         |
| `pnpm ci:changes --scope/--unit/--checks`            | CI 按实际 diff（包含删除）选择关卡、定向单元和现存改动文件检查。每次只传一个模式。                |
| `pnpm docs:check`                                    | 检查本地 Markdown 链接。                                                                          |
| `pnpm check`                                         | 人工显式全量入口；不作为普通任务默认验证。                                                        |

资源允许时普通测试使用4–8进程，默认4，无自动重试。浏览器可用 `TEST_WORKERS` 配置；单个场景不人为复制。`--grep=<正则>`只选择受影响场景，`--prepared`仅复用同轮构建，不依赖前一会话 dist。GPU基准独占串行，软件渲染只证明功能。失败、未运行、通过分别记录，新增/扩大/重复验证须有具体理由。

M4/M5 的显式 browser/package 及 M5 bench 入口保留；M2 临时原型已经清理，完整双候选比较请检出 `07527f8`，历史修复及证据见[M2报告](docs/evidence/m2-renderer-selection.md)。

## 双语工作台

通过 `pnpm dev` 打开 demo：中央三维视图，侧栏提供导入、显示、测量、编辑和导出。中英切换首次跟随浏览器并保存选择；SDK诊断保留原文代码、消息和定位。

内置合成分子及双 block 晶体均项目自产，随静态产物打包。可读取本地 CIF1/2、MOL V2000/V3000；多 block CIF 显式选择。导入失败保留当前源和历史。点坐标明确区分表面/视平面，周期结构另显示分数坐标；距离/角度/有符号二面角按显示实例中心计算。

源原子表每页50行。增删、元素/坐标、派生实例回源及晶胞编辑都通过正式事务；一次提交对应一次历史。晶胞编辑保持分数坐标，可显式选择同一事务重置为P1。取消任务保留已接受源和历史，重新计算恢复显示。

导出提供 CIF1/2、默认 MOL V3000、显式 V2000 和周期 POSCAR。周期 MOL 需要显式有限源原子或显示实例集合；科学损失默认拒绝，只能为当前修订与选项接受已列损失。硬性限制不会被接受损失绕过。CIF/MOL可下载并重新导入；POSCAR仅导出。来源与许可可从界面打开，无外部数据库请求。

## SDK 示例

SDK 位于 `packages/alchemion`，独立应用位于 `apps/demo`；demo 和消费者不使用源码 alias。先构建 SDK 后：

```ts
import { parseStructure, writeStructure } from 'alchemion/formats'
import { createViewer } from 'alchemion/viewer'

const cifText = `data_example
_cell_length_a 4
_cell_length_b 4
_cell_length_c 4
_cell_angle_alpha 90
_cell_angle_beta 90
_cell_angle_gamma 90
loop_
_atom_site_label
_atom_site_type_symbol
_atom_site_fract_x
_atom_site_fract_y
_atom_site_fract_z
C1 C 0.25 0.25 0.25
`
const parsed = parseStructure(cifText, { format: 'cif', block: { index: 0 } })
if (!parsed.structure) throw new Error(JSON.stringify(parsed.diagnostics))
const container = document.createElement('div')
container.style.height = '480px'
document.body.append(container)
const viewer = createViewer(container, {
  renderMode: 'ball-and-stick',
  interactionMode: 'select',
  showLattice: true
})
viewer.subscribe((event) => console.log(event))
await viewer.load(parsed.structure)
await viewer.execute({ type: 'set-element', atomId: parsed.structure.atoms[0].id, element: 'O' })
await viewer.undo()
const exported = writeStructure(viewer.getSnapshot()!, { format: 'cif', version: '2' })
console.log(exported.text, exported.diagnostics)
window.addEventListener('pagehide', () => viewer.dispose(), { once: true })
```

`load/setOptions/execute/undo/redo/recompute` 在对应完整帧后完成。新请求取代、cancel、clear或dispose可能以 `AbortError` 结束，宿主应处理这一正常控制流。`cancel()` 幂等，保留已接受源、documentId/revision和历史；`recompute()` 按当前选项重建显示，不新增事务。解析/源校验失败保留原文档，源接受后的计算/渲染失败保留新源并进入可恢复error。

不需要canvas时可用 `createEditorController`（viewer入口）或纯 `createDocumentStore`（core入口）。导出默认拒绝损失；一次明确接受可传 `allowLoss:true`，硬性格式前提仍需满足。完整字段矩阵见[产品规范](docs/product.md)，三维接口与坐标单位见[架构](docs/architecture.md)和[ADR0005](docs/decisions/0005-formal-viewer.md)。

## 文档与来源

- [Codex指令](AGENTS.md)、[计划规则](PLANS.md)、[当前交接](docs/handoff.md)
- [产品](docs/product.md)、[领域](docs/domain.md)、[架构](docs/architecture.md)、[质量](docs/quality.md)、[路线图](docs/roadmap.md)
- [历史审计](docs/baseline.md)、[数据来源台账](docs/data-sources.md)、[渲染选型](docs/decisions/0002-renderer-selection.md)

项目代码与自产样例使用[MIT许可](LICENSE)。SDK随包携带科学/范德华/格式manifest和完整第三方声明，Three运行依赖由manifest声明；demo构建生成离线的`generated/notices.txt`和`generated/data-manifests.json`，包含来源、许可和实际输入/输出散列。历史数据登记不替来源不明资产追认许可。构建产物验收不等同于npm或站点发布。
