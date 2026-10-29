# 当前交接

更新时间：2026-10-29，Asia/Hong_Kong。

## 当前入口

- **M5正式Three viewer实现已落地，验收进行中。** 分支`codex/m5-viewer`，起点`master@c361469`，执行入口为[M5计划](plans/m5-viewer.md)，实际记录为[M5证据](evidence/m5-viewer.md)。本阶段尚未标完成。
- 新公开`createViewer`接M4 controller唯一源/历史/单模块Worker；两模式、晶格/倒易/BZ独立视窗、真实拾取、点坐标、三种测量、编辑历史、取消和context恢复已实现。接口/语义见[ADR0005](decisions/0005-formal-viewer.md)。
- 历史Babylon viewer/Worker/旧模型及无来源配色已移除，Three0.186.1是唯一正式后端。demo仅迁新API并验证启动，完整工作流留M6。

## 已取得的证据

- Windows定向5文件35单元首轮全部通过，4进程、无重试；新增vdW/对称开关/门面和内部源类别组合有具体测试理由，没有运行完整科学/格式/传输套件。
- 三浏览器首轮15通过/9失败，失败仅定向复验9/9通过：24个独立场景均有通过证据。context恢复、各浏览器20轮自有资源归零及多实例隔离通过；[摘要](evidence/m5-browser-summary.json)、[监听归属原始记录](evidence/m5-listener-ownership.json)、[现成截图](evidence/m5/screenshots.json)。
- 14条首轮剩余监听逐条确认为Playwright/AdGuard外部注册，SDK按所有权严格归零。纯视觉失败假ready审查反例已修复并在同一待复验场景验证。
- 复验原始JSON被后续package覆盖，附件未归档；摘要如实保留已观察CLI/统计/严格断言结果，未为补报告重跑。workspace/package报告现分名。
- SDK/demo构建、core/formats无DOM与根类型、改动lint/格式、真实tarball Chromium1/1、demo dev真实Worker启动通过。31份文档links通过；数据来源/许可随包可追溯。

## 尚待完成

- `pnpm bench -- --phase=m5 --prepared`正在独占GPU运行，输出`.tmp/bench/m5`，锁`.tmp/bench/m5.lock`；固定10k/20k、两模式各三轮，当前没有完整性能通过结论。不要在采样中修改生产源码、tests/m5、bench脚本或lockfile。
- 源码拟先提交为草稿PR，使Ubuntu定向CI与Windows硬件采样并行，尽早发现平台差异，减少全部采样后改代码引起的复验。性能和CI关卡均通过才合并master。
- M3/M4先前证据继续有效。M5硬件原始数据、Ubuntu CI、最终源SHA及merge结果取得后写入报告并更新阶段完成状态。

## 下一项可执行任务

续接当前基准进程与`.tmp/bench/m5`，按固定协议收齐六轮，检查首帧/交互/点击/局部更新/20轮资源和raw/gzip；失败保留原始数据，仅有技术理由地修复/复验受影响范围。通过后归档证据、等待针对同一源码的Ubuntu CI，更新M5计划与交接，提交文档，确认PR head SHA后merge到master。本会话已获提交、推送及合并授权；完成后M6入口是完整demo和最终分发验收。
