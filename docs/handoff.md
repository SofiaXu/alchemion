# 当前交接

更新时间：2026-10-29，Asia/Hong_Kong。

## 当前入口

- **M4格式、编辑与计算运行时已完成。** 实现/Ubuntu CI提交`d7f14e7`，归档与主分支合并见[PR #7](https://github.com/SofiaXu/alchemion/pull/7)和Git HEAD；详细入口为[M4计划](plans/m4-formats-runtime.md)。
- 正式formats一次替换为CIF1/2文档及晶体、MOL两版、周期POSCAR；core提供createDocumentStore，viewer提供createComputationRuntime/createEditorController。契约见[架构](architecture.md)和[ADR0004](decisions/0004-formats-runtime.md)。
- 新运行时显式创建、独占一个Worker，无canvas。历史Babylon viewer/demo暂用自产旧模型输入，Three正式viewer留M5，不建新旧适配层。

## 完成证据

- [M4证据](evidence/m4-formats-runtime.md)：Windows首轮96单元91通过/5失败；仅六个受影响文件复验78/78（含3个审查新反例），共99个独立场景通过；4进程、无重试。
- 三浏览器运行时12/12、真实tarball Chromium1/1、SDK/demo构建、无DOM core/formats和消费类型、改动lint/格式及29文档链接通过。独立格式[17/17](evidence/m4-independent-reference.json)，固定工具/输入输出SHA及参考限制均保留。
- [Ubuntu CI](https://github.com/SofiaXu/alchemion/actions/runs/40858487156)首轮success：d7f14e7，10文件/99项、4进程；构建/类型/改动检查及真实tarball1/1通过，见[摘要](evidence/m4-ci-summary.json)。归档仅改文档，不重复业务测试。
- 官方Unicode16与固定RDKit参考质量数的来源/散列/许可随SDK分发。历史废弃样例/旧格式/schema及setting操作数组已移除，来源台账保留处置记录。
- [M3科学证据](evidence/m3-scientific-core.md)、[M2证据](evidence/m2-renderer-selection.md)继续有效，本次未重复其余科学、渲染或硬件性能。

## 尚待处理

- M4没有未解决关卡。OpenBabel的token内部续行限制仅影响独立spin参考传输，已按标准展开物理续行；RDKit仍验证原文件，未降低支持范围。
- 正式Three显示/选择/测量、GPU资源和10k性能仍由M5验收；完整demo/最终分发由M6完成。历史元素/配色仍按来源台账由M5/M6替换/核验。

## 下一项可执行任务

接管[M5计划](plans/m5-viewer.md)：从`createEditorController`的异步commit回调接Three完整帧，以documentId/revision/AbortSignal约束渲染提交；辅助倒易/BZ使用controller.compute共享已有Worker。复用M4的源事务/history/状态机，不建立第二套编辑或调度规则。选择与测量失效、正式三维交互和资源释放由M5连接验证；本会话不自动开始M5。
