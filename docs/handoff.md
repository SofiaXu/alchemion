# 当前交接

更新时间：2026-10-29，Asia/Hong_Kong。

## 当前入口

- M0 文档已提交为 9742727；M1 本地工程验收已通过，正在远端 CI 与交付。分支 codex/m1-foundation。
- 历史业务代码基准 06784cf。原始冻结安装/lint/build 实际通过；CIF 19 通过、1 失败。详见 [M1 证据](evidence/m1-foundation.md)。
- 当前唯一 SDK 与独立 demo 已迁移；Babylon 仅作为历史实现，渲染 ADR 仍 [Proposed](decisions/0002-renderer-selection.md)。

## 已有证据

- [M0 报告](evidence/m0-validation.md) 保存接管文档阶段的历史证据。
- [M1 报告](evidence/m1-foundation.md) 保存原始/迁移后命令、依赖选择、Worker 分发失败及修复理由。
- [M1 执行计划](plans/m1-foundation.md) 保存实时进展和最小充分验证边界。

## 尚待处理

- M1 本地关卡已通过：20 个 CIF、三浏览器 workspace/真实 tarball、干净冻结安装/dev/check:m1、短 bench。下一步按用户授权合并并推送 master，核对 Linux CI 实际结果。
- M2：同条件比较两个引擎；尚无正式性能或选型结论。
- M3–M5：稳定身份、科学模型、完整格式/异步/编辑历史和 viewer；旧问题继续见 [基线](baseline.md)。科学表和历史样例仍待核实来源，M1 未将其标为已审核数据。

## 下一项任务

先按 [M1 计划](plans/m1-foundation.md) 续接剩余验收，检查 Git 差异和已有证据，只复测受影响场景。M1 全部必要工程关卡通过后交给 [M2 计划](plans/m2-renderer-selection.md)，不得直接开始后续业务阶段。
