# 当前交接

更新时间：2026-10-29，Asia/Hong_Kong。

## 当前入口

- **M3 科学核心已完成。** 实现/科学CI提交 `93937da`，共享契约/历史隔离提交 `80216d6`；主分支归档与合并提交见 [PR #6](https://github.com/SofiaXu/alchemion/pull/6) 和 Git HEAD。
- 正式 `alchemion/core` 一次切换到稳定 ID、周期/非周期快照、晶胞/对称/成键/测量/倒易/BZ。接口与边界见 [ADR0003](decisions/0003-scientific-core.md)、[架构](architecture.md#m3-科学接口)、[M3计划](plans/m3-scientific-core.md)。
- 旧 formats/viewer 只改为引用 `internal/legacy`，历史 Babylon7.23.0/demo 仍留至 M4/M5 迁移；不提供 core 旧 API 兼容层。正式渲染后端仍是 M2 已选定的 Three0.186.1。

## 完成证据

- [科学核心证据](evidence/m3-scientific-core.md)、[独立参考](evidence/m3-scientific-reference.md) 保存命令、环境、残差标准、输入/散列及失败修复理由。NumPy/SciPy参考只生成一次，不调用生产算法。
- Windows core 首跑7文件/57项、4进程通过；审查补1个来源反例后只复验成键文件13项通过。共58项独立场景已在对应范围运行；万原子规则网格得到解析28600键。
- 固定数据：118元素/96半径、530 Hall/230 IT/7388操作；全部setting的独立整数群闭合/逆元通过。原始散列和许可随SDK打包；未使用的旧键价表已删除。
- SDK/demo构建、源码无DOM边界、消费者类型、改动lint已通过。Chromium真实tarball场景1/1通过：声明、无DOM core声明、生产构建、嵌套Worker、拾取及销毁。来源回归后只重建受影响SDK，最终版本由Ubuntu消费者核对。
- [M2证据](evidence/m2-renderer-selection.md) 和 [ADR0002](decisions/0002-renderer-selection.md) 继续有效；本次未重复渲染对照/硬件性能或完整旧格式测试。

- [Ubuntu CI](https://github.com/SofiaXu/alchemion/actions/runs/40851532341)：93937da，attempt1，success；7文件/58科学测试（4进程）、构建/类型/lint/格式/链接、最终真实tarball 1/1。详细版本/耗时见 [CI摘要](evidence/m3-ci-summary.json)。后续文档归档不重复科学/浏览器测试。

## 尚待处理

- M3没有未解决的科学或工程关卡；完整产品的后续阶段仍未实施。
- M4：新版CIF/MOL/POSCAR、编辑事务/历史、独立计算Worker及修订/取消协议；M5：Three正式viewer与交互；M6：完整demo和分发。科学算法尚未接入历史显示，不把新core通过写成viewer验收。
- 历史内部表、配色和格式样例仍保留[来源台账](data-sources.md)的未核实状态，按M4/M5替换并在M6复核，不能以新数据来源替旧表追认。

## 下一项可执行任务

接管 [M4计划](plans/m4-formats-runtime.md)：读取正式core声明、结构校验和诊断，先建立编解码结果边界，替换历史格式模型；事务/Worker必须复用core算法。继续使用pnpm和最小充分验证；后续阶段仍须单独授权，不自动开始M4。
