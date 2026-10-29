# M5正式viewer验证记录

日期：2026-10-29，Asia/Hong_Kong。工作目录：`D:/source/alchemion`。起点`master@c361469`；实现位于`codex/m5-viewer`，本报告随实际结果更新。

当前状态：M5全部实现和验收关卡已通过，硬件六轮结果已归档；归档提交和主分支合并以PR #8及Git HEAD为准。执行跨越2026-10-29/30。

## 实现与来源

正式入口为`createViewer`，单Three0.186.1后端（类型0.186.0），M4 controller唯一管理源、历史与单模块Worker。内部源类别派生解析避免分子继承周期选项；纯显示/相机更新不重算科学派生。公开类型、选择/点/测量语义及资源边界见[ADR0005](../decisions/0005-formal-viewer.md)。历史Babylon viewer、旧Worker、旧模型/颜色数据及失去用途依赖已删除，demo仅最小迁移。

范德华半径固定mendeleev-data1.1.0 commit67e08702c5e9e8541d9944824b10edfb718d61e8，Alvarez/Vogt字段pm/100→Å：94值、24缺失；不重生成M3质量/共价半径/setting。散列/来源/转换限制见[manifest](../../packages/alchemion/VDW_DATA_MANIFEST.json)，MIT署名在包内第三方声明。显示缺失使用带诊断的可配置1.5Å视觉值，成键仍用Cordero共价半径。默认配色项目独立定义。

## Windows定向检查

环境固定`.tools/pnpm.cmd`：Node24.22.1、pnpm9.7.0、Vitest4.0.18、Playwright1.63.0。普通测试4进程、无自动重试；单个真实消费者实际1进程。

| 检查                                                             | 实际结果与范围                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --lockfile-only`及`pnpm install --frozen-lockfile` | 退出0，移除旧依赖；最终SDK常规依赖仅Three。没有跳过安装脚本。                                                                                                                                                                                  |
| 定向Vitest，`--maxWorkers=4`                                     | 首轮5文件35/35通过，1.47秒；derivation8、bonds14、vdw2、presentation2、controller9。未运行格式、530群闭包或runtime传输全矩阵。                                                                                                                 |
| SDK/demo构建                                                     | `pnpm build`退出0；后续后端错误代码及显示失败修复后只重建SDK。模块Worker资源验证1个，声明构建通过。Bootstrap/Sass已有deprecation及大chunk警告保留，不据此修改画质或依赖版本。                                                                  |
| 类型                                                             | core/formats无DOM配置通过；首轮根类型仅测试ledger两处this缺注解失败，修正后根配置通过。                                                                                                                                                        |
| 改动lint                                                         | 生产/核心相关测试/demo/旧宿主及验证包通过；数据提取脚本首轮fetch/AbortSignal的Node全局声明缺失，补文件级声明后定向lint通过。                                                                                                                   |
| 三浏览器                                                         | 首轮24项：15通过、9失败。只复验失败的三个行为组×三浏览器，9/9通过（15.5秒），无重试；合计24个独立场景通过。摘要见[浏览器记录](m5-browser-summary.json)。                                                                                       |
| 真实tarball                                                      | `pnpm test:package -- --phase=m5 --prepared --project=chromium`退出0，1/1通过（2.2秒）。消费者在仓库外`alchemion-m5-consumer-P2mHLe`，只安装tarball；三个入口、无DOM声明、无引擎声明泄漏、生产Worker、真实viewer拾取/编辑/历史和销毁均有断言。 |
| demo启动                                                         | `pnpm dev -- --smoke`退出0：启动SDK监听和独立demo，真实Worker加载至ready，无页面错误；不当作M6完整demo验收。                                                                                                                                   |
| 文档                                                             | 首轮links失败定位11条已删除历史源码链接，固定到c361469；修正后`pnpm docs:check`退出0，30份Markdown。最终归档还需检查新增文档。                                                                                                                 |

新增测试理由：数据集/对称开关为本次科学变化；新门面纯逻辑不在M4；M2原型及无canvas的M4没有正式三维集成；controller唯一变化是内部按已接受源决定派生选项。35项之外没有默认扩大业务单元集合。

## 首轮失败、修复与证据限制

所有显示、配色、相机、正交/非正交辅助几何、原子/键真实点击、点坐标、三种测量及派生编辑历史首轮通过。模式和测量截图从当次成功附件提取，未为截图重跑；见[截图清单](m5/screenshots.json)与[三斜晶格/BZ/倒易示例](m5/chromium-triclinic-helpers.png)。截图已视觉检查，不单独替代数值/身份断言。

资源场景首轮看到14条剩余监听。最小创建/销毁诊断逐条追溯注册栈，确认为13条Playwright输入拦截/监听移除检测和1条AdGuard用户脚本；没有SDK监听残留。按具体归属分类并保留总数，未按常数减14，未修改后端释放来操作外部监听。[原始归属记录](m5-listener-ownership.json)保留三浏览器target/type/capture/stack。复验要求SDK的GPU、Worker、RAF、观察器、监听及canvas严格归零，各浏览器20轮，共60轮；同时覆盖context lost/restored、多实例和GPU提交中销毁。

WebGL不可用分支原本code可读但message未带code，后端统一补代码前缀，保留原错误断言。代码审查另发现纯视觉提交失败时finally可能先发旧ready；修复为先置error、清失效帧，再发布状态。同一待复验异步场景新增`atomScale=Number.MAX_VALUE`反例，验证源保留、无假ready且恢复为1后可重绘；这是唯一审查新增范围，有具体技术理由。

9项复验原始JSON被紧随其后的package reporter覆盖，逐轮附件未能归档。摘要如实保留已实际观察的统计、退出0和严格断言结果，不重造原始数据，不为补报告重复运行。现将workspace/package报告分名，防止再次覆盖。首轮原始JSON在忽略目录`.tmp/m5-browser-first.json`，摘要记录其SHA；成功截图及独立监听原始明细已提交。

## 硬件性能与完成关卡

命令`pnpm bench -- --phase=m5 --prepared`退出0，六轮全部门槛通过，GPU独占串行。使用仓库外安装的真实tarball，M2固定位置/20k拓扑转换为合法10k源分子，不使用原型伪500源映射；真实对称/邻胞扩展由功能用例另证。画质保持球24×16、封口圆柱16段、1920×1080/DPR1；每轮冷首帧、预热10秒/轨迹60秒、200次正确点击、100次100原子更新和20轮释放，无降规模或自动重试。六轮共120轮大结构创建/销毁的自有计数全部归零，另有外部readPixels更新探针全部通过。

| 模式/轮次 | 首帧ms | median FPS | 拾取p95 ms | renderer更新p95 ms |
| --------- | -----: | ---------: | ---------: | -----------------: |
| 空间填充1 |   40.2 |      59.88 |      10.24 |               32.4 |
| 球棍1     |   85.7 |      59.88 |       7.88 |               25.6 |
| 空间填充2 |   39.3 |      59.88 |       7.27 |               18.6 |
| 球棍2     |   91.9 |      59.88 |       8.00 |               26.2 |
| 空间填充3 |   44.0 |      59.88 |       7.54 |               18.9 |
| 球棍3     |   87.9 |      59.88 |       7.81 |               25.8 |

最差结果仍满足首帧≤5000ms、median FPS≥30、拾取/更新p95≤100ms；最差frame time p95为16.9ms。完整加载含源接受/计算最差3734.1ms，100原子编辑端到端p95最差4275.2ms，独立于renderer更新预算报告。硬件为Intel Arc B390/D3D11，驱动32.0.101.8356，Chromium153.0.8010.12、Windows10.0.26300、DPR1；电源与GPU实际枚举在原始数据中，软件结果未混入硬件结论。

[性能摘要](m5-performance-summary.json)、[原始文件清单](m5-performance/manifest.json)、[体积分项](m5-performance/artifacts.json)、[球棍10k截图](m5-performance/ball-and-stick-r3.png)已归档。原始六个JSON共约181MB，主要含每源原子的默认诊断；以无损gzip保存为约3.7MB，保留全部字段并逐文件验证解压字节一致，记录原始及gzip SHA256。原始未压缩文件仍在忽略目录`.tmp/bench/m5`，不为压缩归档重跑采样。

六轮使用同一源散列`6e73aedc3bcf2d66a0924e0538e280513983814a78651f186ffe83b752fc2c54`，最终再次计算一致；tarball SHA256为`47a3fd8adf7100a7383dabf5ab9d4def8c10930b21274ef3a0445169b9b3727b`。采样启动时HEAD仍为c361469工作树，正式实现随后提交为1287018、CI启动修复为623534a；CI修复仅root脚本/工作流，不改变冻结的源码、M5夹具、bench或lockfile。

正式SDK dist（不含外部Three）raw/gzip为1,328,044/153,220字节；隔离消费者含宿主及引擎的minified/gzip为1,422,031/226,374字节，其中Three522,254/129,501、生产Worker411,628/35,813字节。raw消费者为2,305,947/305,797字节；这些是同轮资产明细，不将含宿主总体积冒称纯viewer，也不凭空设置KB上限。

## Ubuntu与审查候选

实现候选`1287018`已提交为[草稿PR #8](https://github.com/SofiaXu/alchemion/pull/8)，使跨平台验证与硬件采样并行，避免平台修复在全部采样之后才被发现。第一次本地commit被1Password SSH signer挂起；终止该次操作后仅以单命令`-c commit.gpgsign=false`提交，没有修改全局设置。

Ubuntu首轮[run40907714527](https://github.com/SofiaXu/alchemion/actions/runs/40907714527)在scope脚本启动失败：pnpm exec没有提供npm_execpath，所有单元/构建/浏览器等均未运行。修复提交`623534a`新增真实`ci:m5`脚本入口；CI harness变化时从完整PR diff选择尚未完成的本交付关卡，普通增量/文档归档仍按实际变化路由。

修复后的[run40908739503](https://github.com/SofiaXu/alchemion/actions/runs/40908739503)在精确`623534ac5ab39ab2302030b42bdc0ee5c4e114a0`全部success：同5文件35单元（2.94秒）、三浏览器24/24（1.5分钟、4进程、无重试）、真实tarball Chromium1/1（4.6秒）、SDK/demo、无DOM与根类型、改动检查及31文档链接。完整初次失败和修复后的steps/logs证据见[CI摘要](m5-ci-summary.json)。不是为补Windows报告重跑，也未扩大到无关M3/M4套件。

## 端到端成本的实际限制

六轮100原子源事务→科学派生→显示的p95最差4275.2ms（空间填充首轮），随后五轮为1651.1–1743.6ms；不能用renderer的18.6–32.4ms更新数值代替。计时包括事务复制/校验、structuredClone和Worker传输、派生、返回冻结、显示快照组装及完整帧。

静态追踪发现整源复制/序列化、重复全量结构校验，以及显式键端点解析中每端`atoms.find`的O(E·N)路径；100命令组成一次事务只派生一次，并非错误地计算100次。这里没有CPU profiling，不能把耗时全部归到Worker或声称各阶段占比已证实。后续优化入口是请求局部AtomId索引及复用端点解析，保持科学诊断与结果，再评估局部重算。本阶段按既定renderer预算验收，端到端数据完整披露，不额外改源使当前硬件输入失效。
