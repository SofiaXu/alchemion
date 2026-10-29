# 当前交接

更新时间：2026-10-29，Asia/Hong_Kong。

## 当前入口

- **M1 工程基线已完成**。实现提交 163da34 已快进合并并推送 master；最终文档结果以当前 Git HEAD 为准。M0 前置文档提交为 9742727，历史业务基准为 06784cf。
- 唯一 SDK 与独立 demo 已迁移；三个 ESM 子路径、声明和两层模块 Worker 均经真实消费者验证。真实命令见 [README](../README.md#现有工程入口)。
- Babylon 7.23.0 仅用于历史迁移；渲染 ADR 仍 [Proposed](decisions/0002-renderer-selection.md)，尚无正式选型结论。

## 已有证据

- [M1 证据](evidence/m1-foundation.md)：原始冻结安装/lint/build 通过；旧 CIF 失败、必要修复、Worker 分发与初始化问题均有记录。
- Windows 干净 checkout：冻结安装、无 dist 的 dev、check:m1 通过；两个 CIF 文件 20/20，workspace 三浏览器 3/3，真实 tarball 三浏览器 3/3；生产环境下消费者工具隔离另行定向复验通过。
- [Ubuntu CI](https://github.com/SofiaXu/alchemion/actions/runs/40824931331)：提交 163da34、attempt 1、success；同范围检查全部通过。
- [M1 计划](plans/m1-foundation.md) 保存完成进展；[bench 原始样本](evidence/m1-bench-smoke.json) 是 128 原子/120 帧的软件渲染采集冒烟，不是 T-PERF-01 达标证据。
- [M0 报告](evidence/m0-validation.md) 仅保存历史接管阶段事实。所有复测/扩展理由见 M1 证据；本轮没有默认运行完整业务套件。

## 尚待处理

- M2：按相同硬件、画质与固定场景对照 Three.js/Babylon.js，记录性能与资源证据，再接受引擎 ADR。
- M3–M5：稳定身份、权威晶胞数学、科学核心、完整格式/诊断、异步修订/取消、编辑历史及最终 viewer。旧问题见 [基线](baseline.md)，M1 并未宣称解决。
- 科学表与历史样例仍待 [来源核验](data-sources.md)；M1 保留署名且没有将搬迁数据改记为已审核。

## 下一项任务

下一项是 [M2 渲染对照](plans/m2-renderer-selection.md)，入口依赖已满足。按根 AGENTS、PLANS、该计划和质量规范接管，先检查 Git 工作区及已有 SDK/浏览器 harness；使用 pnpm，固定版本与环境，按最小充分验证选择相关场景。M2 尚未开始，不把 M1 的软件渲染冒烟当成正式性能预算或引擎定案证据。
