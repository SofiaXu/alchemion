# M5正式viewer验证记录

日期：2026-10-29，Asia/Hong_Kong。工作目录：`D:/source/alchemion`。起点`master@c361469`；实现位于`codex/m5-viewer`，本报告随实际结果更新。

当前状态：功能、类型、构建、真实消费者和demo启动已通过；硬件六轮基准运行中，Ubuntu CI及主分支合并尚未进行。不得将本记录当前状态解释为M5已完成。

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

命令`pnpm bench -- --phase=m5 --prepared`正在独占GPU运行；原始产物目标`.tmp/bench/m5`。使用仓库外安装的真实tarball，M2固定位置/20k拓扑转换为合法10k源分子，不使用原型伪500源映射；真实对称/邻胞扩展由功能用例另证。画质、1920×1080/DPR1、两模式各三轮、预热10秒/轨迹60秒、200点击、100次100原子更新、20轮释放均维持固定协议；renderer边界与源编辑端到端分别计时，另有外部readPixels更新探针。

硬件数据、预算、raw/gzip和最终通过情况待实际采样后填写。Ubuntu CI、PR、merge SHA与M6交接待取得真实证据再归档；目前未宣称这些检查已通过。
