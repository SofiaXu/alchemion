# formats API

`alchemion/formats` 提供文本与科学源结构之间的转换，以及由调用者提供文本的计算结果解析。[公开入口](../../packages/alchemion/src/formats/index.ts)的声明为完整签名，科学字段的支持范围以[产品格式矩阵](../product.md)为准，单位和身份规则见[领域规范](../domain.md)。

```ts
import {
  parseStructure,
  writeStructure,
  parseCifDocument,
  writeCifDocument,
  parseCalculationResult,
  parseNebImages
} from 'alchemion/formats'
import type { ParseOptions, WriteOptions } from 'alchemion/formats'
```

## 结构读写

| 函数                                                                                 | 参数与结果                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`parseStructure(text, options)`](../../packages/alchemion/src/formats/index.ts)     | 输入文本及必需的 `ParseOptions`，返回 `ParseResult`：可选 `structure`、必有 `diagnostics`，CIF 需要选择时另有 `candidates`。只接受显式 `format: 'cif' \| 'mol' \| 'poscar'`，不按扩展名猜格式。 |
| [`writeStructure(snapshot, options)`](../../packages/alchemion/src/formats/index.ts) | 输入 `StructureSnapshot` 及必需的 `WriteOptions`，返回 `WriteResult`，含可选 `text`、必有 `diagnostics`、适用时的 `atomMapping` 和 POSCAR 凭据。写出前先验证源结构。                            |

这些函数不返回 `ScientificResult`；先检查 `structure` 或 `text` 是否存在，再使用结果。失败由 error 诊断说明，成功也可能有 warning/info。`Diagnostic` 类型从 `alchemion/core` 导入，包含严重级别、稳定代码、说明、上下文及可用的行列定位。宿主负责呈现诊断，不能只把所有结果都当成字符串。

```ts
const parsed = parseStructure(inputText, { format: 'cif', block: { index: 0 } })
if (parsed.structure) {
  const written = writeStructure(parsed.structure, { format: 'cif', version: '2' })
  console.log(written.text, written.diagnostics)
} else {
  console.log(parsed.diagnostics, parsed.candidates)
}
```

### 读取选项

选项及结果声明见[contracts.ts](../../packages/alchemion/src/formats/contracts.ts)。

| 类型                 | 字段与行为                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `CifParseOptions`    | `{ format: 'cif', block?: BlockSelector }`。                                                                             |
| `BlockSelector`      | `{ name: string }` 或 `{ index: number }`；索引从 `0` 开始。                                                             |
| `MolParseOptions`    | `{ format: 'mol' }`；文本中的 V2000/V3000 标记决定记录版本。                                                             |
| `PoscarParseOptions` | `{ format: 'poscar' }`；读取具有明确元素行的 VASP5 基础几何。                                                            |
| `ParseOptions`       | 上述三种选项的判别联合。                                                                                                 |
| `ParseResult`        | `{ structure?, diagnostics, candidates? }`，`candidates` 为 `{ name, index }` 数组。没有有效源结构时不提供 `structure`。 |

CIF 恰有一个 block 时可省略选择；多个 block 而未选择时返回候选和选择错误，不默读第一项。空文档、重复 block 名、未知选择、所选 block 缺失有效晶胞或必需坐标都会诊断。结构映射要求周期晶体字段；任意 CIF 文档不一定能映射为结构。

CIF2 按标准 `#\#CIF_2.0` 标识识别；没有该标识时按 CIF1.1 校验，不因 Unicode 或扩展名自动升级。支持晶胞、分数或可转换笛卡尔坐标、标签/元素/占位、等方 U/B、空间群/显式操作及已建模不确定度。两组坐标同时存在时须一致。`.` 与 `?` 保持不同。完整标签及同义字段列表见[产品规范](../product.md)。

MOL 读取单个分子的 V2000 或 V3000，包括元素、Å 坐标、电荷、同位素、自由基、映射号、支持的键阶与显式立体标志。查询、反应、聚合物/Sgroup、R-group 和增强立体分组不在模型范围，遇到不支持的科学构造会诊断，不静默降成普通原子或单键。

### POSCAR 导入

通过 `parseStructure(text, { format: 'poscar' })` 读取 VASP5 元素行、数量及基础晶体几何。缩放规则依据 [VASP POSCAR 规范](https://vasp.at/wiki/POSCAR)：单个正数统一缩放；单个负数表示目标体积，由未缩放晶胞求实际正缩放因子；三个正数分别缩放基矢的 x/y/z 笛卡尔分量。最终晶胞仍须满足领域规范的有限、右手、非退化要求。

坐标模式接受以 `D/d` 开始的 Direct 和以 `C/c/K/k` 开始的 Cartesian。Direct 分数坐标不受缩放因子再次缩放，也不自动折回晶胞；Cartesian 位置使用相同的统一或分量缩放，再通过 core 的唯一坐标实现转为分数坐标。元素与数量行一一对应，数量为非负安全整数且总数大于零；只接受已知元素符号，不截断元素别名，也不从标题或外部 POTCAR 猜测元素。

导入按文件记录顺序分配 `poscar:atom:1` 等源 ID，保留标题，设置已知满占位；不推断空间群、不创建显式键。坐标后可有一个与所属元素一致的标签；数值行支持 `!`/`#` 行内注释。科学数值必须有限，支持普通十进制及 `e/E/d/D` 指数。

启用 Selective Dynamics 后，每条坐标记录必须包含三个 `T`／`F` 标志，对应 `PeriodicAtom.movable`。标志使用 Direct 方向，即使坐标行采用 Cartesian。离子／晶格速度、CONTCAR predictor-corrector、无元素行的 VASP4、未知科学尾段或非法输入返回带行列定位的错误。

| 诊断代码                                                                                      | 含义                                     |
| --------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `POSCAR_SCALE`、`POSCAR_LATTICE`、`POSCAR_CELL`                                               | 缩放或晶胞非法。                         |
| `POSCAR_SPECIES_REQUIRED`、`POSCAR_ELEMENT`、`POSCAR_COUNTS`                                  | 缺少元素、元素无法识别或数量不合法。     |
| `POSCAR_COORDINATE_MODE`、`POSCAR_COORDINATE`、`POSCAR_COORDINATE_FIELDS`、`POSCAR_TRUNCATED` | 坐标模式、数值、额外字段或记录数量错误。 |
| `POSCAR_SELECTIVE_FLAGS`                                                                      | 移动标志数量或字面值非法。               |
| `POSCAR_LATTICE_VELOCITIES_UNSUPPORTED`、`POSCAR_TRAILING_DATA_UNSUPPORTED`                   | 晶格速度或其他额外非空尾段无法表达。     |

### 写出选项

| 类型                 | 字段与默认值                                                                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `CifWriteOptions`    | `{ format: 'cif', version: '1' \| '2', allowLoss?: boolean }`；版本必须显式选择。                                       |
| `MolWriteOptions`    | `{ format: 'mol', version?: 'V2000' \| 'V3000', allowLoss?: boolean, finite?: MolFiniteSelection }`；版本默认 `V3000`。 |
| `PoscarWriteOptions` | `{ format: 'poscar', allowLoss?: boolean }`。                                                                           |
| `WriteOptions`       | 上述三种选项的判别联合。                                                                                                |
| `WriteResult`        | `{ text?, diagnostics, atomMapping?, poscarReceipt? }`；只有实际生成的文本才出现在 `text` 中。                          |

CIF1/2 输出都以结构模型重新序列化，CIF2 输出带标准版本标识。MOL 不自动从 V2000 切换 V3000，不拆分或截断超限数据；V2000 原子和键各不超过 999，其他字段也必须可表示。CIF 结构编解码不承诺任意原文、未知字典或注释的无损编辑。

POSCAR 仅输出有有效晶胞且非空的周期源。采用 VASP5 元素名/数量行、缩放因子 `1.0`、`Direct` 分数坐标，元素分组按源原子中首次出现顺序，组内保留原顺序。它不自动展开显示实例、不造真空晶胞、不接受部分或未知占位；输出可由上述导入接口重新读取，源 ID 不写入 POSCAR 文件。

存在显式移动标志时，POSCAR 为分组后的每个原子写出对应标志，缺省项写成 `T T T`。CIF 和有限 MOL 对不能表达的移动约束走科学损失确认。MOL 能存储聚合物的展开拓扑，单元配方以 `MOL_POLYMER_RECIPE_LOSS` 诊断。

成功写出 POSCAR 时，`poscarReceipt` 包含 `version: 1`、实际写出的晶胞，以及每行的一基 `fileAtomNumber`、源 `atomId`、元素和分数坐标。宿主可把凭据作为独立 JSON 与 POSCAR 一起保存，供计算结果配准使用。没有显式对称信息的周期源也提供以恒等端点表示的 `atomMapping`。

## 计算结果读入

`parseCalculationResult(text, options)` 和 `parseNebImages(images)` 返回 `ScientificResult<CalculationResult>`。调用者显式选择格式，可附文件名；文本按 UTF-8 计算 SHA-256，已对原始字节求散列的调用者可提供小写十六进制 `sha256`。结果和诊断含可用的文件、字段或行列信息。浏览器宿主可通过 [viewer 的结果入口](viewer.md)处理大文件和结果配准。

| `CalculationParseOptions.format` | 当前子集                                                                                                                                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chg`、`chgcar`                  | 一份 VASP5 几何，周期 FFT 网格的总密度和可选的共线自旋差。CHGCAR 按声明长度跳过 PAW 增广占据块。样本按 x 最快顺序存储，除以晶胞体积，单位 Å⁻³。                                                         |
| `locpot`                         | 一份 VASP5 几何和一个周期标量电势网格，保留 eV 数值。                                                                                                                                                   |
| `cube`                           | 单个标量或单轨道数据集，正的 Bohr 网格计数，外层 x、中层 y、内层 z。几何从 Bohr 转为 Å，数组改为 x 最快顺序，数值保留调用者明确提供的 `quantity` 和 `unit`。                                            |
| `contcar`                        | VASP5 基础几何和 Selective Dynamics，沿用 [POSCAR 导入契约](#poscar-导入)。                                                                                                                             |
| `xdatcar`                        | 固定晶胞、显式元素和编号递增的 Direct 帧。保留原分数坐标，步号来自文件。                                                                                                                                |
| `vasprun`                        | 显式初始与逐步结构、离子步 TOTEN、同帧力、带线模式 k 路径的本征能，以及同一电子记录中的总 DOS、投影 DOS 和文件报告的费米能。`path` 可给每个文件 k 点提供可选 `label` 和 `breakBefore`，条目数量须匹配。 |
| `outcar`                         | 由元素、晶胞和位置凭据识别的结构，末步力、`LORBIT` 投影电子布居和磁矩，以及 Γ 点振动模式。矢量磁矩要求可核对的 SAXIS 变换。可传 `reference` 核对文件中至少一个帧的元素顺序、晶胞和位置。                |
| `alchemion-result`               | 版本 1 结果 JSON，保留原结果身份和来源并追加该 JSON 文件的来源。网格 `values` 使用普通 JSON 数组。                                                                                                      |

`parseNebImages` 接收至少两条 `NebImageInput`，每条提供唯一非负整数 `image`、`text`、可选 `name` 和已知时的 `energyEv`。按图像编号排序，检查文件元素顺序与固定晶胞，并保留原文件的分数位置和移动标志。能量解释为对应几何的 VASP TOTEN。

是否正常终止和是否收敛分别呈现。导入器只用文件的明确报告填入对应状态，缺少证据时为 `unknown`。配准由结果消费者使用源凭据和显式映射完成。

## 科学损失与有限 MOL

所有结构 writer 的 `allowLoss` 默认 `false`。显式科学信息无法表达时以 error 阻止输出；调用者明确接受该次损失后可传 `true`，输出仍保留逐项 warning。标题或注释等非科学注记的省略可以 warning 但不阻塞。读取时记录的未映射科学信息在后续编辑和写出中仍会参与损失诊断。

`allowLoss` 只接受布尔值，格式 API 不保存用户确认或修订状态。宿主须把确认绑定到当前源结构和写出选项；源或选项变化后重新检查。writer 可能在前置错误处停止，不能把首个错误当成完整损失清单。[demo](../demo.md)会在不暴露生成文本的预检中补全可发现的损失，再允许接受。

接受损失不能绕过硬性前提。例如没有晶胞的 POSCAR、非满占位的 POSCAR、超出 V2000 限制的数据、缺失周期 MOL 有限选择、无效端点等仍然失败。SDK 没有额外的“强制输出”接口。推断键和显示实例是可重算派生结果，不自动写回源文件。

周期源写 MOL 必须显式传入 `MolFiniteSelection`：

| 选择                               | 输入及输出含义                                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `{ kind: 'source', atomIds }`      | 选择有限源原子，按源分数位置转换成 Å，不自动展开对称或邻胞。                                                  |
| `{ kind: 'instances', endpoints }` | 选择有限显示端点，`endpoints` 是 `BondEndpoint[]`，由源原子、操作和整数平移重算位置，不信任缓存的 mesh 坐标。 |

选择必须非空且有效，同一物理实例不能重复。输出只保留有限集合可表达的显式键；截断边界键、晶胞、周期性、空间群及其他不可表达信息列入损失。分子源可省略 `finite`，表示整个分子。

MOL 的 `WriteResult.atomMapping` 为 `ExportAtomMapping[]`。每项包含从 `1` 开始的 `fileAtomNumber`、导出原子 `exportAtomId`，以及完整源 `source: BondEndpoint`。它让文件记录回溯有限选择的源，不能用文件序号冒充源 ID。有限转换的实现见[finite.ts](../../packages/alchemion/src/formats/mol/finite.ts)。

## CIF 文档层

结构层处理科学模型，文档层处理 CIF 语法树。文档层可以读取全部 block、save frame、item、loop 和 CIF2 列表/表；成功解析不代表已理解完整 mmCIF/DDLm 字典。

| 函数                                                                                           | 参数与结果                                                                                                                 |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [`parseCifDocument(text)`](../../packages/alchemion/src/formats/cif/document.ts)               | 返回 `CifDocumentResult`：可选 `document` 和必有 `diagnostics`。返回全部 block，不要求选择或晶体字段齐全。                 |
| [`writeCifDocument(document, options?)`](../../packages/alchemion/src/formats/cif/document.ts) | 选项是 `{ version?: CifVersion }`，默认沿用 `document.version`；返回 `WriteResult`。目标版本不支持的值会失败，不静默降级。 |

文档序列化保留 AST 表达的语义，重新选择空白及引号；注释和原始排版不在 AST 中，不承诺逐字往返。标量在文档层保持词法值，由结构字段映射解释科学含义。

## 公开类型索引

| 声明来源                                                              | 导出类型及作用                                                                                     |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [读选项](../../packages/alchemion/src/formats/contracts.ts)           | `BlockSelector`、`CifParseOptions`、`MolParseOptions`、`PoscarParseOptions`、`ParseOptions`。      |
| [写选项](../../packages/alchemion/src/formats/contracts.ts)           | `CifWriteOptions`、`MolFiniteSelection`、`MolWriteOptions`、`PoscarWriteOptions`、`WriteOptions`。 |
| [结果](../../packages/alchemion/src/formats/contracts.ts)             | `ParseResult`、`ExportAtomMapping`、`WriteResult`。                                                |
| [结果导入](../../packages/alchemion/src/formats/calculation/index.ts) | `CalculationParseOptions`、`NebImageInput`，结果和 POSCAR 凭据类型来自 `alchemion/core`。          |
| [文档版本与位置](../../packages/alchemion/src/formats/cif/types.ts)   | `CifVersion`（`'1' \| '2'`）、`CifLocation`（行列及可选 offset）。                                 |
| [文档值和条目](../../packages/alchemion/src/formats/cif/types.ts)     | `CifValue`（scalar、unknown、not-applicable、list、table）、`CifTag`、`CifEntry`（item 或 loop）。 |
| [文档容器与结果](../../packages/alchemion/src/formats/cif/types.ts)   | `CifSaveFrame`、`CifDataBlock`、`CifDocument`、`CifDocumentResult`。                               |

`parseCifStructure`、`writeCifStructure`、MOL/POSCAR 专用实现和有限转换辅助函数不从正式子路径公开；通过统一入口调用，避免深层导入。
