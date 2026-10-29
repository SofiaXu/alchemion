# M6：双语工作台与最终分发验收

日期：2026-10-30，Asia/Hong_Kong。状态：完成。源码基线master@5f1262d，分支codex/m6-demo-distribution。M1–M5完整证据继续有效，本轮不默认重跑未修改的算法或格式套件。

SDK实现提交`5b5a7fa11bef348e1d85001c84caee5bc5dba360`、demo收尾提交`af1072c29d779ff62e604fa17ea37c14b6c3da4d`，见[PR#9](https://github.com/SofiaXu/alchemion/pull/9)。最终包SHA256为`f221e5fa5b30737b18ef907746815520b105f4caad16a82ead3a3099f6a87bbc`，三浏览器与硬件采样输入一致。demo实际[资产字节与散列](m6-demo-artifacts.json)来自最终成功场景构建，包含离线许可和manifest。

## 实际交付

- 独立中英工作台使用三个正式子路径，无源alias。支持离线自产样例、本地CIF/MOL、CIF block/版本/诊断，全部显示和三种测量、源/实例回源编辑、晶胞事务及undo/redo、格式预检/损失接受、下载和CIF/MOL重导入。源原子表50行分页。
- Viewer新增cancel/recompute，Controller新增cancel，状态增加cancelled；保留已接受源、历史、documentId/revision，终结未接受队列与待完成任务，不保留失效交互帧。重算不新增事务。契约见[ADR0005](../decisions/0005-formal-viewer.md)。
- 默认browser/package/bench指向M6。分发验证使用仓库外真实tarball、声明检查、纯静态嵌套URL、双viewer和20轮释放。来源生成器验证科学表及许可散列，SDK和demo各带必要manifest/署名。
- 移除M2临时比较原型、默认Vite图标/M1占位modal和无消费者的Bootstrap/Popper/Sass；历史科学参考、测试资产和证据保留。M2比较可在07527f8重现。

## 验证策略与本地结果

本地[结构化摘要](m6-validation-summary.json)与[原始输出无损gzip清单](m6/manifest.json)保留首次失败、来源诊断和定向复验，带原始/压缩散列；[最终分子截图](m6/screenshots/chromium-molecular-final.png)及[周期辅助截图](m6/screenshots/chromium-periodic-helpers.png)从已运行附件提取，没有为截图复跑。

工具为Node24.22.1、pnpm9.7.0；工作目录D:\source\alchemion，使用.tools/pnpm.cmd。普通场景并行上限4、无自动重试，单场景不人为复制；GPU基准独占串行。新增验证分别证明新增取消契约、demo编排、实际安装/资源URL及最终性能，不以自家读写往返代替M3/M4独立参考。

| 检查               | 实际结果及范围                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| controller定向文件 | 首轮12/12，退出0；原状态机直接受enqueue/cancel修改影响，新增3项取消/队列/重算测试。                                       |
| SDK取消完整帧      | @m6-runtime三浏览器3/3，退出0；实际3场景、上限4进程。覆盖Worker/BZ/GPU fence/display waiter、晚到隔离、保源历史与多实例。 |
| M6生产demo         | 首轮9/12；诊断后仅失败分子三浏览器3/3通过，12个独立场景均取得成功证据。                                                   |
| 真实tarball        | 首轮业务2/3；外部RAF轮询归属核实并改变就绪等待方式后，仅Firefox1/1通过。三个浏览器均验证22个Worker和20轮自有资源归零。    |
| 开发模式           | Chromium1/1首次通过，真实Worker、表单编辑与MOL导出。                                                                      |
| 工程               | 冻结安装、SDK/demo构建、根tsc、改动lint/只读格式均退出0；最终集成32份Markdown链接通过。                                   |
| 最终硬件六轮       | 6/6通过，退出0；120轮大结构自有资源归零，源/包散列最终复核一致。                                                          |
| Ubuntu             | 精确5b5a7fa首轮定向全部成功，见下方CI摘要。                                                                               |

首次失败与定向处理：

1. 分子测角缺少第三个选点。单次投影诊断证明N中心[0,3,0]实际命中N–S键；不是计算oracle错误。保留原科学坐标和预期，demo初始改为三分量斜视并保留自动fit；只复验失败3项，原过9项未重复。
2. package首次辅助编译在浏览器前失败：pnpm将嵌套fixture cwd归到消费者根，改为绝对tsc输入和Vite根。实际首次浏览器只有Firefox导入前rafs=1；逐条栈证明来自Playwright waitForFunction默认帧轮询，SDK未创建Worker/canvas。改为50ms轮询，严格原断言保持，没有常数扣减。诊断栈只在显式测试模式采集，不进入性能时钟。
3. 视觉审查发现只有POSCAR硬错误时仍显示可接受损失，UI收紧为全部阻断诊断都是科学loss才允许接受；该纯DOM分支仅复验现有分子Chromium场景，1/1通过，不新建套件或重复其他浏览器。
4. 格式化命令误带.gitignore而退出1；其余文件已格式化，最终只读检查排除此无解析器文件。新增测试首次tsc缺注入函数this类型，补类型后通过。这两项不记为业务测试通过。
5. 收尾静态审查发现MOL有限快照的首个loss早退会隐藏后续原子标签等损失。af1072c只修改demo预检与现有晶体断言；诊断dry-run的允许损失文本立即丢弃，仅合并完整诊断。下载文本仍须由用户为当前修订/选项一次明确接受后重新生成；新暴露硬错误禁覆盖。SDK/格式和基准包字节未变。Windows仅晶体场景三浏览器3/3定向通过；af1072c的Ubuntu应用12/12、开发1/1通过，SDK/M5/消费者按diff复用已有证据，见专项CI摘要。

## 正式包硬件六轮

[结构化性能摘要](m6-performance-summary.json)、[完整原始JSON无损gzip清单](m6-performance/manifest.json)保留六轮全部字段、原始与压缩SHA256。命令退出0，输入源散列在采样结束后重新计算一致（范围为SDK源码、M5性能宿主、采集器及锁文件；demo收尾未改变这些输入）；SDK tarball与三个浏览器消费者均为同一f221e5fa…f6a87bbc。采样约35分钟，未重复任何轮次。

环境：Intel(R) Core(TM) Ultra X7 358H、Windows win32 10.0.26300、Chromium 153.0.8010.12、Arc B390驱动32.0.101.8356，实际ANGLE/D3D11硬件renderer；1920×1080、DPR1，GPU独占串行。初始电源记录为平衡/100%电量，完整原始值在摘要。固定10k合法分子源/10k显示实例与20k源键，identity-only；保留M2位置和拓扑，不描述为500源的真实扩胞。实际周期/对称展开由功能场景验证。

| 模式/轮次         | 首帧ms | median FPS | 拾取p95 ms | renderer更新p95 ms | 编辑端到端p95 ms |
| ----------------- | ------ | ---------- | ---------- | ------------------ | ---------------- |
| space-filling-r1  | 40.40  | 59.88      | 7.36       | 18.60              | 1640.70          |
| ball-and-stick-r1 | 93.60  | 59.88      | 7.54       | 26.30              | 1677.60          |
| space-filling-r2  | 41.00  | 59.88      | 7.23       | 18.10              | 1658.50          |
| ball-and-stick-r2 | 91.40  | 59.88      | 7.74       | 25.80              | 1734.80          |
| space-filling-r3  | 34.20  | 59.88      | 7.06       | 18.20              | 1667.10          |
| ball-and-stick-r3 | 91.40  | 59.88      | 7.98       | 25.60              | 1734.90          |

最差完整源快照构造/载入/计算/显示为3999.90ms；不含文件或网络I/O。编辑端到端p95最差1734.90ms，未以renderer预算替代。六轮各200次正确ID拾取、100次100原子更新、GPU像素更新探针和20轮大结构释放均通过；JS heap只记录趋势，不宣称精确归零。

体积均为实际文件逐项统计（bytes/逐文件gzip合计）：SDK dist含声明1329543/153603；独立验收消费者raw 2312432/306894、minified 1425893/227261。minified Three分项522254/129501，Worker 411628/35813。消费者包含测试宿主，不能混称SDK自身大小。最终demo六文件1544712/273983；[实际静态清单](m6-demo-artifacts.json)与[本地交付包散列](m6-delivery-artifacts.json)分别记录，产物位于忽略目录.tmp/m6-delivery。

## 最终需求对照

最终应用修复af1072c在[专项Ubuntu run40925089027](https://github.com/SofiaXu/alchemion/actions/runs/40925089027)通过demo12/12和dev1/1；[专项步骤与日志](m6-ci-export-preflight.json)证明未重跑Controller/M5/消费者。Windows只追加现有晶体三浏览器3/3。SDK、Worker与科学实现不变，其原始验收如下。

Ubuntu在SDK实现提交`5b5a7fa11bef348e1d85001c84caee5bc5dba360`、demo收尾提交`af1072c29d779ff62e604fa17ea37c14b6c3da4d`首轮全部success，见[run40919970124](https://github.com/SofiaXu/alchemion/actions/runs/40919970124)和[步骤/实际日志摘要](m6-ci-summary.json)：controller12/12、取消三浏览器3/3、生产demo12/12、开发Chromium1/1、真实tarball三浏览器3/3；冻结安装、SDK/demo、无DOM与根类型、改动检查和32文档链接通过。默认4进程、无重试。软件GPU仅用于功能，不充当硬件性能。原始CI附件ID/ZIP散列与保留期写入摘要；摘要保留相关原日志行，省略无关runner安装输出。

| 需求         | 场景                   | 实现与证据                                                                            |
| ------------ | ---------------------- | ------------------------------------------------------------------------------------- |
| R-001        | T-PKG-01、T-VIEW-03    | 三公开入口/独立消费者；M5接口隔离及本轮tarball双实例。                                |
| R-002、R-003 | T-FMT-01/04            | [M4格式与独立参考](m4-formats-runtime.md)，本轮CIF1/2、block与诊断UI集成。            |
| R-004、R-005 | T-FMT-02/04            | M4独立CTfile参考；本轮MOL版本、有限快照、下载重导入。                                 |
| R-006        | T-FMT-03/04            | M4独立POSCAR参考；本轮周期/占位硬错误及损失UI。                                       |
| R-007        | T-DOM-01               | [M3科学参考](m3-scientific-reference.md)，本轮晶胞表单与事务集成。                    |
| R-008、R-009 | T-DOM-02/03            | [M3科学核心](m3-scientific-core.md)及[M5正式viewer](m5-viewer.md)；本轮显示控件集成。 |
| R-010、R-011 | T-VIEW-01              | M5数值/像素/相机证据；本轮模式、配色、晶格与相机操作。                                |
| R-012、R-013 | T-DOM-05、T-VIEW-01    | M3解析/独立BZ参考、M5展示；本轮倒易/BZ界面及取消辅助任务。                            |
| R-014、R-015 | T-DOM-06、T-VIEW-01    | M3身份与M5拾取数值；本轮真实点选、源映射/表面点。                                     |
| R-016        | T-DOM-04、T-VIEW-01    | M3解析测量/M5交互；本轮3Å、90°、有符号90°真实点击。                                   |
| R-017、R-018 | T-EDIT-01              | M4事务与历史/M5实例回源；本轮批量表单一次事务、增删/晶胞/undo/redo。                  |
| R-019        | T-RUN-01、T-VIEW-02/03 | M4协议/M5生命周期；本轮主动取消、重算与tarball20轮严格释放。                          |
| R-020        | T-DEMO-01              | 本轮完整双语工作台、离线/错误/无WebGL2路径。                                          |
| R-021        | T-PERF-01              | 本轮最终正式包六轮全部通过，见性能摘要与无损原始清单；不以M5旧成绩代替。              |
| R-022        | T-DATA-01              | [来源台账](../data-sources.md)D-001–016；本轮全部manifest/许可与demo离线资产复核。    |
| R-023        | T-PKG-01               | 本轮真实tarball白名单、声明、公开入口、静态嵌套Worker。                               |
| R-024        | T-DOC-01               | 本轮计划、README、规范/ADR、来源及交接更新；最终32份Markdown链接及格式检查均退出0。   |

## 限制与后续

M6全部必要关卡已取得证据。Playwright WebKit不等于真实Safari；软件功能结果不代表硬件性能。M5发现的大源端到端编辑耗时未在本轮擅自优化，仍须与renderer时段分别报告。没有发布npm或外部站点。
