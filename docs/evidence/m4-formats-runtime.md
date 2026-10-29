# M4格式、编辑与计算运行时验证

日期：2026-10-29，Asia/Hong_Kong。工作目录`D:\source\alchemion`；入口`master@560e41e`，实现/CI源码提交`d7f14e7899bdb5dcaa145378be04ad1d61c082a3`。后续归档只改文档，主分支合并见[PR #7](https://github.com/SofiaXu/alchemion/pull/7)。

## 实际交付与边界

正式formats已替换为CIF1/CIF2文档/晶体编解码、MOL V2000/V3000及周期POSCAR输出；默认阻止科学损失，格式元数据保存未映射信息与测量锚点。MOL有限范围显式选择且返回来源映射；同位素与基本立体标志不会按旧平均质量或数组位置推断。

core提供纯事务/history；viewer提供显式sync/worker执行器和唯一无canvas控制器。默认100事务、30秒，源提交队列保持命令顺序，派生与提交回调可以失效。取消/异常/超时/销毁均结束待决Promise；单调deadline也覆盖同步阻塞后先到结果的竞态。M5通过相同controller的commit边界接入完整帧，不重建第二套历史/调度。

旧格式实现、未使用schema和样例以及历史setting操作数组已移除；历史viewer/demo暂用自产旧模型输入。历史Babylon元素/配色继续由M5/M6处理，本报告不构成正式Three viewer或完整产品分发验收。

## 环境与定向命令

使用`.tools/pnpm.cmd`提供Node24.22.1、pnpm9.7.0，TypeScript5.9.3、Vitest4.0.18、Vite7.3.5、Playwright1.63.0。系统默认Node26/pnpm12不符合项目固定版本，未用其执行验收。单元和浏览器并行上限4，无重试；唯一tarball场景实际1进程。

| 检查与命令                                                                                   | 状态、退出码和实际结果                                                                                                                                                |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 初次跨包`pnpm exec tsc -p packages/alchemion/tsconfig.json`                                  | 失败1：整合过程中旧CIF类仍引用已移除的历史setting数组，5条错误；按计划删除旧实现后消除，不增加兼容层。                                                                |
| `pnpm exec vitest run <CIF/MOL/POSCAR/editing/runtime目录及core结构校验文件> --maxWorkers=4` | 首跑失败1；10文件/96项，91通过、5失败，1.91秒。精确范围为下文所列目录，不是全套。                                                                                     |
| `pnpm exec vitest run <六个受影响测试文件> --maxWorkers=4`                                   | 已通过0；78/78，1.45秒。修复与补充理由见下一节；其余21个已通过且未受影响场景未重跑。总计99个独立单元场景已在对应范围通过。                                            |
| `pnpm build`                                                                                 | 已通过0；SDK类型/ESM/三个Worker资产/声明及独立demo。SDK6.99秒，demo14.88秒。                                                                                          |
| `pnpm --filter alchemion build:source`                                                       | 已通过0；7.14秒。仅因后续CIF序列化和deadline生产修改重建SDK，再供浏览器/参考/消费者使用；未重建未受影响demo。                                                         |
| `pnpm exec tsc -p packages/alchemion/tsconfig.core.json`；`pnpm exec tsc -p tsconfig.json`   | 已通过0；纯ES2022 core/formats源码、全部相关消费声明/宿主类型。                                                                                                       |
| `TEST_WORKERS=4 pnpm test:browser -- --phase=m4 --prepared`                                  | 已通过0；Chromium/Firefox/WebKit各4场景，总12/12，25.7秒。                                                                                                            |
| `TEST_WORKERS=4 pnpm test:package -- --phase=m4 --prepared --project=chromium`               | 已通过0；1/1，5.0秒；生产消费者构建18.47秒。仓库外安装真实tarball，声明、无DOM core/formats、实际Worker、事务/历史、无canvas独立控制器及受影响历史输入加载/销毁通过。 |
| `pnpm exec eslint <改动TS/MJS文件>`                                                          | 已通过0；只检查实际改动与新增文件。                                                                                                                                   |
| 改动文件Prettier及`pnpm docs:check`                                                          | 已通过0；改动代码/配置/文档格式通过，29份Markdown本地链接有效。                                                                                                       |

SDK构建验证每个静态Worker URL指向本包真实资产，不再硬编码总数；正式新运行时只拥有一个计算Worker。消费者位于`C:\Users\aoba\AppData\Local\Temp\alchemion-m4-consumer-ea37dS`，只服务其生产dist，未使用源码alias或仓库依赖布局。

三浏览器实际版本：[版本记录](m4-browser-versions.json)。这些场景不创建WebGL；tarball中仅最小历史入口回归使用现有图形路径，不提供性能结论。版本元数据额外读取没有重复功能场景。

## 新增、失败与复验理由

新增场景对应T-FMT-01–04、T-EDIT-01、T-RUN-01，及立体模型改变直接影响的T-DOM-06。首轮96项之外，审查新增三个具体反例：CIF长逻辑文本/末尾反斜线的序列化；同步计算结果先于已到期timer回调；同步commit先于已到期timer回调。没有为低影响文档/格式改动建立业务测试。

首轮五项失败均有明确原因：两项SU断言不应对IEEE浮点结果严格相等，现按领域绝对/相对容差；MOL失败源于CRLF导致变异字符串没匹配，现先断言变异命中并核对两版CRLF等价；编辑立体fixture未提供真实邻接键，补正确输入且保持生产校验；disposed状态应读取可选snapshot是否undefined，不要求对象含该key。

唯一一次集中复验只覆盖六个文件：CIF的document/structure、MOL的mol、editing、runtime和controller。未改动的CIF loss、finite、POSCAR与core structure的21项沿用首轮通过结果。当前分组为CIF45、MOL/POSCAR20、编辑/runtime27、受影响core校验7，共99项。

浏览器验证覆盖三类科学任务sync/worker相同、事务和load提交前后失败、辅助任务共享执行器、双controller隔离、静默commit中的clear/dispose，以及真实Worker迟到回复、崩溃、静默关闭超时。内部可控transport补充构造/send/messageerror/非法payload和默认deadline；故障注入不进入正式API。

未运行M3其余科学测试、M2三维/性能、完整check或完整demo用户路径：科学算法未改，渲染和完整demo分别由M5/M6验收。Bootstrap Sass和既有包体积警告保留，没有调阈值使检查变绿。

## 独立格式与来源

一次性生成命令：`node --experimental-strip-types scripts/m4-cif-fixtures.ts`和`node scripts/m4-mol-fixtures.mjs`。显式算术输入来自自编fixture，预期没有调用生产reader/科学派生算法生成。`.tmp/m4-reference`保存原输入、SDK输出及expected；脚本与固定输入在仓库，摘要保留各文件SHA，可按归档提交重建。

固定环境/逐文件结果见[独立参考JSON](m4-independent-reference.json)：PyCifRW5.0.1核CIF1/2语法/容器；NumPy Cholesky和线性求解核非正交基矢、体积、坐标与SU/U-B；RDKit2025.9.6核两版原子/键、属性、parity和原始续行/编号；ASE3.26.0核POSCAR；OpenBabel只补三种自由基spin。17个文件最终均通过。

首跑14通过、3失败。两项CIF2失败是Windows参考脚本读取expected JSON未显式UTF-8，只修参考脚本并复验这两个文件。OpenBabel拒绝V3000 token内部续行；对应[上游实现](https://github.com/openbabel/openbabel/blob/openbabel-3-1-1/src/formats/mdlformat.cpp#L1377)先拆物理行token，不能拼接`MA-`与`SS=13`。原文件继续由RDKit核验；只对OpenBabel的spin通道按CTfile规定展开物理续行，保留全部科学字段和非连续编号，再只复验该文件。原文件和规范化传输的SHA均已记录，未删矩阵项或更改生产实现。

包装版本openbabel-wheel3.1.1.23实际返回运行时字符串3.1.0，两者分别记录，不冒称其他版本。独立工具仅本地运行，没有上传用户文件，也未进入浏览器依赖。

新格式数据的官方原字节、转换和许可在[来源台账](../data-sources.md)、各源JSON及随包`dist/FORMAT_DATA_MANIFEST.json`；完整许可在SDK第三方声明。M3科学manifest保持不变。历史来源未核实的废弃样例已移除，台账保留历史记录与原因。

## Ubuntu关卡与交接

[Ubuntu Actions run40858487156](https://github.com/SofiaXu/alchemion/actions/runs/40858487156)首轮通过，源码d7f14e7，job123395402304，2026-10-29 18:33:28–18:35:48（Asia/Hong_Kong）。Ubuntu24.04.5、runner镜像20261025.353.1、Node24.22.1/pnpm9.7.0、Chromium153.0.8010.12，详细摘要见[CI JSON](m4-ci-summary.json)。

实际10文件/99单元通过（4进程、3.16秒）；SDK/demo构建、纯core/formats与消费类型、改动lint/格式、29文档链接通过。Linux真实tarball场景1/1通过，8.0秒。软件图形只提供功能证据；未触发M2或其他M3科学测试。后续纯文档归档只查格式/链接，保持已测源码不变。

M5从`createEditorController`与commit回调接入Three完整帧、选择/测量失效与资源归属；无需补写M4格式/history或另建Worker池。M4不自动实施M5。
