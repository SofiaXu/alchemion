# 当前交接

更新时间：2026-10-30，Asia/Hong_Kong。

## 当前入口

- **M1–M6全部必要关卡已完成。** 当前为唯一浏览器TypeScript SDK与独立中英工作台，正式Three.js0.186.1。接管[M6计划](plans/m6-demo-distribution.md)和[最终报告](evidence/m6-demo-distribution.md)。实现提交5b5a7fa、完整损失预检收尾af1072c；归档与主分支合并追踪[PR#9](https://github.com/SofiaXu/alchemion/pull/9)及Git HEAD。
- demo只使用三个公开子路径，覆盖离线样例/本地文件、CIF block/版本与诊断、全部显示/测量、源及实例回源编辑、晶胞事务、undo/redo、损失预检/接受、导出和CIF/MOL重导入。中英控件/帮助/状态可切换并保存，SDK诊断保留原文。
- Viewer.cancel/recompute、Controller.cancel和cancelled状态保留已接受源与历史；未接受队列、Worker/辅助/完整帧和等待者全部失效，重算不产生事务或修订。契约见[ADR0005](decisions/0005-formal-viewer.md)。正式源/历史/Worker仍由唯一controller拥有。
- 默认browser/package/bench为M6，M4/M5显式入口按用途保留。ci:changes按实际diff含删除路由，普通场景默认4进程、无重试；check仅人工全量。M2临时原型、旧实现及无消费者Bootstrap/Popper/Sass已清理，历史证据和独立科学参考保留。

## 完成证据

- [本地验证摘要](evidence/m6-validation-summary.json)：controller12/12、取消三浏览器3/3、demo12独立场景、真实tarball三浏览器、dev Chromium1/1通过。首轮失败、相机遮挡诊断、Playwright RAF逐条归属、最小复验均在[无损原始清单](evidence/m6/manifest.json)，没有常数扣减资源计数，没有为截图复跑。
- [Ubuntu初始CI](https://github.com/SofiaXu/alchemion/actions/runs/40919970124)在精确5b5a7fa定向全部成功，见[步骤/日志](evidence/m6-ci-summary.json)；应用预检修复af1072c的[CI](https://github.com/SofiaXu/alchemion/actions/runs/40925089027)仅demo12/12与dev1/1，未重跑未修改SDK/M5/消费者，见[专项摘要](evidence/m6-ci-export-preflight.json)。
- [正式包六轮性能](evidence/m6-performance-summary.json)全部通过：10k原子/20k键、1920×1080/DPR1，最差首帧93.6ms、median FPS59.88、拾取p95 7.98ms、renderer更新p95 26.3ms；120轮大结构释放自有资源归零，GPU像素探针正确。[原始无损gzip清单](evidence/m6-performance/manifest.json)保留完整字段及原始/压缩SHA；结束后源散列一致，tarball f221e5fa…f6a87bbc与三浏览器消费者相同。
- [来源台账](data-sources.md)D-001–016与全部manifest/许可已复核；SDK包及demo静态输出均携带署名。[demo实际文件](evidence/m6-demo-artifacts.json)、[交付包散列](evidence/m6-delivery-artifacts.json)已记录。本机可审查产物在.tmp/m6-delivery，未发布npm或站点。

## 限制与下一项可执行任务

M6没有未解决的必需关卡。硬件只声明实测Arc B390/Chromium，软件CI不是硬件性能；Playwright WebKit不等于真实Safari。10k合法分子源为identity-only性能夹具，不冒称500源的真实扩胞；真实周期/对称行为由功能场景证明。

本轮未优化源编辑CPU路径，端到端p95最差1.735秒、完整源构造/载入/计算/显示最差4.000秒，与renderer时段分开记录。后续若继续开发，先对10k请求进行分段profile，核对整源复制/重复校验和端点线性查找热点，再决定请求局部AtomId索引并使用独立科学参考验证等价；不把静态发现冒称已profile。该优化及外部发布不属于本轮实施范围。

本机固定工具入口.tools/pnpm.cmd。提交签名沿既有交接仅对单命令关闭，未改变全局1Password配置。文档归档只检查格式、链接、状态/证据和散列，不重复已通过业务场景。
