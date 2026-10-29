# 当前交接

更新时间：2026-10-30，Asia/Hong_Kong。

## 当前入口

- **M6实施中，工作分支codex/m6-demo-distribution。** 接管[M6计划](plans/m6-demo-distribution.md)和[M6报告](evidence/m6-demo-distribution.md)。双语demo、取消/重算、最终tarball和CI入口已实现；本地controller12/12、取消三浏览器3/3、demo12独立场景、消费者三浏览器及开发Chromium均有通过证据。首次失败与最小复验见[摘要](evidence/m6-validation-summary.json)和报告；最终硬件六轮、Ubuntu和主分支合并尚未完成，不能标M6完成。

- **M5正式Three viewer已完成全部验收。** 实现提交1287018、CI启动修复623534a；归档与主分支合并见[PR #8](https://github.com/SofiaXu/alchemion/pull/8)和Git HEAD。接管入口为[M5计划](plans/m5-viewer.md)与[M5报告](evidence/m5-viewer.md)。
- `createViewer`组合M4唯一源/历史/单模块Worker；两模式、晶格、倒易/BZ独立视窗、真实拾取/点坐标/三种测量、编辑历史、取消和context恢复均已验证。正式契约见[ADR0005](decisions/0005-formal-viewer.md)。
- SDK仅Three0.186.1，历史Babylon viewer/Worker/旧模型及无来源配色已移除。范德华来源、缺失策略及MIT许可随包记录；demo仅最小迁新API并验证启动，完整流程留M6。

## 完成证据

- Windows5文件35单元首轮全部通过，4进程、无重试；三浏览器首轮15通过/9失败，只复验失败9项后全部通过，共24独立场景。[浏览器摘要](evidence/m5-browser-summary.json)、[监听原始归属](evidence/m5-listener-ownership.json)、[现成截图](evidence/m5/screenshots.json)。各浏览器20轮自有资源严格归零。
- 14条初次剩余监听逐条确认为Playwright/AdGuard外部注册，未按常数减计数。后端错误代码及纯视觉失败假ready反例已修复验证；复验JSON被package覆盖的归档限制明确披露，未为补报告重复场景，现报告分名。
- SDK/demo、无DOM及根类型、改动lint/格式、真实tarball Chromium1/1、demo dev真实Worker启动均通过。
- [Ubuntu CI](https://github.com/SofiaXu/alchemion/actions/runs/40908739503)在精确623534ac上35单元、三浏览器24/24、tarball1/1及工程/31文档检查全部success；[CI摘要](evidence/m5-ci-summary.json)保留首轮辅助脚本失败（业务未运行）及修复理由。
- [正式包硬件六轮](evidence/m5-performance-summary.json)全部达标：10k原子/20k键，最差首帧91.9ms、median FPS59.88、拾取p95 10.24ms、renderer更新p95 32.4ms；120轮大结构销毁自有资源归零，GPU像素更新探针通过。原始数据[无损gzip清单](evidence/m5-performance/manifest.json)保留完整字段及原始/压缩散列，源散列最终复核一致。硬件仅声明实测Arc B390/Chromium，不泛称所有GPU性能通过。

## 限制与后续

- M5无未解决必需关卡。10k端到端编辑p95最差4.275秒，后五轮约1.65–1.74秒，不能用renderer预算替代。静态发现整源复制/重复校验及O(E\*N)线性端点解析；尚未profile，后续可先建立请求局部AtomId索引再验证科学等价，不在本轮擅自改变源码或预算。
- Windows复验原始JSON附件缺失已披露；Linux完整日志、原始监听记录与Windows成功截图均已归档。Playwright WebKit不等于真实Safari设备验证。
- 本机固定工具入口.tools/pnpm.cmd；默认SSH签名为1Password op-ssh-sign，首次commit因其交互挂起，本次仅对单命令关闭签名，未改全局配置。

## 下一项可执行任务

接续M6：审查并提交当前实现，用最终真实包运行两模式各三轮硬件bench；推送并创建PR，取得精确候选head的Ubuntu定向CI；归档原始/摘要、更新完成状态后合并master。用户已授权本轮提交/推送/合并，不含npm/站点发布。源码冻结后不要为归档重复已通过的Windows业务测试。
