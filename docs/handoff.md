# 当前交接

更新时间：2026-10-29，Asia/Hong_Kong。

## 当前入口

- M4代码与Windows本地关卡已完成，Ubuntu定向CI和PR归档待执行。入口master@560e41e，分支codex/m4-formats-runtime；详细进度见[M4计划](plans/m4-formats-runtime.md)。
- 正式formats一次替换为CIF1/2文档及晶体、MOL两版、周期POSCAR；core提供createDocumentStore，viewer提供createComputationRuntime/createEditorController。契约见[架构](architecture.md)和[ADR0004](decisions/0004-formats-runtime.md)。
- 新运行时显式创建、独占一个Worker，无canvas；历史Babylon viewer/demo暂用自产旧模型样例，Three正式viewer留M5，不建新旧适配层。

## 本地完成证据

- [M4证据](evidence/m4-formats-runtime.md)：首轮96单元91通过/5失败；仅六个受影响文件复验78/78（含3个审查新反例），总99个独立场景通过；4进程、无重试。
- 三浏览器运行时12/12通过，真实tarball Chromium1/1通过；SDK/demo构建、无DOM core/formats和消费类型、改动lint/格式、29份Markdown链接均已通过。
- [独立格式结果](evidence/m4-independent-reference.json)：17/17；输入/输出SHA、固定工具和补充参考限制均保留。CIF2 expected JSON编码问题与OpenBabel token内部续行问题只复验了3个受影响文件，未重跑已过项。
- 官方Unicode16与固定RDKit参考质量数的来源/散列/许可随SDK分发。历史废弃样例/旧格式/schema及setting操作数组已移除，来源台账保留处置记录；历史元素/配色仍由M5/M6处理。
- [M3科学证据](evidence/m3-scientific-core.md)、[M2证据](evidence/m2-renderer-selection.md)继续有效，本次未重复其余科学、渲染或硬件性能。

## 下一项可执行任务

先完成本分支提交、PR与Ubuntu M4定向CI，记录源码SHA/Actions并合并master。CI结束后M4才归档完成。随后M5可从控制器commit回调接Three完整帧，复用history及唯一Worker；本会话不自动开始M5。
