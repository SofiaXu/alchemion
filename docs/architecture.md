# 架构与接口边界

本文定义当前模块依赖、公开接口和资源归属。产品范围见[产品规范](product.md)，科学约定见[领域规范](domain.md)，验证标准见[质量规范](quality.md)。

## 交付与依赖方向

工程采用 pnpm workspace，一个 SDK 包和一个独立 demo。

| 位置与正式入口       | 职责及允许依赖                                                                                       |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| `packages/alchemion` | 唯一 SDK 包 `alchemion`，交付 ESM、声明文件和模块 Worker。                                           |
| `alchemion/core`     | 科学模型、诊断、晶胞/坐标、对称/邻胞、成键、倒易/BZ、测量、纯编辑事务与历史；不依赖浏览器运行时。    |
| `alchemion/formats`  | CIF1/2 文档及结构读写、MOL V2000/V3000 读写、周期 POSCAR 几何读写；只依赖 core。                     |
| `alchemion/viewer`   | 浏览器 viewer、独立编辑控制器、计算运行时、Worker、Three 后端与交互；组合 core，按需要使用 formats。 |
| `apps/demo`          | 通过三个公开子路径消费 SDK，拥有文件选择/下载、界面、状态与诊断展示。                                |

依赖方向为 `demo → viewer → core` 和 `demo/viewer → formats → core`。core/formats 不导入 DOM、渲染引擎、Worker 或构建器专用模块。导入任何公开子路径不自动创建 Worker、canvas 或全局处理器；Node.js 是开发工具，不是承诺的 SDK 运行环境。

SDK 以显式 `exports` 开放三个子路径，不提供根入口、CJS、内部深层导入、旧 API 适配或另一套正式实现。demo 和真实消费者不使用源码 alias。引擎对象、渲染快照和测试观测钩子留在内部，不泄漏到公开声明。

正式 viewer 只维护 Three 后端。选型使用同硬件、同万级场景、同画质的 Three/Babylon 对照；两者满足门槛时按既定交互指标和消费者 gzip 体积规则选择 Three。可重现的比较源码保存在 Git 提交 `07527f8`，不作为当前构建入口或双后端插件框架。

## 科学模型与格式接口

`StructureSnapshot` 是 `kind: 'periodic' | 'molecular'` 判别联合。周期原子使用 `fractional`，非周期原子使用 Å 制 `cartesian`；晶胞的列向量 `basis` 是唯一几何权威。原子、键、对称操作使用稳定非空字符串 ID。`createStructureSnapshot` 复制并冻结输入，`validateStructure` 返回诊断，计算不修改调用者快照。

可失败科学操作返回 `ScientificResult<T>`：成功分支含 `value` 和诊断，失败分支仅含诊断。科学未知量显式区分 `unknown`、`not-applicable`；已知值保存数值及可选不确定度、字面值、来源。未提供占位默认 1 并附来源，显式未知不变为满占位。

[core 入口](../packages/alchemion/src/core/index.ts)公开晶胞/坐标函数、对称解析与解析端点、实例派生/回源、成键与完整派生、距离/角度/二面角、倒易和第一 BZ，以及 `createDocumentStore`。实例携带源 AtomId、操作 ID、整数晶胞偏移、实际位置及等价来源；显示键引用实例并保留规范周期端点和显式/推断来源。BZ 返回科学顶点、外向面、三角化、体积和完备性证书，renderer 不重新计算科学几何。

[formats 入口](../packages/alchemion/src/formats/index.ts)公开 `parseCifDocument/writeCifDocument/parseStructure/writeStructure` 及相应类型。CIF AST 保存全部 block、save frame、item/loop 和值类型，不进入 core。结构解析要求显式格式，多 block CIF 使用名称或从 0 开始的索引选择。

格式专属 `metadata.alchemionFormats` 保存版本化的未映射科学信息清单和来源测量锚点；编辑不能默默消除损失凭据。CIF 坐标/晶胞锚点仍匹配时才可复用来源测量字面值，不伪造缺失分量或转换后的不确定度。科学损失默认阻止输出；`allowLoss:true` 是当前调用的布尔接受开关，硬性格式前提仍须满足。损失确认与源修订、导出选项的绑定由宿主负责，SDK 不保存确认凭据。

周期 MOL 导出显式指定 `finite`：源 `atomIds` 或显示实例 `endpoints`。`WriteResult.atomMapping` 返回文件原子编号、导出原子 ID 与源端点的对应；不同影像单独编号，边界截断键也纳入损失。版本、字段和数目限制由[产品规范](product.md)定义，立体标志、同位素和不确定度规则由[领域规范](domain.md)定义。

## 编辑、历史与独立计算

`createDocumentStore({ historyLimit? })` 提供同步 `load/execute/undo/redo/clear/getState`。`getState` 返回含源快照、documentId、revision 和 canUndo/canRedo 的状态；`load/execute/undo/redo` 返回 `ScientificResult<DocumentChange>`，`clear` 直接返回 `DocumentChange`。`execute` 接受单命令或数组，涵盖原子增删、元素/坐标、实例位置、晶胞和对称修改。新原子 ID 由调用者提供，同一文档中不得重用已发出的 ID；实例命令携带原 documentId/revision，旧实例被拒绝。

一次批量命令是一个原子事务，失败不部分提交，失败/空操作不入历史。历史默认 100 个事务，可配置；undo/redo 恢复稳定 ID，但 revision 递增。新编辑截断 redo；新 load 更换 documentId 并清空历史、选择和测量。相机、显示选项和测量不写入结构历史。

`createComputationRuntime({ mode?, timeoutMs? })` 显式创建计算运行时，提供 `compute/invalidate/dispose`；默认 worker 模式和 30 秒超时，sync 模式使用同一 core 任务分派。首次计算才创建自有执行器；worker 模式下每个 runtime 独占一个模块 Worker，sync 模式不创建 Worker，不建设共享可变结构或嵌套 Worker 池。任务包括 derive、reciprocal、brillouin-zone、coordination，响应携带 requestId/documentId/revision/category、结果和诊断。

`createEditorController({ historyLimit?, mode?, timeoutMs?, derivation?, commit? })` 组合唯一 store 和 runtime，提供异步 `load/execute/undo/redo/recompute/compute`、同步 `cancel/clear/dispose/subscribe/getState`。辅助 `compute` 仅接受倒易/BZ 任务，与主派生共享 Worker，不改变主状态或历史。默认 `commit` 立即完成；宿主可传入接收派生结果、请求上下文和 AbortSignal 的回调，回调完成后才发布 ready。接口声明见[运行时类型](../packages/alchemion/src/viewer/runtime/types.ts)。

源事务按顺序接受，不等待昂贵派生结束；同类派生采用 latest-wins。源快照、历史和 revision 只由控制器拥有，Worker 仅持有某次请求的输入和中间结果。renderer 仅拥有显示资源，不建立第二套历史或命令队列。

## Viewer 与完整帧提交

`createViewer(container: HTMLElement, options?: ViewerCreateOptions): Viewer` 创建并拥有容器内的 canvas、标签、后端和控制器。完整声明见[viewer 类型](../packages/alchemion/src/viewer/types.ts)。

| 接口                                          | 行为                                                                                                                        |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `load/setOptions/execute/undo/redo/recompute` | 返回 Promise，在对应完整帧提交后完成。execute 的一批命令对应一个源事务。                                                    |
| `getSnapshot/getState`                        | 返回不可变快照/状态；状态为 empty/computing/ready/error/cancelled/disposed，含身份、历史可用性、选项、诊断及可选选择/测量。 |
| `getCamera/setCamera/rotate/zoom/center`      | 相机使用本库有限数值类型；公开角度为度，zoom 正因子乘相机距离。首次 load 默认适配，显式相机与编辑保留其姿态。               |
| `subscribe`                                   | 立即交付当前 state，随后发布 state/selection/point/measurement/history/error；返回幂等退订函数。                            |
| `cancel/recompute`                            | 取消未完成工作并保留已接受源和历史；按同一源/选项重算，不创建事务或新修订。                                                 |
| `clear/dispose`                               | 清空当前文档或释放 viewer 全部自有资源；dispose 幂等。                                                                      |

显示默认空间填充、atomScale 1、球半径 0.45Å、键半径 0.12Å、缺失显示半径 1.5Å、展开对称、仅中心晶胞、无 cutoff、推断成键、交互 none，晶格/倒易/BZ 和性能显示关闭。`historyLimit/mode/timeoutMs` 只在创建时配置。元素样式接受 sRGB `#RRGGBB` 与 Å 半径，颜色在门面只转换一次为 linear RGB。默认配色是项目自产视觉选择，显示尺寸和成键共价半径分离。

selection 返回完整原子实例，或派生键和两个端点实例，能区分显式/推断来源。point 返回 Å 笛卡尔坐标，周期结构另含分数坐标，并以 surface/view-plane 区分表面交点和经过相机 target 的视平面交点。测量使用顺序选中的实例中心，含 angstrom/degree 单位，退化情况诊断而不产生 NaN。除 state 自带完整状态外，其余事件明确携带 documentId/revision。

load、clear 和模式切换清理临时交互；结构修订保留仍有效的实例选择并清空测量。倒易/BZ 由同一 Worker 计算，按文档/修订缓存，在同 canvas 的独立 Å⁻¹ 小视窗中显示并跟随主朝向；晶格、倒易/BZ 和交互辅助图形不参与原子/键拾取。

controller 的 commit 组合主派生、必要辅助几何、资源准备、原子切换和 GPU 完成边界，完整帧后才 ready。配色、尺寸、相机、交互模式和性能显示复用科学派生；纯显示更新仍受呈现版本和取消约束，不重新推断成键或写入历史。不能把旧画面短暂报告成新修订 ready。

源选择集合与活动拾取分开：`selectedSourceAtomIds` 属于 viewer，本库派生全部可见同源高亮；活动实例仍保留完整来源。配位通过现有 Worker 调用纯 core，并按文档、结构、规则和中心集合失效；核心返回凸包数据，后端只装配图形。超胞则是唯一核心构建器生成的新 P1 源，文档命令分配历史内不重用 ID，一次提交进入原有历史。

PNG 使用同一 Three renderer/scene 的临时 RGBA 目标，屏幕与导出共享标签投影；编码画布、GPU 目标和取消监听均有明确清理。可移植视图只含相机和选项，由 `validateViewState` 统一校验。JSON、命名槽、持久化降级和文件读取代次属于 demo，不向 SDK 引入全局浏览器存储。

## 异步失效与错误恢复

每个请求和响应携带 requestId、documentId、单调 revision 和消息种类。控制器只提交同时匹配当前文档/修订且仍有效的响应；load 切换文档身份，即使新旧 revision 数值相同也不会混淆。计算选项变化失效同类旧请求，不改变源历史。

主动 cancel 失效未接受的命令、计算/辅助任务、待提交帧和等待者，全部未完成调用以 `AbortError` 结束；已接受源、稳定 ID、documentId/revision 和历史保留，清除失效显示与交互，进入 cancelled。空闲、重复和销毁后取消幂等；recompute 恢复同一源，空文档拒绝 `EDIT_DOCUMENT_EMPTY`。取消后的上下文恢复不越过显式取消状态。

clear/dispose 和被取代请求同样立即终结等待者。同步算法本身不能被抢占，正确性依靠请求失效检查；迟到结果不能提交。默认 30 秒 deadline、Worker 错误、messageerror、计算/提交异常均须结束对应 Promise，不能永久 computing。故障后下一明确请求可重建执行器，不自动无限重试。

解析或源校验在提交前失败时保留原文档、历史和画面。有效源接受后派生/渲染失败时保留新源，进入可恢复 error 并拒绝对应 Promise，不暗中回滚。WebGL2 不可用须明确诊断；上下文丢失保留有效源并进入 error，恢复时重建当前有效修订，失败时允许宿主销毁重建。

## 资源所有权

| 资源                                                   | 所有者与释放规则                                                                                   |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| 宿主容器                                               | 调用者拥有；SDK 不删除容器，自建 DOM 在 dispose 时移除。                                           |
| renderer、context、mesh、几何、材质、实例缓冲/拾取映射 | Three 后端拥有；clear 释放结构资源，可保留有界基础几何缓存；dispose 释放 renderer 和自有 context。 |
| RAF、分帧队列、指针/键盘监听、尺寸观察器               | viewer 拥有；观察容器尺寸，clear 取消结构任务，dispose 全部取消/移除。                             |
| Worker、消息监听、待决 Promise                         | runtime 拥有；请求结束删除对应记录，dispose 终止 Worker 并结束待决调用。                           |
| 订阅、选择、测量辅助图形                               | 控制器/交互层拥有；clear 重置，dispose 发出一次 disposed 后清理，退订幂等。                        |
| 文件控件、下载对象 URL、页面订阅                       | demo 拥有，页面卸载时自行释放。                                                                    |

后端使用共享 BufferGeometry、InstancedMesh、动态缓冲和局部 update ranges；instanceId 只查本库身份映射。允许有界基础资源与结构资源不同生命周期，但必须解释归属，不能靠常数扣减掩盖泄漏。多个 viewer 的源、相机、选择、Worker 和清理互不影响。销毁后的状态读取与退订安全，新的修改操作返回明确 disposed 错误。
