# 历史工程基线与静态审计

观察日期：2026-10-29。基准提交：`06784cf0a61d09c76906086bebac773459f5b33d`（2024-09-03）。本文件描述该提交下的历史工程，不定义新版行为；新版要求分别见 [产品](product.md)、[领域](domain.md) 和 [架构](architecture.md)。

## 证据边界

M1/M3 迁移说明：下文保留历史基准的事实和失败状态；源码链接已更新到搬迁后的位置。M3 将旧 core 移至 internal/legacy，删除的键价表链接固定历史提交。当前 manifest、构建与 API 请读 README 和阶段证据，不能由这些链接的当前内容反推历史提交。

- 开始审计时 Git 工作区干净，分支为 `master`，共有 10 次提交、67 个跟踪文件。M0 随后添加的文档不属于历史基线。
- 已读取源码、配置、测试声明和数据文件头，执行了文件清单、Git 状态与历史查询。原始工程没有 README、AGENTS 或 CI 配置。
- 当时没有 `node_modules`；已观察到本机 Node 为 `24.14.0`，但仓库未声明 Node `engines`。本轮没有安装依赖，没有运行 build、lint 或 Vitest。
- 下文“风险”均来自静态阅读，不表示已运行复现。现有测试的存在、断言和配置不代表它们已经通过，也不证明科学结果正确。
- 源码链接指向 M0 时的实际路径。后续迁移应更新链接并注明新位置；基准提交和本文件的历史结论不能改写成新版已经完成。

## 工程与能力清单

| 部分           | 历史证据                                                                                                                                                                                                                                                                                                                                                                                                                  | 可确认的静态事实                                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 工程与入口     | [package.json](../package.json)、[Vite 配置](../packages/alchemion/vite.config.ts)、[主入口](../packages/alchemion/src/viewer/index.ts)                                                                                                                                                                                                                                                                                   | TypeScript/Vite 库工程，包名 `alchemion`，`private: true`、`0.0.0`；入口统一重导出 editor、parsers、core、writers；配置 ES/CJS 与声明生成。    |
| 结构模型       | [结构定义](../packages/alchemion/src/internal/legacy/structure/index.ts)                                                                                                                                                                                                                                                                                                                                                  | 原子同时以 `x/y/z` 和附加字段承载坐标；键直接引用原子对象；名称兼有显示和身份用途；包含可变对象及 `any` metadata。                             |
| 元素与科学数据 | [元素入口](../packages/alchemion/src/internal/legacy/elements/index.ts)、[元素表](../packages/alchemion/src/internal/legacy/elements/elements.ts)、[键价表](https://github.com/SofiaXu/alchemion/blob/3ab8d6f/packages/alchemion/src/core/elements/bvparm.ts)、[空间群表](../packages/alchemion/src/internal/legacy/structure/space-group-settings.ts)、[配色](../packages/alchemion/src/internal/legacy/colors/index.ts) | 内置大型数据表及颜色表；表的来源、版本与许可没有独立台账。不能从仓库 MIT 推断数据来源。                                                        |
| CIF            | [晶体适配](../packages/alchemion/src/formats/parsers/cif-parser/index.ts)、[文档解析器](../packages/alchemion/src/formats/parsers/cif-parser/cif-document-parser.ts)                                                                                                                                                                                                                                                      | 存在 CIF 文档与晶体结构两层处理；文档测试覆盖 CIF1/2、loop、引号、文本、列表、表等语法场景。                                                   |
| MOL            | [MOL 解析](../packages/alchemion/src/formats/parsers/mol-parser.ts)                                                                                                                                                                                                                                                                                                                                                       | 按固定列读取原子和键，具有 V2000 风格实现；该实现不能作为 V3000 支持证据。                                                                     |
| 导出           | [CIF writer](../packages/alchemion/src/formats/writers/cif-writer.ts)、[POSCAR writer](../packages/alchemion/src/formats/writers/poscar-writer.ts)                                                                                                                                                                                                                                                                        | 有 CIF/POSCAR writer，没有 MOL writer；输出版本、损失策略和公开诊断尚无完整契约。                                                              |
| 计算           | [计算调度](../packages/alchemion/src/viewer/calculators/index.ts)、[原子扩展](../packages/alchemion/src/viewer/calculators/atom.ts)、[成键](../packages/alchemion/src/viewer/calculators/bond.ts)                                                                                                                                                                                                                         | 包含对称/邻胞扩展、成键和增删调度；依赖浏览器 Worker、mathjs 表达式以及可变派生原子。                                                          |
| 显示与交互     | [编辑器](../packages/alchemion/src/viewer/index.ts)、[显示接口](../packages/alchemion/src/viewer/contracts/index.ts)、[renderer 目录](../packages/alchemion/src/viewer/renders/index.ts)                                                                                                                                                                                                                                  | Babylon.js 编辑器，存在相机、空间填充、晶格、倒易晶格、选择、点坐标和距离/角度测量相关代码。接口还声明球棍和二面角，声明本身不是功能完成证据。 |
| 第一布里渊区   | [实验 renderer](../packages/alchemion/src/viewer/renders/brillouin-zone.ts)                                                                                                                                                                                                                                                                                                                                               | 存在基于几何裁切的实验代码；`dispose()` 直接抛出未实现错误。尚无独立科学或浏览器验收。                                                         |
| 演示页         | [页面](../apps/demo/index.html)、[演示入口](../apps/demo/src/main.ts)                                                                                                                                                                                                                                                                                                                                                     | 标题仍为 `Vite + TS`；Bootstrap 调试工具栏固定加载样例；demo 与 SDK 没有 workspace 边界。`src/test.ts` 是演示入口，不是自动测试。              |

## 检查与分发基线

当前脚本的真实定义见 [package.json](../package.json)：`dev` 启动 Vite；`build` 为 `tsc && vite build`；`lint` 检查 JS/TS；`test` 为 `vitest`；`format` 会写入 JS/TS/HTML/JSON，不检查 Markdown。M1 将建立的命令不能倒写为本轮已存在或已通过。

[TypeScript 配置](../tsconfig.json) 启用 strict、未使用变量/参数检查，`include` 覆盖整个 `src`，因此库、演示与测试共享检查范围。[ESLint](../eslint.config.mjs) 使用历史配置格式；格式配置位于 [.prettierrc.json](../.prettierrc.json)。没有单独的浏览器测试、覆盖率、消费者类型检查或 CI 配置。

已有自动测试只有 [CIF 文档测试](../packages/alchemion/src/formats/parsers/cif-parser/__tests__/cif-document-parser.test.ts) 和 [晶体适配测试](../packages/alchemion/src/formats/parsers/cif-parser/__tests__/index.test.ts)，共 20 个 `it`；[fixtures 目录](../packages/alchemion/src/formats/parsers/cif-parser/__tests__/test-data) 有 19 个 CIF 文件。晶体适配测试断言样例有 29 个原子和 0 条键，这只是旧断言，不能作为新版领域规则。

| 项目                             | 本轮状态                                    | 后续验证入口                                                                           |
| -------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------- |
| 原始冻结安装                     | 未运行；静态发现 manifest/lockfile 归类差异 | [M1](plans/m1-foundation.md) 先记录原始 `pnpm install --frozen-lockfile`，再处理冲突。 |
| 类型检查、lint、构建             | 未运行                                      | M1 建立环境并记录各命令退出码与结果。                                                  |
| 现有 20 个 CIF 测试              | 未运行                                      | M1 记录真实基线；M3/M4 用独立 oracle 校正旧断言。                                      |
| MOL、writers、科学计算与历史编辑 | 未发现对应自动测试                          | [质量场景](quality.md) 的 T-DOM、T-FMT 和 T-EDIT。                                     |
| Worker、交互、生命周期、多实例   | 未发现浏览器自动测试                        | T-RUN-01、T-VIEW-01/02/03。                                                            |
| 一万实例与打包消费者             | 无本轮测量、无现成验收配置                  | T-PERF-01、T-PKG-01。                                                                  |

## 静态风险登记

以下编号是审计项，不是测试编号或已复现缺陷；验收编号以 [quality.md](quality.md) 为准。

| 编号  | 静态证据与风险                                                                                                                                                                                                                   | 负责阶段 / 验证方式                                                                              |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| B-001 | manifest 将 Babylon.js、RxJS、earcut 等列为 peer dependencies，而 [lockfile](../pnpm-lock.yaml) 的根 importer 将它们列为 dependencies。冻结安装是否报错尚未运行确认。                                                            | M1：保存原始安装结果，再统一依赖归属、重锁并重新冻结安装。                                       |
| B-002 | CIF writer 写 `_atom_site_fract_*` 时使用原子 `x/y/z`；POSCAR writer 写 `Direct` 时也使用这些字段。模型没有显式区分坐标类型，存在导出坐标误用风险。                                                                              | M3/M4：T-DOM-01、T-FMT-01/03，斜晶胞往返与外部参考验证。                                         |
| B-003 | 晶胞三角函数和坐标构造散落于扩胞、writer、晶格/倒易/BZ 显示与点拾取；斜晶胞和退化晶胞可能产生不一致。                                                                                                                            | M3/M5：统一权威数学实现，T-DOM-01/04/05。                                                        |
| B-004 | 成键遍历原子对，先按单侧元素 `bondElements` 过滤；规模增长、输入顺序和元素表可信性均需验证。                                                                                                                                     | M3：独立小规模 oracle、排列不变性；M5：T-PERF-01。                                               |
| B-005 | 扩胞使用全局 Worker 数组和坐标精确相等去重；并行分支将已有分数坐标与返回的笛卡尔字段比较。`atom.ts` 的 30 秒定时器用于成功后的空闲 Worker 清理，不是请求超时；待决请求没有对应错误/超时拒绝。                                    | M3/M4：T-DOM-02/06、T-RUN-01；对照串并行结果，测试并发、取消、过期回复与错误。                   |
| B-006 | 编辑器拥有事件、计算 Worker、场景和渲染资源；存在直接注册实例方法的 resize 事件，BZ 销毁未实现。完整资源归属和多实例隔离没有测试。                                                                                               | M5：T-VIEW-02/03；20 轮创建/销毁并记录自有资源计数。                                             |
| B-007 | 球棍、二面角出现在接口字符串中；BZ 位于实验 renderer；基础结构编辑和 undo/redo 没有正式完整契约。                                                                                                                                | M4/M5：按已批准产品需求实现并验收，不能因旧代码未完成而删减范围。                                |
| B-008 | 广泛重导出、ES/CJS、peer dependencies 与内联 Worker 共存；没有显式 peer 外置配置，也无 tarball 消费测试。产物可用性未证实。                                                                                                      | M1 建立明确 ESM 子路径与检查；M6 执行真实浏览器消费者验收。                                      |
| B-009 | MOL 固定列读取和 CIF 的旧解析断言不能证明所有新版格式矩阵、缺失值与错误定位符合要求。                                                                                                                                            | M4：T-FMT-01/02/04；版本、边界与不支持字段的诊断均须显式测试。                                   |
| B-010 | 科学表与 fixtures 缺乏完整来源记录，部分 CIF 文件头附带引用条件。                                                                                                                                                                | M3/M4/M6：T-DATA-01，见 [数据台账](data-sources.md)。                                            |
| B-011 | [CIF 体积补算](../packages/alchemion/src/formats/parsers/cif-parser/index.ts#L93) 直接把晶胞角度传入 `Math.cos`；[点拾取](../packages/alchemion/src/viewer/index.ts#L342) 也混用角度并以投影代替晶胞矩阵求逆。                   | M3/M5：T-DOM-01/04、T-VIEW-01；正交和非正交晶胞独立参考，统一转换入口。                          |
| B-012 | [原子删除](../packages/alchemion/src/viewer/index.ts#L517) 用三个坐标不等条件的 AND 过滤，会同时排除共享任一坐标分量的其他原子；旧计算删除路径也依赖对象引用或名称。                                                             | M3/M4/M5：T-DOM-06、T-EDIT-01；用不同 ID、重名、部分坐标相同及 Worker 传输后的原子验证精确删除。 |
| B-013 | [CIF 结构适配](../packages/alchemion/src/formats/parsers/cif-parser/index.ts#L11) 强制 CIF1、只取首个 block；MOL 同元素原子名称重复。原子身份和格式选择没有独立契约。                                                            | M3/M4：T-DOM-06、T-FMT-01/02/04；稳定 ID、显式 block 选择及版本矩阵。                            |
| B-014 | [Worker 回复处理](../packages/alchemion/src/viewer/index.ts#L117) 没有请求/文档/修订标识；[空间填充分帧](../packages/alchemion/src/viewer/renders/space-filling.ts#L23) 没有对应取消令牌。旧加载、清空与销毁可能与迟到结果交错。 | M4/M5：T-RUN-01、T-VIEW-02；受控消息反序和渲染中取消，不允许旧帧复活。                           |

## 重构使用方式

保留这份基线用于解释重构动机和寻找旧测试/数据资产；不要把旧 API、旧模块组织、实验实现或旧结果当成兼容要求。每个阶段的实际进展写入自己的执行计划；本文件不维护新版任务状态。下一步从 [M1 工程基线](plans/m1-foundation.md) 开始。
