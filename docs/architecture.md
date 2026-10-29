# 目标架构与接口边界

状态：架构与公开接口规范，更新于2026-10-30。实际阶段进展及Windows/Ubuntu验收统一见[当前交接](handoff.md)。产品能力以[product.md](product.md)、科学语义以[domain.md](domain.md)、验证以[quality.md](quality.md)为准。旧代码事实见[baseline.md](baseline.md)。

## 交付与依赖方向

采用pnpm workspace：一个SDK包和一个独立demo。三个子路径已由M1建立，正式core/formats和独立编辑/运行时已实现；M5正式viewer只使用Three，历史实现已退出正式目录。

| 目标位置／正式入口   | 职责与允许依赖                                                                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/alchemion` | 唯一 SDK 包，包名 `alchemion`；发布 ESM 和声明文件。                                                                                                     |
| `alchemion/core`     | 结构模型、通用诊断、晶胞与坐标、对称/扩胞、成键、倒易与第一布里渊区、测量、无界面编辑事务与历史（M4 实现）；只依赖无浏览器副作用的数学实现和经核实数据。 |
| `alchemion/formats`  | CIF1/CIF2、MOL V2000/V3000 的结构读写和周期结构 POSCAR 输出；只依赖 core；接收文本/结构并返回结果与诊断。                                                |
| `alchemion/viewer`   | 浏览器门面、编辑控制器、显式创建的计算运行时、Worker 入口、所选渲染后端及交互；组合 core，按需要使用 formats。                                           |
| `apps/demo`          | SDK 的真实消费者，负责文件选择/下载、控件、错误展示和示例；不得导入 SDK 内部源码。                                                                       |

依赖只沿 `demo → viewer → core` 与 `demo/viewer → formats → core` 方向。core 和 formats 不导入 DOM、渲染引擎、Worker、`?worker` 等构建器语法；浏览器运行时才创建 Worker、canvas 和渲染器。用独立 TypeScript 配置和导入边界检查验证该约束。

正式公共入口为上述三个子路径，使用显式 `exports`；不开放任意内部深层导入，也不保留旧全量入口的兼容实现。`core`/`formats` 导入必须无启动场景、注册全局处理器或创建 Worker 的副作用。Node.js 用于工具链和无浏览器检查，不构成 SDK 的 Node.js 运行时支持承诺。

M4的纯命令/历史状态机从`core`的`createDocumentStore`公开；`viewer`公开`createComputationRuntime`和`createEditorController`。导入没有创建Worker/canvas的副作用，首次计算才创建自有执行器。正式viewer组合相同控制器，不另建第二套编辑规则。具体决策见[ADR0004](decisions/0004-formats-runtime.md)。

M2已实测选定Three.js0.186.1（类型0.186.0），依据见[Accepted ADR0002](decisions/0002-renderer-selection.md)。新版正式viewer只使用该后端，不建设通用双引擎框架。M2的RenderSnapshot/adapter仅是比较契约；正式领域与运行时接口已经由M3/M4建立，见下文。

M2 候选原型仅是开发验证资产，不进入 SDK exports。按 2026-10-29 用户确认，历史 Babylon 7.23.0 viewer/demo 保留至 M5/M6 迁移；定案时收束新候选，不在 M2 为删除历史依赖而提前重写完整 viewer。

正式core不再导出历史IAtom/IStructure/ILattice、事件工具或旧数据表。M3曾将旧格式/viewer依赖隔离到internal/legacy；M4已移除旧格式和历史setting数组，M5删除失去消费者的历史viewer、类型、算法和配色，不创建转换层。新core/formats均禁止导入历史目录。无消费者的旧键价数据已删除。

## M3 科学接口

`StructureSnapshot` 是 `kind: 'periodic' | 'molecular'` 的判别联合；原子分别含 `fractional` 或 `cartesian`，晶胞仅保存列向量 `basis`。科学未知值为 `unknown/not-applicable`，已知值保存 `value`、可选标准不确定度/字面值/来源。ID 是非空稳定字符串，由创建者提供，校验不重编号。缺失占位在快照工厂中默认 1 并附来源和 info；显式未知保持未知。

`ScientificResult<T>` 为 `{ok:true,value,diagnostics}` 或 `{ok:false,diagnostics}`。`createStructureSnapshot` 复制并冻结输入，`validateStructure` 返回诊断。晶胞工厂/参数/体积/坐标转换及报告体积交叉检查从 core 公开。可用独立科学函数包括 `parseSymmetryOperation/resolveSymmetry`、`deriveInstances/sourcePositionFromInstance`、`inferBonds/deriveStructure`、`measureDistance/measureAngle/measureTorsion`、`reciprocalLattice/reciprocalPoint/computeBrillouinZone`。

实例携带 `id`、源 AtomId、操作 ID、整数平移、实际笛卡尔位置、周期时的分数位置及 `equivalentSources`。显示键引用实例 ID，同时保留规范周期端点和显式/推断来源。BZ 返回科学顶点、外向面、三角化、体积和完备性证书；三维引擎只消费结果。公开完整声明以 [core 入口](../packages/alchemion/src/core/index.ts) 为准。

获选实现使用共享 BufferGeometry、InstancedMesh、DynamicDrawUsage 与局部 update ranges；拾取以 instanceId 查本库身份映射。清空释放结构几何/材质/实例缓冲，销毁同时释放 renderer、循环、监听、Worker 和自有 WebGL context；M2 实测 Three 的 7 个基础句柄随 context loss 释放，正式实现必须保留这个所有权边界。引擎类型始终留在 viewer 内部。精确调用和 Worker 产物约束见 M5 计划。

## 数据、状态与编辑

### M4独立接口

`createDocumentStore({historyLimit?})`提供同步`load/execute/undo/redo/clear/getState`，事务操作返回`ScientificResult<DocumentChange>`。状态包含可选源快照/documentId、revision及canUndo/canRedo。`execute`接受单命令或数组，命令涵盖add-atom/remove-atom/set-element/set-position/set-instance-position/set-cell/set-symmetry；新原子ID由调用者提供，禁止重用本文件曾发出的ID。实例命令带原documentId/revision，旧实例必须被拒绝。

`createComputationRuntime({mode?,timeoutMs?})`提供`compute/invalidate/dispose`，模式为worker或sync，默认30秒。任务为derive、reciprocal或brillouin-zone，携带documentId/revision；响应增加requestId/category/value/diagnostics。每个runtime独占执行器，默认Worker；全部模式使用同一core任务分派。同步执行本身不可抢占，取消正确性仍由请求失效检查保证。

`createEditorController({historyLimit?,mode?,timeoutMs?,derivation?,commit?})`提供异步load/execute/undo/redo/recompute、辅助compute以及clear/dispose/subscribe/getState。commit接收DerivedStructure、请求上下文和AbortSignal，Promise完成才发ready；默认立即完成，M5以完整帧提交替换它。辅助compute只接受倒易/BZ任务并共享同一Worker，不修改结构历史或主派生状态。订阅立即交付当前状态，返回幂等退订函数。

格式正式入口为`parseCifDocument/writeCifDocument/parseStructure/writeStructure`。MOL的`finite`可选source+atomIds或instances+endpoints；周期输入必须指定，`WriteResult.atomMapping`给出fileAtomNumber/exportAtomId/source。CIF AST拥有全部blocks、saveFrames、item/loop和值类型，格式专属来源元数据只通过JSON保留科学损失清单与测量锚点，不向core加入AST。编译用例同时检查core/formats声明无DOM。

- **输入与源模型**：`load` 取得独立快照；周期结构保存显式分数坐标，非周期结构保存 Å 制笛卡尔坐标。解析或结构校验在提交前失败时，保留原文档、历史和显示；源快照通过校验后才接受新 documentId 并清历史/选择。调用者后续修改输入不影响 viewer；读取快照也不能修改内部权威状态。
- **身份与派生显示**：原子和键使用稳定 ID。计算输出的每个显示实例包含实例 ID、源原子 ID、对称操作/晶胞偏移及笛卡尔位置；显示键引用显示实例。选择和编辑通过映射回到源对象，不能通过 mesh 名称、坐标相等或对象引用猜测身份。
- **周期键端点**：源结构的每个键端点都包含 `sourceAtomId`、`symmetryOperationId`、`integerCellOffset`；非周期端点使用恒等操作和零偏移。两个端点都能表达非恒等对称影像，不能仅保存 AtomId 或单一相对 shift。键去重按规范端点及物理实例映射处理，科学规范决定操作规范化方式。
- **计算与渲染**：M3 core 产生与引擎无关的 `DerivedStructure` 和科学几何；M4/M5 组合显示选项形成正式渲染快照，后端只将其变成图形并返回实例拾取 ID。坐标转换、成键、倒易和布里渊区不在 renderer 内再实现一份。
- **编辑与历史**：M4 的控制器拥有源快照和撤销/重做历史。原子增删、元素/坐标修改、晶胞修改均作为事务命令；一次批量命令只产生一条历史，失败不部分提交，失败/空操作不入历史。晶胞编辑保留分数坐标。新编辑清空 redo；`load`、`clear` 清空历史与选择，load 更换 `documentId`。历史默认保留 100 个事务，可配置；undo/redo 恢复稳定 ID，但修订递增。显示选项、相机和测量不进入结构编辑历史。
- **派生实例编辑**：编辑其源原子，随后重新推导所有关联实例。派生实例不成为第二份可独立编辑的权威结构。测量可以使用显示实例的笛卡尔位置；导出使用源快照，除非产品规范明确另提供扩胞结构操作。

## 正式三维公共 API

M5提供`createViewer(container:HTMLElement, options?:ViewerCreateOptions):Viewer`。完整声明以[viewer/types.ts](../packages/alchemion/src/viewer/types.ts)为准，决策见[ADR0005](decisions/0005-formal-viewer.md)。保留M4独立controller/runtime，不再导出历史AlchemionEditor或引擎对象。

`Viewer`提供异步`load/setOptions/execute/undo/redo/recompute`，同步`getSnapshot/getState/getCamera/setCamera/rotate/zoom/center/subscribe/cancel/clear/dispose`。execute接受单命令或数组，一批对应一个源事务。相机姿态为本库有限数值（位置、target、up、度制FOV、near/far）；zoom正因子乘相机距离。首次load默认适配结构，有显式相机时保留其姿态，编辑保留相机。

`ViewerOptions`覆盖renderMode、元素样式、atomScale、球/键/缺失显示半径、晶格/倒易/BZ开关、showSymmetryMates、neighborCells、cutoff、inferBonds、interactionMode及showPerformance。默认空间填充、展开对称、仅中心晶胞、无cutoff、推断成键、交互none；辅助和性能显示关闭。元素样式输入#RRGGBB及Å半径。historyLimit/mode/timeoutMs只在创建时配置。

`ViewerState`包含empty/computing/ready/error/cancelled/disposed、documentId/revision、canUndo/canRedo、options、diagnostics及可选selection/measurement；快照及状态均不可变。subscribe立即返回当前state事件，返回幂等退订函数。

M6的`cancel()`失效未接受的命令、计算/辅助任务、显示提交和等待者，以AbortError结束所有未完成调用，保留已经接受的源、documentId/revision与历史。失效画面及交互清空，状态为cancelled；空闲、重复和销毁后取消幂等。`recompute()`按当前源与选项恢复完整帧，不创建事务或新修订；空文档拒绝EDIT_DOCUMENT_EMPTY。取消不是撤销已接受事务，context恢复也不越过显式取消状态。独立EditorController具有同一cancel契约。

事件区分state、selection、point、measurement、history和error。除state自身携带状态外，其余事件明确携带当前documentId/revision。原子selection包含完整AtomInstance；键selection包含DerivedBond及两端实例，能区分显式/推断来源。point返回Å Cartesian及周期时的fractional，surface/view-plane说明交点来源；测量含angstrom/degree单位和顺序实例，退化诊断不产生NaN。模式切换/load/clear清临时交互；结构修订保留仍有效的实例选择并清空测量。

controller.commit组合主派生与必需辅助几何，完整GPU帧后才ready；纯显示更新复用派生结果并受呈现版本/取消约束，不污染历史或重新推断成键。内部按已接受源类别解析派生选项，不创建第二命令队列。取消、clear、dispose和被取代的派生请求以AbortError结束。提交前校验失败保留原源/历史/显示；有效源接受后的计算或渲染失败保留新源并进入error，拒绝对应Promise，不能把旧帧误报ready。

倒易和BZ由同一Worker计算，在同canvas的独立Å⁻¹小视窗中显示并跟随主朝向；晶格和交互辅助图形不参与主原子/键拾取。所有Three类型、渲染快照和测试观测钩子留在内部。

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
