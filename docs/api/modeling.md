# 建模 API

纯构建接口从 `alchemion/core` 导入，浏览器预览从 `alchemion/viewer` 导入。坐标、标志和科学损失沿用[领域规范](../domain.md#结构建模)。

## 晶体与表面

| 接口                                                          | 主要输入与结果                                                                                                                            |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `createCrystal(options)`                                      | `cell` 使用基矢或六参数，`atoms` 使用分数坐标，`symmetry.spaceGroup.hallNumber` 可区分 setting。返回展开实例计数。                        |
| `createSupercell(source, matrix)`                             | 矩阵由三个整数列向量组成，行列式须为正。原三个正整数的倍数入口仍可用。结果沿用 `SupercellResult`。                                        |
| `listSlabTerminations(source, hkl)`                           | 返回按法向排序的间隙索引、分数偏移与两侧元素。                                                                                            |
| `createSlab(source, { hkl, termination, thickness, vacuum })` | `thickness` 为 `{ repeats }` 或 `{ angstrom }`，`vacuum` 用 Å。`slabBottomAtomIds(source, count)` 返回从最低投影平面起的源 ID。           |
| `findInterfaceMatches(reference, overlayer, options)`         | `rotation` 和 `maxAngleMismatch` 为度，`maxStrain` 为分数，`maxAreaMultiple`、`maxMatches` 限制搜索。返回匹配矩阵、角度调整、应变与面积。 |
| `createInterface(reference, overlayer, options)`              | 采用候选 `match`，设置 `gap`、`vacuum` 和面内分数 `translation`。                                                                         |
| `placeAdsorbate(substrate, molecule, options)`                | 以 `anchorAtomId` 为刚体锚点，`target` 用 Å 笛卡尔坐标，`height` 沿法向，`rotation` 接受轴与角度。                                        |

## 缺陷、分子和有限构型

| 接口                                                                  | 主要输入与结果                                                                                                                                                                                                       |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `findInterstitials(source, options)`、`buildDefects(source, options)` | 返回有最近距离的网格候选。构建支持指定分数位置插入，按元素或 `atomIds` 进行种子替位，以及按种子实体化占位。                                                                                                          |
| `attachFragment(source, fragment, options)`                           | `MolecularFragment` 持有分子快照和命名连接点。连接点声明锚原子、方向和可选上方向、离去原子。选定锚点与端口后可设距离、键阶及扭转角。`BUILT_IN_FRAGMENTS` 提供内置模板。                                              |
| `addHydrogens(source, atomIds?)`                                      | 根据显式键及支持的价态添加氢。省略 ID 时检查整个分子。                                                                                                                                                               |
| `buildPolymer(options)`                                               | 以 `units` 和 `recipe` 定义序列、均聚、嵌段或随机配额。`branches` 和 `ends` 用从零开始的单元索引引用端口。链上后续添加的支化单元可以成为父单元。                                                                     |
| `packMolecules(options)`                                              | 每个 `components` 项含分子与 `count` 或 `ratio`。比例模式另填 `totalMolecules`。使用固定 `cell` 或 `substrate`，也可用目标 `density` 生成立方盒或等比例缩放 `shape`。`region` 使用分数坐标，`minimumDistance` 用 Å。 |
| `buildNanotube(options)`                                              | `walls` 按半径从小到大提供 `{ n, m }`。有限型指定 Å 长度，周期型指定轴向重复数与横向真空。可选壁间距目标及容差。                                                                                                     |
| `cropCluster(source, options)`                                        | `center` 用 Å 笛卡尔坐标，`shape` 为带半径的球或带三个半长的盒。                                                                                                                                                     |

除超胞与候选查询外，构建成功返回 `ConstructionResult`。其中 `snapshot` 为不可变结构，`atoms`、`bonds` 按输出 ID 列出各输入的来源，`parameters` 记录实际选项与统计细节，`stats` 给出原子数、键数和组成。来源可附周期端点和输出胞偏移。`constructionSnapshot(result)` 将这些参数和映射写入 `metadata.alchemionConstruction`，供新文档加载。

## 编辑与异步预览

- `apply-construction` 接收 `construction`、预览对应的 `documentId` 与 `revision`。整次构建提交为一个事务。新实体遇到已用 ID 时改用新 ID，端点和输出映射随之更新。
- `set-movable` 为周期源原子设置或清除 `movable`。`add-bond`、`remove-bond`、`set-bond-order` 编辑分子的显式键，并诊断由此失效的立体标志。多项同类变更可以组成同一批命令。
- `createModelingRuntime().preview({ documentId, revision, task }, { signal })` 接收可结构化克隆的 `ModelingTask`，返回带身份和诊断的构建结果。`symmetry` 任务可选 `output: 'recognition' | 'standard' | 'primitive'`、距离、角度和 Hall number，默认识别、`0.001 Å`、自动角度及自动 setting。仅识别时保留原结构，转换返回实际 P1 快照。
- 建模运行时拥有一个独立、按需创建的 Worker。`invalidate()`、取消和超时释放其运行资源，`dispose()` 可重复调用。宿主负责在源修订变化时失效结果，并在应用前检查身份。
