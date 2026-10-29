# 目标架构与接口边界

状态：2026-10-29。M1 已建立 SDK/demo workspace 与公开子路径；M3 正在以 [ADR 0003](decisions/0003-scientific-core.md) 落实正式科学模型，运行验证以阶段证据为准。格式、事务/运行时和最终 viewer API 仍为 M4–M5 目标。产品能力以 [product.md](product.md)、科学语义以 [domain.md](domain.md)、验证以 [quality.md](quality.md) 为准。旧代码事实见 [baseline.md](baseline.md)。

## 交付与依赖方向

采用 pnpm workspace：一个 SDK 包和一个独立 demo。表中目录与三个子路径已由 M1 建立；职责是 M3–M5 的最终目标，当前仍搬迁使用旧模型和算法。

| 目标位置／正式入口   | 职责与允许依赖                                                                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/alchemion` | 唯一 SDK 包，包名 `alchemion`；发布 ESM 和声明文件。                                                                                                     |
| `alchemion/core`     | 结构模型、通用诊断、晶胞与坐标、对称/扩胞、成键、倒易与第一布里渊区、测量、无界面编辑事务与历史（M4 实现）；只依赖无浏览器副作用的数学实现和经核实数据。 |
| `alchemion/formats`  | CIF1/CIF2、MOL V2000/V3000 的结构读写和周期结构 POSCAR 输出；只依赖 core；接收文本/结构并返回结果与诊断。                                                |
| `alchemion/viewer`   | 浏览器门面、编辑控制器、显式创建的计算运行时、Worker 入口、所选渲染后端及交互；组合 core，按需要使用 formats。                                           |
| `apps/demo`          | SDK 的真实消费者，负责文件选择/下载、控件、错误展示和示例；不得导入 SDK 内部源码。                                                                       |

依赖只沿 `demo → viewer → core` 与 `demo/viewer → formats → core` 方向。core 和 formats 不导入 DOM、渲染引擎、Worker、`?worker` 等构建器语法；浏览器运行时才创建 Worker、canvas 和渲染器。用独立 TypeScript 配置和导入边界检查验证该约束。

正式公共入口为上述三个子路径，使用显式 `exports`；不开放任意内部深层导入，也不保留旧全量入口的兼容实现。`core`/`formats` 导入必须无启动场景、注册全局处理器或创建 Worker 的副作用。Node.js 用于工具链和无浏览器检查，不构成 SDK 的 Node.js 运行时支持承诺。

M4 的纯命令/历史状态机从 `core` 公开，能够在不创建 viewer 的情况下验证事务和历史；浏览器计算运行时从 `viewer` 子路径以显式工厂公开，只有调用该工厂才创建 Worker，独立使用时不创建 canvas 或 WebGL。正式 viewer 组合这两者，不另建私有的第二套编辑规则。具体函数声明在 M4 实施前根据 M3 的模型补全到本文件和消费者编译用例。

M2 已实测选定 Three.js 0.186.1（类型 0.186.0），依据见 [Accepted ADR 0002](decisions/0002-renderer-selection.md)。新版正式 viewer 只使用该后端，不建设通用双引擎框架。M2 的 `RenderSnapshot`/adapter 仅是比较契约，M3/M4 仍须建立正式领域类型和运行时。

M2 候选原型仅是开发验证资产，不进入 SDK exports。按 2026-10-29 用户确认，历史 Babylon 7.23.0 viewer/demo 保留至 M5/M6 迁移；定案时收束新候选，不在 M2 为删除历史依赖而提前重写完整 viewer。

M3 正式 `core` 不再导出历史 `IAtom/IStructure/ILattice`、事件工具或旧数据表。历史消费者的必要依赖移至 `internal/legacy`，只修改内部导入，不创建新旧模型转换层；formats 迁移前暂消费这一内部模型。新 core 禁止导入该历史目录。无消费者的旧键价数据已删除。

## M3 科学接口

`StructureSnapshot` 是 `kind: 'periodic' | 'molecular'` 的判别联合；原子分别含 `fractional` 或 `cartesian`，晶胞仅保存列向量 `basis`。科学未知值为 `unknown/not-applicable`，已知值保存 `value`、可选标准不确定度/字面值/来源。ID 是非空稳定字符串，由创建者提供，校验不重编号。缺失占位在快照工厂中默认 1 并附来源和 info；显式未知保持未知。

`ScientificResult<T>` 为 `{ok:true,value,diagnostics}` 或 `{ok:false,diagnostics}`。`createStructureSnapshot` 复制并冻结输入，`validateStructure` 返回诊断。晶胞工厂/参数/体积/坐标转换及报告体积交叉检查从 core 公开。可用独立科学函数包括 `parseSymmetryOperation/resolveSymmetry`、`deriveInstances/sourcePositionFromInstance`、`inferBonds/deriveStructure`、`measureDistance/measureAngle/measureTorsion`、`reciprocalLattice/reciprocalPoint/computeBrillouinZone`。

实例携带 `id`、源 AtomId、操作 ID、整数平移、实际笛卡尔位置、周期时的分数位置及 `equivalentSources`。显示键引用实例 ID，同时保留规范周期端点和显式/推断来源。BZ 返回科学顶点、外向面、三角化、体积和完备性证书；三维引擎只消费结果。公开完整声明以 [core 入口](../packages/alchemion/src/core/index.ts) 为准。

获选实现使用共享 BufferGeometry、InstancedMesh、DynamicDrawUsage 与局部 update ranges；拾取以 instanceId 查本库身份映射。清空释放结构几何/材质/实例缓冲，销毁同时释放 renderer、循环、监听、Worker 和自有 WebGL context；M2 实测 Three 的 7 个基础句柄随 context loss 释放，正式实现必须保留这个所有权边界。引擎类型始终留在 viewer 内部。精确调用和 Worker 产物约束见 M5 计划。

## 数据、状态与编辑

- **输入与源模型**：`load` 取得独立快照；周期结构保存显式分数坐标，非周期结构保存 Å 制笛卡尔坐标。解析或结构校验在提交前失败时，保留原文档、历史和显示；源快照通过校验后才接受新 documentId 并清历史/选择。调用者后续修改输入不影响 viewer；读取快照也不能修改内部权威状态。
- **身份与派生显示**：原子和键使用稳定 ID。计算输出的每个显示实例包含实例 ID、源原子 ID、对称操作/晶胞偏移及笛卡尔位置；显示键引用显示实例。选择和编辑通过映射回到源对象，不能通过 mesh 名称、坐标相等或对象引用猜测身份。
- **周期键端点**：源结构的每个键端点都包含 `sourceAtomId`、`symmetryOperationId`、`integerCellOffset`；非周期端点使用恒等操作和零偏移。两个端点都能表达非恒等对称影像，不能仅保存 AtomId 或单一相对 shift。键去重按规范端点及物理实例映射处理，科学规范决定操作规范化方式。
- **计算与渲染**：M3 core 产生与引擎无关的 `DerivedStructure` 和科学几何；M4/M5 组合显示选项形成正式渲染快照，后端只将其变成图形并返回实例拾取 ID。坐标转换、成键、倒易和布里渊区不在 renderer 内再实现一份。
- **编辑与历史**：M4 的控制器拥有源快照和撤销/重做历史。原子增删、元素/坐标修改、晶胞修改均作为事务命令；一次批量命令只产生一条历史，失败不部分提交，失败/空操作不入历史。晶胞编辑保留分数坐标。新编辑清空 redo；`load`、`clear` 清空历史与选择，load 更换 `documentId`。历史默认保留 100 个事务，可配置；undo/redo 恢复稳定 ID，但修订递增。显示选项、相机和测量不进入结构编辑历史。
- **派生实例编辑**：编辑其源原子，随后重新推导所有关联实例。派生实例不成为第二份可独立编辑的权威结构。测量可以使用显示实例的笛卡尔位置；导出使用源快照，除非产品规范明确另提供扩胞结构操作。

## 公共 API 职责草案

下面保留 M4/M5 格式与 viewer 的**目标 TypeScript 契约草案**；core 的身份、诊断和科学模型已经建立，其余门面尚不能在当前仓库导入或执行。领域模型和格式结果的详细字段由领域/产品规范约束；M4 建立具体声明与编译用例，M5 实现浏览器门面。

```ts
// alchemion/core：周期键最小身份契约，其他科学属性由领域规范补全。
export interface BondEndpoint {
  sourceAtomId: AtomId
  symmetryOperationId: SymmetryOperationId
  integerCellOffset: readonly [number, number, number]
}

// alchemion/core 定义通用 Diagnostic，formats/viewer 复用或重导出。
export interface Diagnostic {
  severity: 'error' | 'warning' | 'info'
  code: string
  message: string
  sourceLocation?: { line: number; column: number; offset?: number }
}

// alchemion/formats：纯文本边界，不隐式 fetch，也不弹出文件选择框。
export type BlockSelector = { name: string } | { index: number }
export type ParseOptions = { format: 'cif'; block?: BlockSelector } | { format: 'mol' }
export type WriteOptions = (
  | { format: 'cif'; version: '1' | '2' }
  | { format: 'mol'; version?: 'V2000' | 'V3000' }
  | { format: 'poscar' }
) & { allowLoss?: boolean }
export interface ParseResult {
  structure?: StructureSnapshot
  diagnostics: readonly Diagnostic[]
  candidates?: readonly { name: string; index: number }[]
}
export interface WriteResult {
  text?: string
  diagnostics: readonly Diagnostic[]
}
export interface CifDocumentResult {
  document?: CifDocument
  diagnostics: readonly Diagnostic[]
}
export function parseCifDocument(text: string): CifDocumentResult
export function parseStructure(text: string, options: ParseOptions): ParseResult
export function writeStructure(structure: StructureSnapshot, options: WriteOptions): WriteResult

// alchemion/viewer：以下签名中的模型/选项/事件类型均须为引擎无关类型。
export type InteractionMode =
  | 'none'
  | 'select'
  | 'pick-point'
  | 'measure-distance'
  | 'measure-angle'
  | 'measure-torsion'

export interface Viewer {
  load(structure: StructureSnapshot): Promise<void>
  getSnapshot(): StructureSnapshot | undefined
  setOptions(patch: Partial<ViewerOptions>): Promise<void>
  execute(command: EditCommand): Promise<void>
  undo(): Promise<void>
  redo(): Promise<void>
  center(): void
  subscribe(listener: (event: ViewerEvent) => void): () => void
  clear(): void
  dispose(): void
}

export function createViewer(container: HTMLElement, options?: Partial<ViewerOptions>): Viewer
```

`ParseOptions` 显式指定 `format: 'cif' | 'mol'`；CIF 可带 `block?: BlockSelector`，格式版本按文件识别。`WriteOptions` 显式指定 `format: 'cif' | 'mol' | 'poscar'`；CIF 明确版本 `'1' | '2'`，MOL 版本为 `'V2000' | 'V3000'`、省略时为 V3000；损失接受项为 `allowLoss?: boolean`、默认 false。`SourceLocation` 行/列从 1 开始、offset 从 0 开始，未能定位时省略；CIF block index 从 0 开始。

`parseCifDocument` 读取全部 block；`parseStructure` 只映射一个结构，单 block 自动选择，多 block 未指定选择器时返回 error 和候选名称/索引，不暗取第一项。输出仅保证支持字段的科学语义，不能表达时默认 error 且没有 text；调用者显式接受可降级损失时返回 warning 和输出。V2000 超限必须拒绝；周期结构写 MOL 前要求调用者显式取得有限快照；POSCAR 无晶胞或部分占位拒绝，不能由 allowLoss 绕过硬前提。ParseResult/WriteResult 遇到 error 时不返回半成品 structure/text。详细支持字段、诊断和可接受损失以产品/领域规范为准。

viewer 选项覆盖空间填充/球棍、元素颜色、晶格/倒易晶格/布里渊区、对称与邻胞、裁剪和成键、交互模式及性能显示。使用有限选项类型，不再以任意字符串暗示未实现能力。

`ViewerEvent` 至少区分状态、选择、坐标拾取、测量、历史可用性与错误；事件携带当前 documentId/修订。选择区分 `atom` 与 `bond`：原子同时提供实例 ID 与源原子 ID；键提供显示键 ID、源键/推断来源及两端实例身份，不能把键事件当原子事件。测量值带明确定义的单位。当前状态为 `empty / computing / ready / error / disposed`；订阅时立即交付当前状态，错误事件包含可诊断的代码及上下文，不暴露引擎对象。取消、销毁和被取代的派生请求以 `AbortError` 结束，demo 必须处理这种正常控制流。

`load`、需要重算的选项变更、编辑与历史操作返回的 Promise 在对应修订的完整显示提交后完成；仅完成 Worker 计算不算 ready。纯相机/选择操作无需重算。源快照校验通过并接受之后，后续计算或渲染失败时保留已提交的有效源与 error 状态，Promise reject，供下一次命令或重新加载恢复；不能显示旧帧并宣称新修订已 ready。该情形不同于提交前的解析/校验失败。引擎对象、材质、场景、相机类均不进入正式 API；相机操作使用库自身的数值参数和命令。

## 异步协议与提交边界

M4 建立一个独立计算 Worker／viewer，由运行时拥有；不沿用嵌套 Worker 池或进程级共享可变结构。Worker 调用同一 core 算法，浏览器线程不复制科学公式。Worker 实现可使用内部构建机制，但产物须让普通 ESM 消费者加载，无需消费者识别 SDK 的源码查询后缀。

每个计算请求和响应携带 `requestId`、`documentId`、文档内单调递增的结构 `revision` 和消息种类；消息包括计算、取消、结果、错误。源结构提交或历史变化产生新修订；计算相关显示选项变化产生新请求 ID 并失效同类旧请求，不写入结构历史。load 更换文档身份，防止新旧文档相同数值修订混淆。控制器仅提交同时匹配当前文档/修订与有效请求的结果。`clear`/`dispose` 立即失效所有请求和待渲染帧；即使取消未能抢占同步计算，过期响应也不得提交，其待决 Promise 必须结束。

同类派生计算采用 latest-wins；结构命令串行执行，不丢弃用户已接受的事务，也不能用 latest-wins 吞掉编辑。Worker 超时默认 30 秒、可配置；超时、Worker 错误、消息反序列化错误与计算异常必须结束对应请求并进入可观察错误状态，不能永久停留 computing。取消为尽力而为，正确性依靠身份/版本检查。渲染分帧任务同样携带文档/修订与取消令牌；提交完整新帧后才发 ready，旧任务不能在 clear 或 dispose 后继续创建资源。

源模型、历史与当前修订由编辑控制器唯一拥有；Worker 只持有某次请求的输入与中间结果，renderer 只持有显示资源。来源元数据和元素记录不以跨线程对象引用建立身份。

## 资源所有权与失效规则

| 资源                                               | 所有者及释放规则                                                                                            |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 宿主容器                                           | 调用者拥有；SDK 不删除容器。SDK 创建并拥有 canvas，dispose 时从容器移除。                                   |
| 引擎上下文、场景、mesh、几何、材质、拾取映射       | 所选后端拥有；clear 释放结构相关资源，允许有界共享基础几何缓存；dispose 释放该 viewer 的全部资源。          |
| RAF／渲染循环、分帧队列、指针/键盘监听、尺寸观察器 | viewer 拥有；观察容器尺寸而非只观察 window；clear 取消结构任务，dispose 全部取消并移除监听。                |
| Worker、消息监听、待决 Promise                     | 运行时拥有；请求结束后移除对应记录，dispose 终止 Worker 并以取消结束待决调用。                              |
| 事件订阅、选择、测量辅助图形                       | 控制器/交互层拥有；clear 重置结构关联状态，dispose 发出一次 disposed 后清理订阅。返回的退订函数可重复调用。 |
| demo 文件控件、下载对象 URL、页面订阅              | demo 拥有，卸载时自行释放，不依赖全局重载清理。                                                             |

`dispose` 幂等；销毁后的状态读取/退订安全，新的修改操作返回明确 disposed 错误。多个 viewer 的状态、相机、任务和清理互不影响。WebGL2 不可用或上下文丢失时发出可操作诊断；上下文恢复需要重建资源并重绘当前有效快照，失败时允许宿主销毁并创建新 viewer，禁止悄悄回退到未验收后端。

## 阶段落实

- M1 建立 workspace、子路径导出、构建与打包消费者检查；不在此时声称新功能可用。
- M2 按 [选型执行计划](plans/m2-renderer-selection.md) 取得同条件实测并接受 ADR 0002；候选原型不扩展为两个正式后端。
- M3 建立科学模型和算法；M4 建立格式、编辑历史和异步协议；M5 按 [viewer 执行计划](plans/m5-viewer.md) 完成单后端与全部交互；M6 完成真实 demo 和整体分发验收。
- 每次正式接口改变同步本文、消费示例和测试；测试映射与数值门槛只以质量规范为准。
