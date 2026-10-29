# 数据、样例与规范来源台账

观察日期：2026-10-29，Asia/Hong_Kong。历史基准 `06784cf`；M4入口 `560e41e`。来源核验与科学验证分别记录，实际通过情况见各阶段证据。根MIT许可不能替第三方资产追认来源。

## 当前资产与历史处置

| 来源ID | 资产与依据                                                                                                                                                                                   | 状态与后续                                                                                                                                         |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-001  | [正式元素表](../packages/alchemion/src/core/data/elements.ts)：periodictable2.0.2、118元素、96个Cordero半径；public domain。                                                                 | M3已核验。历史元素表仍仅供旧viewer，M5/M6移除；不将新表许可追认给旧表。                                                                            |
| D-002  | [已删除的旧键价表](https://github.com/SofiaXu/alchemion/blob/3ab8d6f/packages/alchemion/src/core/elements/bvparm.ts)。                                                                       | M3确认无消费者后移除，不新增键价能力。                                                                                                             |
| D-003  | [正式setting表](../packages/alchemion/src/core/data/space-groups.ts)：spglib2.6.0，BSD3-Clause，530 Hall/230 IT/7388操作。                                                                   | M3科学核验有效。M4删除失去消费者的历史操作数组，仅保留旧viewer所需CrystalSystem枚举；不由IT号猜setting。                                           |
| D-004  | [历史1010541.cif](https://github.com/SofiaXu/alchemion/blob/560e41e/apps/demo/public/1010541.cif)：文件头COD revision202022、Bragg1926，DOI10.1098/rspa.1926.0088。                          | M4删除未再使用的静态文件；保留这条历史登记，不宣称在线授权核验完成。重新引入须核查原记录和散列。                                                   |
| D-005  | [历史9002807.cif](https://github.com/SofiaXu/alchemion/blob/560e41e/apps/demo/public/9002807.cif)：COD/AMCSD revision282068，Yamanaka/Hirai/Komatsu2002，American Mineralogist87:1183–1189。 | M4删除静态文件及旧测试副本，使用自产输入替换；不把COD收录等同MIT或public domain。                                                                  |
| D-006  | [历史咖啡因MOL](https://github.com/SofiaXu/alchemion/blob/560e41e/apps/demo/public/C8H10N4O2.mol)。                                                                                          | 原下载来源/许可无法由本地文件确认；M4随失去消费者的旧资产移除，改用项目自行构造的分子，不推断原文件作者。                                          |
| D-007  | [新版CIF实现及测试](../packages/alchemion/src/formats/cif/index.ts)。                                                                                                                        | M4按IUCr规范独立编写小样例，项目MIT；替换无集中来源的旧19个CIF样例，不继承旧错误断言。                                                             |
| D-008  | [历史CIF JSON schema](https://github.com/SofiaXu/alchemion/blob/560e41e/packages/alchemion/src/formats/parsers/cif-parser/schema.json)。                                                     | 无运行消费者，M4随旧parser移除；不据schema标识推断许可或文本合规性。                                                                               |
| D-009  | [旧宿主自产输入](../tests/host/legacy-fixture.ts)、[暂存demo输入](../apps/demo/src/legacy-fixture.ts)、[M2图形夹具](../tests/renderer-selection/fixture.ts)。                                | 项目MIT，自编确定输入；工程/图形检查资产，不是独立科学oracle。M4不把旧viewer加载计入新viewer验收。                                                 |
| D-010  | [历史配色表](../packages/alchemion/src/internal/legacy/colors/index.ts)。                                                                                                                    | 来源仍待核实，M5确认或独立定义默认配色，M6核对分发。                                                                                               |
| D-011  | [M3独立参考](evidence/m3-scientific-reference.md)及生成程序。                                                                                                                                | 项目MIT，NumPy2.2.6/SciPy1.15.3只供开发，保留已测数据与证据，本阶段不重复生成。                                                                    |
| D-012  | [Unicode16.0.0来源记录](../packages/alchemion/src/formats/cif/unicode-source.json)、[许可](../packages/alchemion/src/formats/cif/UNICODE-LICENSE.txt)。                                      | 1557条C+F casefold映射，NFD前后归一，用于CIF2名称比较。官方原字节SHA及许可SHA保存在来源记录；分发表SHA由构建写入FORMAT_DATA_MANIFEST.json。        |
| D-013  | [RDKit参考质量数](../packages/alchemion/src/formats/mol/reference-isotopes.json)、[BSD许可](../packages/alchemion/src/formats/mol/RDKIT_LICENSE.txt)。                                       | 固定Release_2025_09_6 atomic_data.cpp的reference mass-number列，只作CTfile编码参考，不取代core平均原子量。源SHA/许可SHA在JSON，输出SHA随构建分发。 |
| D-014  | [MOL/POSCAR测试](../packages/alchemion/src/formats/mol/index.ts)、[一次性代表输出生成](../scripts/m4-mol-fixtures.mjs)。                                                                     | 项目自行构造，MIT；输入真值显式声明，预期不由生产reader反向生成。CIF使用对应自产生成程序和独立工具核对。                                           |

## 一手规范与工具

- [IUCr CIF规范](https://www.iucr.org/what-we-do/digital-standards/cif/specification)及[CIF2正式规范](https://journals.iucr.org/j/issues/2016/01/00/aj5269/)决定文档语法；结构字段范围见[产品](product.md)。
- [BIOVIA CTfile2020](https://discover.3ds.com/sites/default/files/2020-08/biovia_ctfileformats_2020.pdf)决定MOL记录/属性/表示限制。
- [VASP POSCAR](https://vasp.at/wiki/POSCAR)决定比例因子、基矢、物种分组和Direct坐标。
- [Unicode固定输入](https://unicode.org/Public/16.0.0/ucd/CaseFolding.txt)原字节SHA256为`6f1f9c588eb4a5c718d9e8f93b782685e5c7fec872cf05e8e6878053599e09bb`。
- [RDKit固定输入](https://raw.githubusercontent.com/rdkit/rdkit/Release_2025_09_6/Code/GraphMol/atomic_data.cpp)原字节SHA256为`7f9cee6e430b60d303a0a7fa9e33c45e5c529ee204f86afeab6a20f68b6b0631`。

M4独立环境固定Python3.12.10、PyCifRW5.0.1、NumPy2.2.6、SciPy1.15.3、RDKit2025.9.6、ASE3.26.0及openbabel-wheel3.1.1.23，见[requirements](../scripts/m4-reference-requirements.txt)。后者运行时版本字符串为3.1.0，包装版本和实际字符串同时记录；只为RDKit合并singlet/triplet的参考信息缺口补充spin multiplicity核验。工具不进入SDK依赖，用户文件不上传外部服务；安装成功不等同格式验证通过。

## 分发与验证记录

M3原始输入/输出散列、计数及转换保持在[科学manifest](../packages/alchemion/SCIENTIFIC_DATA_MANIFEST.json)，不因M4重生成。M4构建另生成`dist/FORMAT_DATA_MANIFEST.json`，记录两个新格式数据集、许可证和分发表的SHA；[第三方声明](../packages/alchemion/THIRD_PARTY_NOTICES.md)携带完整许可。两者随真实SDK tarball核对。

T-DATA-01的实际结果归阶段报告。未确认的历史配色/元素资产继续由M5/M6处理，不能把本阶段来源登记写成完整产品授权关卡通过。M6须核对最终tarball与demo静态资源；未来重新引入已移除文件时，重新核查来源、使用条件和署名。
