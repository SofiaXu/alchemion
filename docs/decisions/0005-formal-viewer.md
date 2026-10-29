# ADR 0005：正式 Three viewer 与显示提交边界

日期：2026-10-29。状态：Accepted（接口与语义决定；实际验收见[M5计划](../plans/m5-viewer.md)）。

## 背景与决定

M2已选择Three0.186.1，M3/M4已有权威科学模型、事务与单Worker控制器。M5将这些能力组合为唯一正式viewer，删除历史Babylon实现及兼容入口，不把比较原型作为第二套运行时。

- `createViewer(container, options?)`拥有自建canvas、覆盖标签、后端及controller。公开接口见[viewer类型](../../packages/alchemion/src/viewer/types.ts)，不返回Three对象；独立controller/runtime仍可无canvas使用。
- controller仍独占源、历史、命令顺序及计算失效。内部组合入口允许按已接受源解析派生选项，避免从晶体切到分子时沿用无效周期配置；不改变独立M4公开接口。
- controller.commit的Promise包含必需辅助计算、资源准备、原子切换及GPU完成边界。呈现版本和AbortSignal约束纯显示更新；旧提交不得在清空、销毁或新修订后继续生效。纯显示失败也不得短暂发ready。
- 配色、尺寸、相机、交互模式和性能显示不触发原子派生。倒易/BZ按当前documentId/revision缓存，通过controller.compute共享Worker；有限倒易点调用同一core转换。

## 已批准的展示语义

- 空间填充默认使用mendeleev-data1.1.0固定Alvarez/Vogt范德华半径；缺失保持缺失，显示端以带诊断的可配置1.5Å视觉值兜底。球棍默认球0.45Å、键0.12Å；所有展示尺寸与成键共价半径分离。
- 默认配色是项目独立定义的视觉选择，不继承来源未核实的旧表。颜色输入为sRGB `#RRGGBB`，在门面只转换一次为后端linear RGB。
- 对称展开由core的`applySymmetry`控制，默认true。false仅采用数值上等于恒等的操作（允许整数平移），保留真实操作ID和可逆偏移；缺失恒等操作返回诊断，不伪造来源。
- 点模式优先返回原子或键的表面命中点，空白返回经过相机target的视平面交点；事件明确surface/view-plane及Å笛卡尔坐标，晶体另给分数坐标。
- 测量用依次点击的实例中心，不使用最小影像。结构修订后保留仍可解析的实例选择、清空测量；load/clear/模式切换清理临时交互。
- 倒易与BZ在同canvas的独立小视窗中展示，单位Å⁻¹，跟随主相机朝向；它们及晶格/测量辅助图形不参与原子或键拾取。

## 资源和迁移

clear释放结构、辅助及交互资源，保留可复用后端和计算运行时；dispose进一步释放Worker、RAF、监听、观察器、renderer和自有context，移除自有DOM并幂等。上下文丢失保留有效源且进入error，恢复后重建当前修订。

demo和历史工程宿主只迁移到新公开API以保持可运行；完整demo流程留M6。性能测量使用正式tarball。M2的10k位置/20k固定拓扑转换为合法10k源分子，废除原型伪500源映射；真实邻胞/对称回源另由功能场景验证，不将该性能夹具描述成500源的真实扩胞。

## 验证影响

2026-10-30 M6补充：正式Viewer新增cancel/recompute，独立controller新增cancel，状态增加cancelled。主动取消包括未接受队列、Worker/辅助任务、完整帧与显示等待者；所有未完成调用以AbortError终结，保留已经接受的源/历史/documentId/revision，清除失效画面和交互。空闲、重复、销毁后取消幂等；重算不产生事务或修订，完整帧后ready，空文档沿用EDIT_DOCUMENT_EMPTY。取消后context恢复不自动重算。变更仅需controller定向文件与新增@m6-runtime三浏览器集成，科学算法和格式未改变。

新增半径、对称显示开关、门面及真实三维集成需要定向测试；未改变的格式、测量数学和底层Worker协议沿用先前证据。普通测试4进程、无重试；硬件基准独占串行。CI按实际变化选择集合，已通过项不因文档归档重复运行。
