# ADR 0004：格式损失、编辑历史和计算运行时

日期：2026-10-29，Asia/Hong_Kong。状态：Accepted（接口决策；验收结果以M4证据为准）。

## 背景与决定

M3科学模型已经合并；M4一次替换正式格式接口，并提供可独立消费的编辑和浏览器计算能力。旧Babylon viewer仍由M5迁移，不能因其存在保留第二套正式格式实现或增加新旧模型适配。

- `alchemion/formats`只依赖core。文本解析返回结构与诊断，文档API单独保留CIF AST；存在error时没有半成品。输出损失默认阻止，只有该次`allowLoss:true`允许输出并保留逐项warning，数量上限/无晶胞/非法占位等硬错误不可降级。
- `metadata.alchemionFormats`保存带版本的未映射科学信息清单。CIF来源测量记录保存原坐标系、数值、不确定度和坐标/晶胞锚点；只有锚点仍匹配时可复用字面值。缺失不确定度不能补0，转换不能伪造协方差。AST不进入core，编辑不能默默消除损失凭据。
- MOL有限导出由`WriteOptions.finite`显式选择源ID或实例endpoint，复用core坐标/来源数学；返回文件原子编号到稳定来源的映射。不同影像分别编号；边界截断键也是损失。V2000读取mass difference采用固定RDKit参考质量数，输出绝对质量数`M ISO`，不以平均原子量四舍五入。
- 最小立体模型为原子`stereoParity`及其稳定邻原子顺序，以及分子`stereoAbsolute`标志；不据此声称完整R/S或E/Z推理。输出记录重排需要相应调整parity，删除参照邻原子需要清除并诊断；undo恢复原始参照。
- core的`createDocumentStore`唯一拥有源快照、文档身份、修订和历史。一次批量操作一个事务，失败/空操作不入历史；默认100事务；undo/redo增加修订，load换文档并清历史。新原子不能重用该文档曾发出的ID。
- viewer的`createComputationRuntime`显式创建，默认独占一个module Worker；sync与worker使用同一任务分派，不复制科学算法。请求/响应携带requestId/documentId/revision/category；同类派生latest-wins，超时默认30秒。取消/取代/clear/dispose必须立即终结Promise，静默Worker退出通过超时有界终结；故障后下一明确请求可重建，不自动无限重试。
- `createEditorController`组合store与runtime，统一管理empty/computing/ready/error/disposed。源事务队列不等待昂贵派生，否则快速load/连续编辑会被旧计算阻塞。有效源提交后派生或交付失败保留新源并置error；提交前校验失败保留旧文档。
- controller的异步`commit`回调是M5完整渲染帧的提交边界；辅助倒易/BZ任务共享相同runtime，不新增第二个Worker。M4默认交付回调立即完成，并以可控回调验证失败和迟完成；M5不另建状态机。

## 后果与验证

三个正式子路径保持不变，不保留旧格式类。历史demo/工程宿主使用自产旧模型输入，明确不是新科学或M4 viewer验收。

阶段执行与实际结果归[M4计划](../plans/m4-formats-runtime.md)；产品字段/损失边界归[产品规范](../product.md)，数学和编辑语义归[领域规范](../domain.md)。首次验证只运行M4与直接受影响的模型校验，后续修复仅复验受影响场景。独立格式工具和测试故障注入不进入SDK运行依赖或正式API。
