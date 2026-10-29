# 当前交接

更新时间：2026-10-29，Asia/Hong_Kong。

## 当前入口

- **M2 渲染对照已完成**。正式新版后端为 **Three.js 0.186.1**（类型 0.186.0），见 [Accepted ADR 0002](decisions/0002-renderer-selection.md)。
- 比较实现提交为 07527f8，软件验证修复及候选收束提交为 08529de；最终文档与主分支归档提交以 Git HEAD 为准。唯一 SDK 的公开 API 未改变。
- 当前 SDK/demo 仍使用历史 Babylon 7.23.0，按用户确认留至 M5/M6 迁移；新 Babylon 9.32.1 开发依赖及原型已移除。M2 比较类型不是 M3/M4 的正式科学模型或协议。

## 完成证据

- [M2 报告](evidence/m2-renderer-selection.md) 与同名资源目录保存完整命令、版本、输入哈希、截图、逐次延迟、资源、失败修复和选择公式；[执行计划](plans/m2-renderer-selection.md) 保存进展与决策。
- Arc B390/D3D11、Chromium153、1920×1080/DPR1：两候选×两模式×三轮 12/12 达标。最差决策延迟均为52.5ms，gzip186,577/449,787 bytes，Three 小58.52%而获选。规定矩阵只运行一次，无候选性能修复或重跑。
- 原始240轮自有资源计数归零；为覆盖账本未包含的全局监听，另用CDP核对80轮逐轮恢复基线。Three 的7个引擎基础GPU句柄随自有context loss释放，正式viewer必须保留此销毁边界。
- Windows 比较功能12/12、最终获选功能6/6（4进程）、真实SDK tarball3/3；最终单候选ESM产物加载/Worker/拾取/销毁通过。公开SDK仍未声称完成M3–M5。
- [Ubuntu CI](https://github.com/SofiaXu/alchemion/actions/runs/40836102937)：08529de、attempt1、success；构建/类型/lint/链接、M2软件功能6/6、tarball3/3。初次失败及修复理由保留在报告，软件数据不验收性能。
- 四个并发软件viewer曾实际超时，因此Ubuntu软件功能降为2进程并关闭额外tracing，保留完整10k/20k和几何；硬件功能默认4，正式性能独占串行。未运行完整科学/格式套件。
- [M1证据](evidence/m1-foundation.md) 保留Windows/Linux工程基线；M0和旧业务基准分别为9742727、06784cf。

## 尚待处理

- M3–M5：稳定身份、权威晶胞数学、科学核心、完整格式/诊断、正式异步修订/取消、编辑历史和viewer。M2的测试Worker没有完成M4。
- 科学表和历史样例仍待[来源核验](data-sources.md)；本阶段只新增项目自编的确定性图形夹具。
- 性能结论限于报告中的设备、浏览器、供电和画质；M5/M6须在正式SDK集成后复验，不能直接把原型结果标为最终产品通过。

## 下一项可执行任务

接管[M3科学核心](plans/m3-scientific-core.md)：先检查Git工作区，读取领域/产品/架构/来源规范；检查现有core的structure、utils和elements入口，从稳定ID、周期/非周期最小模型及唯一晶胞数学开始，先建立独立解析参考再替换旧计算。M3尚未开始，不把M2准备好的笛卡尔坐标或mock源映射当科学真值。继续使用pnpm和最小充分验证；下一阶段的路线图不代表已授权自动实施。
