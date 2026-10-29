# 数据、样例与规范来源台账

观察日期：2026-10-29。历史基准：`06784cf0a61d09c76906086bebac773459f5b33d`。M3 已在线核对正式科学表的固定版本、原始字节和许可，并用独立检查验证；历史格式/显示资产仍按表中负责阶段处理。“待核实”不能写成已授权或已完成科学验证。

本台账服务 R-022 / T-DATA-01。领域公式与语义归 [domain.md](domain.md)，格式支持范围归 [product.md](product.md)。根 [MIT License](../LICENSE) 的存在不证明所有内嵌数据均由项目作者创作。

## 当前资产登记

| 来源 ID | 仓库资产                                                                                                                                                    | 已知来源证据与状态                                                                                                                                                                                                                                                                                   | 后续动作                                                                                                                   |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| D-001   | [M3 元素表](../packages/alchemion/src/core/data/elements.ts)；[历史表](../packages/alchemion/src/internal/legacy/elements/elements.ts)                      | 正式表替换为 periodictable 2.0.2 的118元素、质量和96个Cordero共价半径；来源文件明确public domain。缺失半径不补值，代表同位素质量单独标识。源版本/散列/转换见随包manifest；M3数据测试通过。历史表仍未核实，隔离供旧viewer/formats使用。                                                               | M4/M5迁移时删除失去消费者的历史表；M6核对最终tarball不再携带旧表。                                                         |
| D-002   | [已删除键价表的历史提交](https://github.com/SofiaXu/alchemion/blob/3ab8d6f/packages/alchemion/src/core/elements/bvparm.ts)                                  | M3全仓检索确认没有消费者；已删除数据、公开导出和会覆盖价态参数的Map。未核实再分发条件，不作为新版数据或功能。                                                                                                                                                                                        | 不新增键价计算产品能力；若未来提出该功能，重新核验来源与多参数语义。                                                       |
| D-003   | [M3 setting 表](../packages/alchemion/src/core/data/space-groups.ts)；[历史表](../packages/alchemion/src/internal/legacy/structure/space-group-settings.ts) | 正式表来自spglib 2.6.0、BSD 3-Clause：Hall1–530、IT1–230、7388操作。旋转列存储，平移精确有理化往返误差0；全部setting独立整数群闭合/逆元检查通过。历史表来源仍待核实。                                                                                                                                | M4改用正式setting解析后删除旧表；不得由IT号猜setting。                                                                     |
| D-004   | [1010541.cif](../apps/demo/public/1010541.cif)                                                                                                              | 文件头称来自 COD，revision `202022`（2017-10-15），并声明 contributors 将数据置于 public domain。内含 Bragg, W. L.，1926，DOI `10.1098/rspa.1926.0088`。这是本地文件头声明，未在线核实。                                                                                                             | M4：核对 COD 记录和原文信息，保留数据头和文献引用；登记下载/核验日期及内容散列。                                           |
| D-005   | [9002807.cif](../apps/demo/public/9002807.cif) 和 [测试副本](../packages/alchemion/src/formats/parsers/cif-parser/__tests__/test-data/9002807.cif)          | 文件头称来自 COD/AMCSD，revision `282068`（2023-03-26）；要求对原论文适当署名。内含 Yamanaka, T.; Hirai, M.; Komatsu, Y.，2002，American Mineralogist 87，1183–1189，题名 `Structure change of Ca1-xSrxTiO3 perovskite with composition and pressure`。不能仅因存于 COD 就改记为 MIT/public domain。 | M4：核实来源与使用条件，保留完整引用；比较两个副本散列并消除无必要重复。demo 如展示该样例，应提供来源入口。                |
| D-006   | [C8H10N4O2.mol](../apps/demo/public/C8H10N4O2.mol)                                                                                                          | V2000 文件；头部含程序标识，未见可确认的下载来源、作者或许可。待核实。                                                                                                                                                                                                                               | M4：追查来源；不能确认时以项目自行构造、可公开分发的合成分子 fixture 替换。不可仅凭分子式推断来源。                        |
| D-007   | [CIF 语法 fixtures](../packages/alchemion/src/formats/parsers/cif-parser/__tests__/test-data)                                                               | 目录共 19 个 CIF 文件，包含 D-005 及空白、注释、引号、loop、CIF1/2、Unicode、列表、表和容器样例；其余样例没有集中出处说明。待核实。                                                                                                                                                                  | M4：按文件确认自产/第三方来源与许可。未知来源的小型语法用例可按规范重新独立编写，保留覆盖意图，不继承未经验证的旧断言。    |
| D-008   | [CIF JSON schema](../packages/alchemion/src/formats/parsers/cif-parser/schema.json)                                                                         | 文件声明 JSON Schema draft-06，并含 `http://www.iucr.org/resources/cif/cif-json.json` 标识；标识本身不证明版本、许可或与实际解析器一致。待核实。                                                                                                                                                     | M4：核实原始 schema 与使用方式；未使用时移除运行依赖或作为有来源的参考资产。不能将该 schema 当成 CIF 文本完整合规证明。    |
| D-009   | [M1合成宿主](../tests/host/main.ts) 和 [M2图形夹具](../tests/renderer-selection/fixture.ts)                                                                 | M1自编正交胞碳CIF及128原子网格；M2自编间距3Å的25×20×20格点、20,000键、球24×16/封口圆柱16段、固定配色/相机/更新序列；无随机数或外部数据，项目MIT。仅作工程/渲染验证，不是科学oracle。                                                                                                                 | M1工程与M2[实测](evidence/m2-renderer-selection.md)已验证；正式科学参考和数据核验仍由M3/M4完成。                           |
| D-010   | [原子配色表](../packages/alchemion/src/internal/legacy/colors/index.ts)                                                                                     | 按元素索引存储颜色，未见配色方案名称、来源版本或许可说明；不能从颜色相似性推断属于某个公开色表。待核实。                                                                                                                                                                                             | M5：确认实际采用的默认方案、来源和许可；无法核实时独立定义并说明项目默认配色，消费者仍可自定义，不能冒称兼容特定外部方案。 |

## 核验记录格式

负责阶段应直接更新上表，补充可复查的证据记录。每项至少包含：资产路径与用途；原始作者/机构与一手来源 URL；来源版本、记录 ID 或获取日期；明确的许可文本及署名条件；仓库文件 SHA-256；原始数据到本地格式的转换；科学校验方法；状态及核验日期。

同源副本引用相同来源 ID，分别记录散列与用途。数据经过筛选、修正或重排时保留转换依据，不把改过的数据伪装为原始下载。不要把网页截图、搜索摘要或推断当成许可证明。

## 一手规范核验入口

M0 规划时已查阅 CIF、CTfile 和 POSCAR 的一手规范入口，用于定义目标支持范围；尚未执行格式合规测试，也未在线核实上表资产的来源与许可。实施时应核对实际采用的规范版本、条目及获取日期。

| 规范/来源     | 官方入口                                                                                                  | 用途与负责阶段                                                                                                      |
| ------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| IUCr CIF      | [CIF 官方规范](https://www.iucr.org/what-we-do/digital-standards/cif/specification)                       | M3/M4：CIF1/2 语法、核心字典、缺失/未知值及晶体字段含义。                                                           |
| BIOVIA CTfile | [CTfile Formats 2020](https://discover.3ds.com/sites/default/files/2020-08/biovia_ctfileformats_2020.pdf) | M4：以此已查阅版本为规范基准，核对 MOL V2000/V3000 结构、计数、键、属性与不支持特性的诊断；若改用新规范须登记差异。 |
| VASP POSCAR   | [VASP Wiki：POSCAR](https://vasp.at/wiki/POSCAR)                                                          | M4：周期晶胞、比例因子、Direct/Cartesian 与物种/计数顺序。                                                          |
| COD           | [Crystallography Open Database](https://www.crystallography.net/cod/)                                     | M4：核对 D-004/D-005 的记录、原始引用及实际使用条件。                                                               |

M3 已采用的科学数据选择见 [ADR 0003](decisions/0003-scientific-core.md)。旧内部表仍保留原待核实状态，不将新版表的来源追认给旧数据。

## 交付关卡

- M0 交付来源缺口的真实清单，允许存在明确标记的待核实项，不宣称已完成授权审查。
- M1 可以为历史基线进行本地机械搬迁与验证，但不能将搬迁后的数据标成新版已审核数据。
- M3–M5 按上表负责阶段，为进入科学核心、格式测试、默认配色和演示样例的资产完成核验或有证据的替换；数据预期值还需独立科学测试，来源可信不等于实现正确。
- M6 检查正式 tarball、demo 静态资源和 tests 中实际携带的所有数据。进入分发的资产必须有可确认的来源和使用条件，并带必要署名；不满足的资产应替换或排除，不能默认为 MIT，也不能通过删除台账条目掩盖缺口。
- 验证统一使用 T-DATA-01，结果和证据记入相应执行计划。发布到外部服务是单独动作，M6 分发验收不等于已经发布。

## M3 核验记录（2026-10-29）

固定上游文件、原始字节 SHA-256、输出规范化 UTF-8/LF 散列、7388操作计数和转换策略集中保存在 [随包manifest](../packages/alchemion/SCIENTIFIC_DATA_MANIFEST.json)，许可全文/作者/论文引用在 [第三方声明](../packages/alchemion/THIRD_PARTY_NOTICES.md)。两个声明均加入SDK的files白名单；实际tarball结果见阶段报告。

[生成程序](../scripts/scientific-data/generate.py) 使用Python3.12.10、periodictable2.0.2和spglib2.6.0，仅执行一次且退出0；源文件六项均按固定tag与SHA校验。共价半径来自Cordero2008，C取sp3、Mn/Fe/Co取低自旋，97–118缺失。质量保留CIAAW2021与AME2020出处及类型；不迁入无来源的价态/电负性或旧单向成键白名单。

新增D-011：[独立科学参考](evidence/m3-scientific-reference.md)、自编解析点/网格与[生成程序](../scripts/scientific-reference.py)为项目MIT。NumPy2.2.6/SciPy1.15.3只参与开发参考生成；固定输入和结果已入库，不进入SDK运行依赖。科学数据测试3项及其余core测试共57项首轮通过；这不表示历史样例、配色、格式语义或完整分发的T-DATA-01已完成。
