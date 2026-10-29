# 当前交接

更新时间：2026-10-29，Asia/Hong_Kong。

## 当前入口

- **M2 渲染对照进行中**，当前分支 `codex/m2-renderer-selection`。M1 已完成并推送 master（3c54711）；M0 前置文档提交为 9742727，历史业务基准为 06784cf。
- 唯一 SDK 与独立 demo 已迁移；三个 ESM 子路径、声明和两层模块 Worker 均经真实消费者验证。真实命令见 [README](../README.md#现有工程入口)。
- Babylon 7.23.0 仅用于历史迁移；渲染 ADR 仍 [Proposed](decisions/0002-renderer-selection.md)，尚无正式选型结论。

## 已有证据

- [M2 证据](evidence/m2-renderer-selection.md)：新候选 Three 0.186.1/Babylon 9.32.1；三浏览器×两模式×两候选 12/12，4 进程无重试；实际 tarball 3/3，SDK/demo 构建和定向静态检查通过。尚未执行完整性能采样，不能接受 ADR。
- 完整 Chromium 153.0.8010.12 的 D3D11 路径已探测到真实 Intel Arc B390；默认 headless shell 仍为 SwiftShader。便携 pnpm wrapper 已固定子进程 Node24，系统 Node26/shim 不用于正式检查。

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

按 [M2 计划](plans/m2-renderer-selection.md) 冻结比较源码提交后，运行 `pnpm bench -- --renderer-selection`，取得单候选 ESM 产物和两模式各三轮正式数据；原始输出在 `.tmp/bench/m2/`。必须独占 GPU 串行采样，软件渲染不验收。定案按 ADR 收束新候选；用户确认历史 viewer/demo 留至 M5/M6，不在 M2 重写完整 viewer。完成后按授权提交、合并并推送 master。
