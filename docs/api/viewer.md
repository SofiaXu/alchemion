# viewer API

`alchemion/viewer` 提供浏览器 Viewer，以及无需画布的编辑控制器和计算运行时。导入模块不会创建 canvas 或 Worker；显式工厂创建实例，首次计算才启动自有执行器。运行目标为现代桌面 WebGL2，不承诺 Node.js 运行时。[公开入口](../../packages/alchemion/src/viewer/index.ts)、[Viewer 声明](../../packages/alchemion/src/viewer/types.ts)及[运行时声明](../../packages/alchemion/src/viewer/runtime/types.ts)是完整签名的权威来源。

```ts
import {
  createViewer,
  createEditorController,
  createComputationRuntime,
  ComputationError
} from 'alchemion/viewer'
import type { Viewer, ViewerOptions, ViewerEvent } from 'alchemion/viewer'
```

源结构、单位和编辑命令见[core API](core.md)；文本解析与导出见[formats API](formats.md)。公开接口只传科学数据和本库类型，不返回 Three 对象、mesh、renderer 或 Worker。

## 创建 Viewer 与显示选项

[`createViewer(container, options?)`](../../packages/alchemion/src/viewer/viewer.ts) 接收 `HTMLElement` 和可选 `ViewerCreateOptions`，返回 `Viewer`。宿主须提供有实际宽高的容器，例如 `height: 480px`。Viewer 创建自有 canvas、辅助覆盖层和尺寸观察；一个实例拥有一套源状态、历史及运行时。

`ViewerCreateOptions` 包含 `Partial<ViewerOptions>`，另有仅创建时可设的 `historyLimit`（默认 `100`）、`mode`（默认 `'worker'`）、`timeoutMs`（默认 `30000` 毫秒）和可选 `camera`。这些创建字段不能通过 `setOptions` 修改。无 WebGL2、非法容器/选项/相机时创建可能抛错，宿主应显示错误。

`ViewerOptions` 的全部字段与默认值如下，来源为[options.ts](../../packages/alchemion/src/viewer/options.ts)。

| 字段                    | 默认值                                | 含义                                                                                                   |
| ----------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `renderMode`            | `'space-filling'`                     | `'space-filling'` 或 `'ball-and-stick'`；空间填充不显示键几何。                                        |
| `elementStyles`         | `{}`                                  | 按标准元素符号设置 `ElementStyle`。                                                                    |
| `atomScale`             | `1`                                   | 原子显示半径的正有限倍率。                                                                             |
| `ballRadius`            | `0.45`                                | 球棍原子默认半径，Å。                                                                                  |
| `bondRadius`            | `0.12`                                | 键显示半径，Å。                                                                                        |
| `missingRadius`         | `1.5`                                 | 缺失范德华半径时的视觉兜底，Å，同时给出 `VDW_RADIUS_MISSING` 诊断，不回写科学数据。                    |
| `showLattice`           | `false`                               | 显示晶胞、晶格方向和标签。                                                                             |
| `showReciprocalLattice` | `false`                               | 显示倒易基矢/格点。                                                                                    |
| `showBrillouinZone`     | `false`                               | 显示第一布里渊区。                                                                                     |
| `showSymmetryMates`     | `true`                                | 展开源结构对称操作；关闭时使用真实恒等操作，不改源对称。                                               |
| `neighborCells`         | `[]`                                  | 额外整数晶胞偏移；中心晶胞始终包含。                                                                   |
| `cutoff`                | `{ kind: 'none' }`                    | `none`、带非负分数宽度 `width` 的 `fraction`，或 `bond`；规则见 core。                                 |
| `inferBonds`            | `true`                                | 推断几何邻接键；关闭仍保留可投影的显式键。                                                             |
| `interactionMode`       | `'none'`                              | `none`、`select`、`box-select`、`pick-point`、`measure-distance`、`measure-angle`、`measure-torsion`。 |
| `showPerformance`       | `false`                               | 显示性能覆盖信息。                                                                                     |
| `coordination`          | `{ rules: [], showPolyhedra: false }` | 完整元素对距离规则和多面体开关；不自动套用成键规则。                                                   |

所有显示半径均须为正有限值。`ElementStyle` 可含 `color`（`#RRGGBB` sRGB）、`spaceFillingRadius`（Å）、`ballRadius`（Å）；元素覆盖优先于对应默认半径。默认范德华半径来自科学数据，配色为项目显示选择，详见[来源台账](../data-sources.md)。

`setOptions(patch)` 按顶层字段合并，`elementStyles` 传入的是完整样式记录，不逐元素深合并。保留已有覆盖时使用 `{ ...viewer.getState().options.elementStyles, C: { color: '#404852' } }`；恢复某元素默认值时从记录删除该项再提交。返回状态和选项不可变，输入在接受时隔离。

周期选项按当前源类别解释：分子不派生伪邻胞或分数裁切；开启晶胞/倒易/BZ 时给出周期辅助不可用诊断并隐藏相应图形。倒易和 BZ 位于同 canvas 的独立 Å⁻¹ 小视窗，随主朝向变化，不把 Å 与 Å⁻¹ 混成一套坐标。

## Viewer 方法

| 方法                                         | 返回值与行为                                                                                                         |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `load(snapshot)`                             | `Promise<void>`；复制并验证输入，接受后建立新 documentId、清历史/交互，再计算及显示。                                |
| `getSnapshot()`                              | `StructureSnapshot \| undefined`；当前已接受的只读源快照，不是显示扩胞结果。                                         |
| `getState()`                                 | `ViewerState`，只读状态、选项、诊断、历史标志和可选选择/测量。                                                       |
| `setSelectedSourceAtomIds(ids)`              | `void`；整体校验当前源 ID，去重并按源顺序保存；未知 ID 整体拒绝，相同集合/焦点无操作。                               |
| `setOptions(patch)`                          | `Promise<void>`；更新显示/交互选项，必要时重算派生，纯显示变化复用科学结果，不产生源事务。                           |
| `execute(commandOrArray)`                    | `Promise<void>`；接受一个 `EditCommand` 或命令数组，一批对应一次完整事务。                                           |
| `undo()` / `redo()`                          | `Promise<void>`；恢复源历史，再计算显示。                                                                            |
| `cancel()`                                   | `void`；失效待接受队列、计算、辅助几何、显示提交及等待者；保留已接受源与历史。无待处理工作、重复或销毁后调用无操作。 |
| `recompute()`                                | `Promise<void>`；按当前源与选项恢复计算/显示，不新增事务或修订；空文档拒绝 `EDIT_DOCUMENT_EMPTY`。                   |
| `getCamera()`                                | 返回本库 `CameraPose` 数值副本。                                                                                     |
| `setCamera(pose)`                            | `void`；校验并复制相机姿态。                                                                                         |
| `rotate(azimuthDegrees, elevationDegrees)`   | `void`；以度制有限角度绕 target 旋转。                                                                               |
| `zoom(factor)`                               | `void`；正有限因子乘相机到 target 的距离，`<1` 放大、`>1` 缩小。                                                     |
| `center()`                                   | `void`；按当前显示结构适配相机，不修改源。                                                                           |
| `exportPng(options?)`                        | `Promise<Blob>`；ready 帧导出，见下文像素与取消契约。                                                                |
| `getViewState()` / `restoreViewState(state)` | 返回版本化 `ViewerViewState` / `Promise<void>`；恢复前整体验证，相机和选项在同一呈现版本应用。                       |
| `subscribe(listener)`                        | 立即交付当前 `state` 事件，返回幂等退订函数。                                                                        |
| `clear()`                                    | `void`；立即失效待处理任务并清空源、历史、选择、测量和显示，进入 `empty`。销毁后无操作。                             |
| `dispose()`                                  | `void`；幂等销毁自有运行时、监听、观察、循环、显示及 WebGL 资源，移除自有 canvas/覆盖层，进入 `disposed`。           |

`CameraPose` 含 Å 制 `position/target`、方向 `up`、度制 `fovYDegrees`、Å 制 `near/far`。要求有限坐标、独立的视线与 up、`0 < fovYDegrees < 179`、`0 < near < far`。未显式指定相机时首次载入新文档会适配结构；编辑保留相机。

## 状态、完成与恢复

`ViewerState` 包含 `status`、可选 `documentId`、单调源 `revision`、`canUndo/canRedo`、`options`、`diagnostics`、始终存在的 `selectedSourceAtomIds`，以及可选 `selection/measurement/coordination`。状态为 `empty/computing/ready/cancelled/error/disposed`。

对已有结构，`load/setOptions/execute/undo/redo/recompute` 的 Promise 在对应科学结果和所需辅助图形提交完整 GPU 帧后完成。无变化操作或空文档的纯显示设置不制造新计算。`ready` 不能只表示 Worker 已返回。相机方法是同步控制，不提供完整帧 Promise。

源接受与显示完成是不同边界。解析或源校验失败保留旧文档、历史及显示；有效源接受后的计算/渲染失败保留新源和历史，进入可恢复 `error` 并拒绝 Promise。新事务、undo/redo 增加源修订，load 更换 documentId；显示变化和 recompute 不增加源修订。

源命令按接受顺序串行，不丢弃已接受事务；后续请求可取代过期派生和显示，较早调用的 Promise 因而可能以 `AbortError` 结束。cancel、clear、dispose 也会结束未完成调用。取消是正常控制流，不能把它解释成撤销：已接受的源、ID、documentId/revision 和历史保留，失效显示及交互清除，状态为 `cancelled`；调用 `recompute()` 恢复完整帧。

```ts
try {
  await viewer.recompute()
} catch (error) {
  if (error instanceof Error && error.name === 'AbortError') {
    // 被取消、取代、清空或销毁的正常控制流。
  } else if (error instanceof ComputationError) {
    console.error(error.code, error.diagnostics)
  } else {
    throw error
  }
}
```

context 丢失/恢复仍受当前文档和请求身份约束，不会越过显式取消状态自动重算。`dispose()` 释放本实例拥有的资源；宿主仍负责自己的 DOM、订阅外部事件、下载 URL 和其他应用状态。多个 Viewer 各自隔离，不共用可变源或 Worker。销毁后不要继续执行源/相机操作，使用新实例重新开始。

## 选择、点与测量事件

`ViewerEvent` 按 `type` 判别。除 `state` 通过自身状态携带上下文外，其余事件含 `documentId/revision`，宿主可据此拒绝缓存中的旧结果。

| `type`        | 内容                                                                                                                    |
| ------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `state`       | `state: ViewerState`。                                                                                                  |
| `selection`   | `selectedSourceAtomIds` 和可选活动 `selection: ViewerSelection`；原子为完整 `AtomInstance`，键含两个端点实例。          |
| `point`       | `point: ViewerPoint`，Å `cartesian`、周期时可选 `fractional`、`unit: 'angstrom'`、`source: 'surface' \| 'view-plane'`。 |
| `measurement` | 可选 `measurement: ViewerMeasurement` 及 `diagnostics`；结果含 kind、数值、单位和按顺序选取的实例。                     |
| `history`     | `canUndo/canRedo`。                                                                                                     |
| `error`       | `diagnostics`；操作 Promise 仍须由调用者处理。                                                                          |

select 拾取原子/键并保留源映射。pick-point 点击几何时返回表面交点，空白时返回经过相机 target、法向沿视线的视平面点。测量按显示原子中心而非表面点计算，距离选 2 个、角度选 3 个、二面角选 4 个，使用 Å/度，不应用最小影像；退化选点以诊断呈现。

`selection` 事件同时携带 `selectedSourceAtomIds` 和可选活动 `selection`。集合按源原子定义，高亮全部可见同源实例；活动实例仍用于坐标检查、实例编辑或有限实例导出。普通原子点击替换集合，Shift 增选、Ctrl/Meta 切换成员，普通键点击清批选并检查该键，普通空白清空。`box-select` 左拖采用投影中心贯穿选择，忽略遮挡；只选主视区原子，不选辅助小视窗。

源修订保留仍存在的集合 ID；删除后的 undo 不自动恢复已清除选择。工具切换保留源集合并清临时活动实例和测量；load、clear、cancel、dispose 清集合。按元素选择可过滤 `getSnapshot().atoms` 后调用集合方法。

`coordination.rules` 使用 core 的 `CoordinationRule`（无序元素对和显式 Å 距离）；选中中心或规则改变会失效旧结果并发出独立 Worker 任务。结果在 `state.coordination`，完整帧后才 ready；中心代表、周期边界和资源预算见 [core API](core.md#超胞与配位分析)。空集合或空规则不发配位计算。多面体不参与拾取。

## PNG 与可移植视图

`PngExportOptions` 为 `{ width?: number, height?: number, transparent?: boolean }`，尺寸省略时使用当前画布物理像素，背景默认白色。尺寸必须为正安全整数，总像素不超过 33,554,432，且受设备纹理/渲染缓冲上限约束。输出包括科学几何、配位多面体、晶格/倒易/BZ 标签及当前测量线和文字；不包含性能面板、框选矩形或选择高亮。

导出复用现有 renderer 的离屏 RGBA 目标，不改变源、历史、相机或屏幕尺寸。非 ready 状态拒绝 `PNG_NOT_READY`；导出期间文档、相机、尺寸、显示、测量或配位变化，以及 cancel/clear/dispose 会以 `AbortError` 结束该次调用。同一 viewer 的新导出取代旧导出；其他 viewer 不受影响。所有路径释放临时目标与编码画布并恢复渲染状态。

`ViewerViewState` 为 `{ version: 1, camera: CameraPose, options: ViewerOptions }`，不含源结构、历史、所选中心或计算结果。`validateViewState(input: unknown)` 从公开入口返回隔离、不可变的合法配置，非法版本、字段、选项或相机抛错；用于 JSON 和存储共享校验。恢复以当前文档及当前源选择重新计算配位；无中心时仅恢复配置。校验失败不改变当前视图；接受后的计算/显示错误沿用既有可恢复错误契约。

浏览器命名槽和下载 URL 由宿主拥有；SDK 不访问 localStorage。demo 使用同一配置及校验器提供 JSON 和命名槽，存储损坏保留原字节并降级会话内存。

切换工具、load、clear 会清理临时交互。源修订清测量；仍有效的稳定实例选择可重新解析，无效选择会清除。晶胞、倒易/BZ 和交互辅助图形不参与主原子/键拾取。默认拖动旋转、滚轮缩放。

## 无画布编辑控制器

[`createEditorController(options?)`](../../packages/alchemion/src/viewer/runtime/controller.ts) 返回 `EditorController`，拥有与 Viewer 相同的源事务、历史和独立计算运行时，不创建画布。选项 `EditorControllerOptions` 包含：

| 字段             | 默认及契约                                                                                                                        |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `historyLimit`   | `100` 个完整事务。                                                                                                                |
| `mode/timeoutMs` | `'worker'` / `30000` 毫秒，规则同计算运行时。                                                                                     |
| `derivation`     | `{}`，使用 core 的默认 `DerivationOptions`。                                                                                      |
| `commit`         | 可选 `(result, context, signal) => void \| Promise<void>`；默认立即完成。回调完成后才发布 ready，计算和 commit 各受超时预算约束。 |

`getState()` 返回 `EditorState`，在 `DocumentState` 上增加状态、诊断和可选 `derived`。`load/execute/undo/redo` 返回 `Promise<void>`，源语义与 Viewer 相同。`recompute(options?)` 可用一份新的完整派生选项替换当前选项；省略沿用当前值，不加历史或修订。

`compute(task, { signal? }?)` 接受 `reciprocal`、`brillouin-zone` 或 `coordination` 辅助任务，自动附当前 documentId/revision，与派生共用同一 Worker，返回 `Promise<ComputationResult>`，不创建事务或替换主派生状态。空文档失败；不能通过此方法直接提交 derive。配位任务显式携带快照和规则，宿主应使用当前源发起。

`subscribe(listener)` 立即交付当前 `EditorState`，返回幂等退订函数；`cancel/clear/dispose` 与 Viewer 的源及任务生命周期相同。自定义 commit 必须检查 AbortSignal，过期或取消后不得把外部副作用提交为当前结果。控制器可以立即结束对不理会 signal 的回调的等待，但无法代替宿主回滚其外部副作用。没有自定义 commit 时 ready 表示派生完成，不代表 GPU 帧；正式 Viewer 通过 commit 接入完整帧。

## 独立计算运行时与错误

需要晶体识别或结构构建时使用[建模 API](modeling.md#编辑与异步预览)中的 `createModelingRuntime`。它复用计算协议，拥有独立的可终止 Worker。

[`createComputationRuntime(options?)`](../../packages/alchemion/src/viewer/runtime/runtime.ts) 返回 `ComputationRuntime`，不保存源历史、不创建画布。`ComputationRuntimeOptions.mode` 为 `'worker'`（默认）或 `'sync'`；sync 使用同一 core 算法，仍返回 Promise，在浏览器线程执行，计算开始后无法抢占。`timeoutMs` 默认 `30000`，须为正有限浏览器计时区间，不超过 `2147483647`。

| 方法                             | 契约                                                                                                 |
| -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `compute(request, { signal? }?)` | 返回 `Promise<ComputationResult>`；复制输入，要求非空 documentId、非负安全整数 revision 和有效任务。 |
| `invalidate()`                   | 取消全部待处理请求并重置上下文，不销毁运行时；后续可再次 compute。                                   |
| `dispose()`                      | 幂等失效全部请求并释放自有执行器；之后 compute 拒绝 `RUNTIME_DISPOSED`。                             |

`ComputationRequest` 含 `documentId/revision/task`。`ComputationTask` 是 `derive`（snapshot、可选 options）、`reciprocal`（cell）、`brillouin-zone`（cell、可选 options）、`coordination`（snapshot、CoordinationOptions）之一。`ComputationContext` 增加 `requestId/category`；`ComputationResult` 按 category 对应 `DerivedStructure/ReciprocalLattice/BrillouinZone/CoordinationResult`，同时含上下文和 diagnostics。

同文档/修订的同类别请求采用 latest-wins，取代者使旧请求以 AbortError 结束；文档或修订变化失效所有旧请求。低于当前同文档修订的请求拒绝 `COMPUTATION_STALE_REVISION`。取消尽力抢占，最终正确性依靠请求、文档和修订检查。超时、Worker 错误、反序列化失败或协议错误会结束请求，不永久停留等待；执行器故障后后续计算可重新创建执行器。

[`ComputationError`](../../packages/alchemion/src/viewer/runtime/types.ts) 是公开错误类，构造签名为 `new ComputationError(code, message, diagnostics?)`，包含只读 `code/diagnostics`。超时代码为 `COMPUTATION_TIMEOUT`，`name` 为 `TimeoutError`，其余为 `ComputationError`。取消使用 `name: 'AbortError'` 的 DOMException，不是该类。创建参数和相机/显示值错误也可能是 TypeError/RangeError，错误处理应保留未知异常。

## 公开类型索引

| 声明来源                                                           | 导出类型                                                                                                    |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| [Viewer 与选项](../../packages/alchemion/src/viewer/types.ts)      | `Viewer`、`ViewerOptions`、`ViewerCreateOptions`、`ElementStyle`、`CameraPose`、`InteractionMode`。         |
| [状态和事件](../../packages/alchemion/src/viewer/types.ts)         | `ViewerState`、`ViewerEvent`、`ViewerEventContext`、`ViewerSelection`、`ViewerMeasurement`、`ViewerPoint`。 |
| [任务与结果](../../packages/alchemion/src/viewer/runtime/types.ts) | `ComputationTask`、`ComputationCategory`、`ComputationRequest`、`ComputationContext`、`ComputationResult`。 |
| [运行时](../../packages/alchemion/src/viewer/runtime/types.ts)     | `ComputationRuntime`、`ComputationRuntimeOptions`。                                                         |
| [控制器](../../packages/alchemion/src/viewer/runtime/types.ts)     | `EditorController`、`EditorControllerOptions`、`EditorState`。                                              |

Worker 协议、故障注入、渲染帧和后端对象是内部实现，不从公开入口导出。实际打包集成方法见[快速开始](../getting-started.md)，模块与产物边界见[架构](../architecture.md)。
