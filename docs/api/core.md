# core API

`alchemion/core` 提供结构模型、科学计算和同步编辑事务，不创建 canvas 或 Worker。本文覆盖[公开入口](../../packages/alchemion/src/core/index.ts)中的全部导出；完整签名、判别联合和只读字段以该入口导出的 TypeScript 声明为准。科学约定与容差的权威定义见[领域规范](../domain.md)，格式读写见[formats API](formats.md)。

```ts
import { createCell, createStructureSnapshot, deriveStructure } from 'alchemion/core'
import type { StructureSnapshot, ScientificResult } from 'alchemion/core'
```

## 模型、单位与返回值

`StructureSnapshot` 通过 `kind` 区分两种源结构。`periodic` 必须有有效晶胞，原子使用 `fractional`；`molecular` 原子使用 Å 制 `cartesian`，不附加默认晶胞。两者都有 `atoms`、`bonds` 和可选标题/JSON 元数据。

| 量                 | 约定                                                                                            |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| `Vec3` / `Matrix3` | 只读三元组；矩阵保存三个列向量，`r = A f`。                                                     |
| 长度、体积         | Å、Å³；分数坐标无量纲，源分数坐标允许超出 `[0,1)`。                                             |
| 角度               | 晶胞参数和测量结果均为度。                                                                      |
| 倒易量             | 基矢和点为 Å⁻¹，BZ 体积为 Å⁻³；包含 `2π`。                                                      |
| 质量、位移         | 质量为 u；`displacementU` 为 U 的 Å² 值，`B = 8π²U`。                                           |
| 未知值             | `ScientificValue` 区分 `known`、`unknown`、`not-applicable`；已知值可带不确定度、字面值和来源。 |

`ScientificResult<T>` 是 `{ ok: true, value, diagnostics }` 或 `{ ok: false, diagnostics }`。先检查 `ok` 再读取 `value`；成功结果也可能带 warning 或 info。`validate*` 返回诊断数组，不返回 `ScientificResult`。`Diagnostic` 包含 `severity`、稳定 `code`、`message`、可选 JSON `context` 及行列定位 `sourceLocation`。

源原子和源键各自使用结构内唯一的稳定字符串 ID，标签和数组下标不作为身份。`BondEndpoint` 保存 `sourceAtomId`、`symmetryOperationId`、`integerCellOffset`；分子端点使用操作 `identity` 和零平移。`AtomInstance` 是显示实例，另有实例 `id`、实际位置和 `equivalentSources`。`DerivedBond` 引用两个实例 ID，保留规范端点及显式/推断来源。格式重新导入会建立新的结构，文件记录号不能当成文档历史 ID。

## 晶胞与源结构

实现与完整签名见[晶胞函数](../../packages/alchemion/src/core/cell.ts)和[结构函数](../../packages/alchemion/src/core/structure.ts)。

| 函数                                                                  | 参数、结果与行为                                                                                                                                               |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createCell(input)`                                                   | 接收 `CellParameters` 或 `Cell`，返回 `ScientificResult<Cell>`。参数长度为 Å，角度为度；`Cell.basis` 为 Å 列向量。复制有效输入，不用文件报告体积替代基矢。     |
| `validateCell(cell)`                                                  | 返回 `readonly Diagnostic[]`。检查有限、右手、非退化基矢及参数不确定度。                                                                                       |
| `cellVolume(cell)`                                                    | 返回 `ScientificResult<number>`，数值为基矢行列式，单位 Å³。                                                                                                   |
| `cellParameters(cell)`                                                | 返回 `ScientificResult<CellParameters>`，恢复 `a/b/c/alpha/beta/gamma`。                                                                                       |
| `fractionalToCartesian(cell, position)`                               | 分数三元组转为 Å 笛卡尔三元组，返回 `ScientificResult<Vec3>`。                                                                                                 |
| `cartesianToFractional(cell, position)`                               | Å 笛卡尔三元组转为分数三元组，返回 `ScientificResult<Vec3>`。                                                                                                  |
| `checkReportedCellVolume(cell, reportedVolume, standardUncertainty?)` | 报告体积与标准不确定度均为 Å³，不确定度默认 `0`。返回推导体积；不一致时给出 `CELL_VOLUME_MISMATCH` warning。                                                   |
| `validateStructure(input)`                                            | 接受 `unknown` 并返回诊断数组；检查结构类别、数值、元素、身份、键端点及已建模科学字段，不修改输入。                                                            |
| `createStructureSnapshot(input)`                                      | 接收 `StructureSnapshot`，返回独立、递归冻结的 `ScientificResult<StructureSnapshot>`。缺省占位补为已知 `1` 并给出 `OCCUPANCY_DEFAULT` info；显式未知保持未知。 |

晶胞边长须为正，参数角度在 `(0°,180°)` 内；拒绝非有限数、左手或病态晶胞。不要将只读 TypeScript 标注当成输入隔离，正式源状态应经过快照工厂或文档 `load`。

## 元素、对称与实例

数据来自[数据入口](../../packages/alchemion/src/core/data/index.ts)，来源和缺失策略见[来源与许可](../data-sources.md)。

| 导出                               | 参数、结果与行为                                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `ELEMENTS`                         | 冻结的 `readonly ElementRecord[]`，元素 1–118；质量类型、共价半径和可用的范德华半径附来源。缺失半径保持缺失。 |
| `getElement(symbol)`               | 按标准元素符号精确查询，返回 `ElementRecord \| undefined`；不自动更正大小写。                                 |
| `SPACE_GROUP_SETTINGS`             | 冻结的 `readonly SpaceGroupSetting[]`，Hall 1–530；IT 号、H-M/Hall 名、choice 与操作分别保存。                |
| `getSpaceGroupSetting(hallNumber)` | 按 Hall 编号查询，返回 `SpaceGroupSetting \| undefined`，参数不是 IT 编号。                                   |

[对称函数](../../packages/alchemion/src/core/symmetry.ts)均保留明确的来源和坐标含义：

| 函数                                                   | 参数、结果与行为                                                                                                                                                                                      |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `parseSymmetryOperation(text, id)`                     | 解析如 `-x,y+1/2,z` 的限定仿射语法，调用者提供非空稳定操作 ID，返回 `ScientificResult<SymmetryOperation>`。不会执行任意表达式。                                                                       |
| `validateSymmetryOperations(operations, cell)`         | 返回诊断数组，验证操作 ID、整数旋转、有理平移与晶胞度量。                                                                                                                                             |
| `resolveSymmetry(information, cell)`                   | `information` 可为 `undefined`。返回 `ScientificResult<readonly SymmetryOperation[]>`；显式操作优先，标识冲突给 warning；只有标识时必须唯一解析 setting，无信息时仅采用恒等并给 warning。歧义会失败。 |
| `resolveBondEndpoint(snapshot, endpoint, operations?)` | 返回 `ScientificResult<EndpointPosition>`，包含 Å `cartesian`，周期时另有 `fractional`。可传已解析操作；省略时按源结构解析。                                                                          |
| `isSamePhysicalEndpoint(snapshot, a, b, operations?)`  | 返回 `ScientificResult<boolean>`。须为同一源原子的同一实际位置；不同邻胞位置不按周期取模合并。                                                                                                        |

[实例函数](../../packages/alchemion/src/core/derivation.ts)只产生有限派生显示，不改变源结构：

| 函数                                                        | 参数、结果与行为                                                                                                                   |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `deriveInstances(snapshot, options?)`                       | 返回 `ScientificResult<readonly AtomInstance[]>`。按稳定顺序生成实例，同源特殊位置合并并保留等价来源，不合并不同源原子。           |
| `sourcePositionFromInstance(snapshot, instance, cartesian)` | 逆转该实例的对称及平移，返回源坐标的 `ScientificResult<Vec3>`：周期源返回分数坐标，分子源返回 Å 笛卡尔坐标。输入目标位置一律为 Å。 |

`InstanceOptions` 默认 `applySymmetry: true`、`neighborCells: []`、`cutoff: { kind: 'none' }`。中心晶胞始终包含在邻胞集合内；邻胞必须是安全整数三元组。关闭对称副本时仍使用源中的真实恒等操作，找不到时失败，不改写源对称。

`cutoff: { kind: 'fraction', width: [qx,qy,qz] }` 的宽度为非负分数坐标边距，保留候选显示中 `[-qx,1+qx] × [-qy,1+qy] × [-qz,1+qz]` 的位置。分子源不接受分数裁切或非中心邻胞。

## 成键、测量与倒易计算

| 函数                                                                                          | 参数、结果与行为                                                                                                                                                            |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`inferBonds(snapshot, instances)`](../../packages/alchemion/src/core/bonds.ts)               | 给定源结构和有效实例，返回 `ScientificResult<readonly DerivedBond[]>`。投影显式键并优先保留其键阶，再按几何推断其余单键。                                                   |
| [`deriveStructure(snapshot, options?)`](../../packages/alchemion/src/core/bonds.ts)           | 返回 `ScientificResult<DerivedStructure>`，一次生成实例与键。`DerivationOptions` 在 `InstanceOptions` 能力上增加 `inferBonds`（默认 `true`）和 `cutoff: { kind: 'bond' }`。 |
| [`measureDistance(a, b)`](../../packages/alchemion/src/core/measurements.ts)                  | 输入实际显示点的 Å 坐标，返回 `ScientificResult<Measurement>`，单位 `angstrom`；重合点距离为 `0`。                                                                          |
| [`measureAngle(a, b, c)`](../../packages/alchemion/src/core/measurements.ts)                  | 以 `b` 为顶点，结果为 `[0°,180°]`，单位 `degree`；零长边给无定义诊断。                                                                                                      |
| [`measureTorsion(a, b, c, d)`](../../packages/alchemion/src/core/measurements.ts)             | 按输入顺序计算有符号二面角，范围 `(-180°,180°]`；零长边或共线法向量返回诊断，不返回 NaN。                                                                                   |
| [`reciprocalLattice(cell)`](../../packages/alchemion/src/core/reciprocal.ts)                  | 返回 `ScientificResult<ReciprocalLattice>`，`basis = 2π(A⁻¹)ᵀ`，单位 `angstrom^-1`。                                                                                        |
| [`reciprocalPoint(cell, h)`](../../packages/alchemion/src/core/reciprocal.ts)                 | 输入有限倒易系数三元组 `h`，返回 Å⁻¹ 点坐标的 `ScientificResult<Vec3>`。系数不要求是整数。                                                                                  |
| [`computeBrillouinZone(cell, options?)`](../../packages/alchemion/src/core/brillouin-zone.ts) | 返回 `ScientificResult<BrillouinZone>`，含顶点、外向面、三角化、体积及完备性证书。预算耗尽而未证明完备时以 `BZ_BUDGET` 失败。                                               |

默认成键阈值为 `0.1 Å < distance <= 1.2 × (r_cov(i)+r_cov(j))`，比较容差为 `1e-8 Å`；缺失共价半径会诊断，不伪造科学半径。推断键不代表价态、芳香性或化学结构识别。`inferBonds: false` 仍保留可投影的显式键。

bond cutoff 保留主要单胞所有实例及其直接成键的第一层端点，不递归扩展。允许显示的副本仍由邻胞集合限定。测量直接使用给定显示位置，不应用最小影像约定。

`BrillouinZoneOptions` 的 `maxShell` 默认 `64`，`maxCandidates` 默认 `250000`，均须为正安全整数。`BrillouinZoneFace.vertices` 是顶点索引，面从外看逆时针；`reciprocalIndex` 标识切面格矢，`normal/offset` 定义半空间。`convergence` 给出壳层、候选数、遗漏格矢长度下界和最大顶点半径。

## 超胞与配位分析

整数矩阵超胞、薄层、片段和其他构建器的选项见[建模 API](modeling.md)。

[`createSupercell(snapshot, repetitions)`](../../packages/alchemion/src/core/supercell.ts) 返回 `ScientificResult<SupercellResult>`。`snapshot` 参数为 `StructureSnapshot`，运行时必须为周期源；`repetitions: Vec3` 必须包含三个正安全整数。函数不修改输入、不创建文档历史，按完整源对称生成新的 P1 周期源，独立于 viewer 显示选项。

| `SupercellResult` 字段 | 类型与含义                                                                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `snapshot`             | `PeriodicStructureSnapshot`；新晶胞与全部新原子/键 ID，副本可独立编辑。                                                                  |
| `atomMapping`          | `readonly SupercellAtomMapping[]`；每项为 `{ atomId, source: BondEndpoint, equivalentSources: readonly BondEndpoint[] }`，回溯旧源实例。 |
| `bondMapping`          | `readonly SupercellBondMapping[]`；每项为 `{ bondId, sourceBondId }`，回溯旧显式键。                                                     |

纯函数按确定顺序分配 ID，并避开输入已有 ID；ID 是不透明身份，不以其字符串格式作为 API。`1×1×1` 仍展开对称并分配新身份。已有标签加唯一后缀，缺失标签不补写。显式键保留完整周期边界与键阶，推断键不固化到源；占位与其他坐标无关字段保持原义。结果快照及其来源映射与输入隔离。

新坐标清除旧坐标不确定度并警告；基矢变化时清除旧晶胞不确定度并警告，`1×1×1` 保留未变晶胞测量。`metadata.alchemionSupercell` 包含 `schemaVersion: 1`、`repetitions`、`sourceCell`、解析后的 `sourceSymmetry`、两组映射，以及可选 `parent`；原 metadata 与格式来源保留，不自动改写任意字符串引用。

单次重复单胞数和输出原子数各最多 `100000`。非周期源、非法倍数、超出安全整数或预算、无法映射显式键时返回失败；周期键存在 `stereo` 时以 `SUPERCELL_STEREO_UNSUPPORTED` 失败，周期 `stereoParity` 沿用现有结构校验。构建数学、缺陷与验证边界见[领域规范](../domain.md#超胞与独立缺陷)和 T-DOM-07。

[`analyzeCoordination(snapshot, options)`](../../packages/alchemion/src/core/coordination.ts) 返回 `ScientificResult<CoordinationResult>`，支持周期源及分子源。它只分析显式给定的中心与规则，不修改源、选择或历史。

| 输入类型              | 字段与行为                                                                                                                                                     |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CoordinationOptions` | `centerAtomIds: readonly AtomId[]`、`rules: readonly CoordinationRule[]`；中心去重并稳定排序，缺失 ID 失败。                                                   |
| `CoordinationRule`    | `elements: readonly [string, string]`、可选 `minDistance: number`、必需 `maxDistance: number`；Å 制有限距离，默认最小为 `0`，且 `0 <= min <= max`、`max > 0`。 |

元素对无序且不得重复，元素符号须已知；距离上下界均包含，比较容差为 `1e-8 Å`。无匹配规则的元素对不计邻居，空规则返回空邻域，空中心返回空结果。每个源使用完整对称中心胞中按稳定实例 ID 排序的首个代表，返回具体中心 `AtomInstance`，不采用点击影像或当前显示 cutoff。

`CoordinationResult` 为 `{ centers: readonly CoordinationCenter[], unit: 'angstrom' }`。每个 `CoordinationCenter` 包含 `center: AtomInstance`、`neighbors: readonly CoordinationNeighbor[]`、`coordinationNumber: number` 与可选 `polyhedron: CoordinationPolyhedron`；邻居项为 `{ instance: AtomInstance, distance: number }`，按距离及稳定实例 ID 排序。

| `CoordinationPolyhedron` 字段  | 类型与含义                                                                                                  |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `vertices`                     | `readonly Vec3[]`；Å 笛卡尔顶点。                                                                           |
| `vertexNeighborIndices`        | `readonly (readonly number[])[]`；每个顶点对应当前 `neighbors` 数组的全部邻居下标，保留同位点不同源的映射。 |
| `faces`                        | `readonly (readonly number[])[]`；顶点下标组成的面，从外看逆时针。                                          |
| `triangles`                    | `readonly (readonly [number, number, number])[]`；面内三角化顶点下标。                                      |
| `volume`、`unit`、`volumeUnit` | 体积数值、`'angstrom'` 与 `'angstrom^3'`。                                                                  |

配位数按几何站点计数，不按占位加权；同源不同周期影像可分别计数，不同源重合站点保留，仅排除中心源的同一实际位置。周期邻域按晶胞度量完整搜索，不受显示邻胞或自动成键影响。少于四个非共面位置等退化情况仍返回邻居/CN，省略多面体并给出 `COORDINATION_POLYHEDRON_DEGENERATE` 信息诊断。

每次搜索最多 `100000` 个去重后唯一候选影像，另有 `5000000` 个格点的枚举保护；分别以 `COORDINATION_BUDGET` 或 `COORDINATION_SEARCH_BUDGET` 失败，不返回未标记截断结果。完整几何语义、数值边界及 T-DOM-08 见[领域规范](../domain.md#几何配位与多面体)。浏览器异步执行见[viewer API](viewer.md)。

## 同步编辑事务与历史

[`createDocumentStore(options?)`](../../packages/alchemion/src/core/editing/index.ts) 返回 `DocumentStore`，无需浏览器资源。`DocumentStoreOptions.historyLimit` 默认为 `100`，可为 `0`；非负安全整数之外的值抛出 `RangeError`。

| 方法                      | 结果与行为                                                                                                                          |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `getState()`              | 返回只读 `DocumentState`：可选 `snapshot/documentId`、`revision`、`canUndo/canRedo`。                                               |
| `load(snapshot)`          | 返回 `ScientificResult<DocumentChange>`。复制并验证成功后才接受新源，生成新 documentId、revision 置 `0`、清空历史；失败保留原文档。 |
| `execute(commandOrArray)` | 返回 `ScientificResult<DocumentChange>`。单命令或命令数组构成一个原子事务；整体校验失败时不部分提交。                               |
| `undo()` / `redo()`       | 返回 `ScientificResult<DocumentChange>`；恢复源快照和稳定 ID，revision 递增，无可用历史时 `changed: false`。                        |
| `clear()`                 | 返回 `DocumentChange`，清空源、身份和历史，revision 置 `0`。该方法不使用 `ScientificResult` 包装。                                  |

`DocumentChange` 含 `changed` 和提交后的 `state`。无实际变化的命令不增加历史或 revision；新事务清空 redo；显示选项、相机、测量不属于结构历史。保存的是源结构，无 canvas/Worker 可销毁，因此没有 `dispose` 方法。

`EditCommand` 的全部分支如下：

| `type`                  | 必需字段与作用                                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| `add-atom`              | `atom`：周期源用 `PeriodicAtom`，分子源用 `MolecularAtom`；新 ID 由调用者提供，不得重用该文档曾发出的 ID。 |
| `remove-atom`           | `atomId`；删除源及关联显式键，派生副本由后续计算重建。                                                     |
| `set-element`           | `atomId, element`。                                                                                        |
| `set-position`          | `atomId, position: { frame, value }`；周期可用 `fractional` 或 Å `cartesian`，分子只接受 `cartesian`。     |
| `set-instance-position` | `instance, cartesian, documentId, revision`；按实例逆变换回写源。上下文过期时拒绝 `EDIT_STALE_INSTANCE`。  |
| `set-cell`              | `cell`；仅周期源，保持源分数坐标。若与对称不相容，整个事务失败。                                           |
| `set-symmetry`          | 可选 `symmetry`；仅周期源。可与晶胞变更组成同一事务，例如显式设置 Hall 1；不暗中降为 P1。                  |
| `build-supercell`       | `repetitions: Vec3`；按上述构造替换当前周期源，一次操作对应一次可撤销事务，documentId 保持不变。           |

坐标或晶胞变化会清理不再有效的测量不确定度并诊断；删除立体参照原子会清理失效 parity，undo 可恢复。需要异步计算、订阅或画布时使用[viewer API](viewer.md)中的独立 controller 或 Viewer，它们组合相同事务实现。

构建命令由文档分配新 AtomId/BondId，并记录该文档已发出的 ID。undo 不回退分配状态，redo 恢复已有快照；撤销后再次构建使用新 ID，不复用被撤销构建的身份。失败不会改变公开源、历史或 revision；新 load/clear 才重置文档分配状态。需要构建后继续编辑并保留历史时使用此命令；把纯函数生成的快照交给 `load` 时，仍按 load 契约创建新文档并清空历史。

## 公开类型索引

下表列出此入口的全部公开类型；未列入[入口](../../packages/alchemion/src/core/index.ts)的内部辅助函数和类型不属于 API。

| 声明来源                                                                                                            | 导出类型                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [基本模型](../../packages/alchemion/src/core/types.ts)                                                              | `Vec3`、`Matrix3`、`AtomId`、`BondId`、`SymmetryOperationId`、`JsonValue`、`DiagnosticContext`、`Diagnostic`、`ScientificResult`、`Provenance`、`ScientificValue`。            |
| [晶胞、对称模型](../../packages/alchemion/src/core/types.ts)                                                        | `CellParameters`、`Cell`、`Rational`、`SymmetryOperation`、`SpaceGroupIdentifier`、`SymmetryInformation`。                                                                     |
| [源模型](../../packages/alchemion/src/core/types.ts)                                                                | `AtomProperties`、`PeriodicAtom`、`MolecularAtom`、`BondEndpoint`、`BondOrder`、`SourceBond`、`PeriodicStructureSnapshot`、`MolecularStructureSnapshot`、`StructureSnapshot`。 |
| [派生模型](../../packages/alchemion/src/core/types.ts)                                                              | `AtomInstance`、`DerivedBond`、`DerivedStructure`。                                                                                                                            |
| [数据记录](../../packages/alchemion/src/core/data/types.ts)                                                         | `ElementRecord`、`SpaceGroupSetting`。                                                                                                                                         |
| [对称结果](../../packages/alchemion/src/core/symmetry.ts)                                                           | `EndpointPosition`。                                                                                                                                                           |
| [实例选项](../../packages/alchemion/src/core/derivation.ts)、[派生选项](../../packages/alchemion/src/core/bonds.ts) | `InstanceOptions`、`DerivationOptions`。                                                                                                                                       |
| [测量](../../packages/alchemion/src/core/measurements.ts)、[倒易](../../packages/alchemion/src/core/reciprocal.ts)  | `Measurement`、`ReciprocalLattice`。                                                                                                                                           |
| [BZ](../../packages/alchemion/src/core/brillouin-zone.ts)                                                           | `BrillouinZone`、`BrillouinZoneFace`、`BrillouinZoneOptions`。                                                                                                                 |
| [编辑](../../packages/alchemion/src/core/editing/index.ts)                                                          | `EditCommand`、`DocumentStore`、`DocumentStoreOptions`、`DocumentState`、`DocumentChange`。                                                                                    |
| [超胞](../../packages/alchemion/src/core/supercell.ts)                                                              | `SupercellResult`、`SupercellAtomMapping`、`SupercellBondMapping`。                                                                                                            |
| [配位](../../packages/alchemion/src/core/coordination.ts)                                                           | `CoordinationRule`、`CoordinationOptions`、`CoordinationNeighbor`、`CoordinationPolyhedron`、`CoordinationCenter`、`CoordinationResult`。                                      |
