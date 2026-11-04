# 数据、样例与规范来源

本文登记当前使用和分发的科学数据、格式数据、样例及独立参考。项目代码与自产输入使用 MIT；第三方资产遵守各自许可，根 MIT 不能替代第三方许可。科学语义见[领域规范](domain.md)，独立核验方法见[质量规范](quality.md)。

## 当前资产

来源 ID 保持稳定，表中只列现有资产。新增或替换数据时登记固定版本、原始字节/许可散列、必要转换、输出散列和用途，不凭来源名称推断授权或科学准确性。

| 来源 ID | 资产与固定来源                                                                                                                                                        | 转换、许可与边界                                                                                                                                                                                       |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D-001   | [元素/质量/共价半径](../packages/alchemion/src/core/data/elements.ts)，periodictable 2.0.2；118元素、96个 Cordero 2008 半径。                                         | 上游相关文件声明 public domain。半径单位 Å，C取sp3，Mn/Fe/Co取低自旋，97–118缺失；质量区分标准原子量与代表同位素。源/转换/输出见[科学 manifest](../packages/alchemion/SCIENTIFIC_DATA_MANIFEST.json)。 |
| D-003   | [空间群 setting](../packages/alchemion/src/core/data/space-groups.ts)，spglib 2.6.0；530 Hall setting、230 IT号、7388操作。                                           | BSD 3-Clause。整数旋转按 SDK 列向量存储，平移经误差检查后转为精确约分有理数，保留上游顺序；不由 IT号猜 setting。完整许可见[第三方声明](../packages/alchemion/THIRD_PARTY_NOTICES.md)。                 |
| D-007   | [CIF 实现与自产测试](../packages/alchemion/src/formats/cif/index.ts)。                                                                                                | 按 IUCr 规范独立编写语法/结构小样例，项目 MIT；支持范围受产品矩阵约束，不以完整词典支持代替诊断。                                                                                                      |
| D-009   | [viewer 图形夹具](../tests/viewer/fixtures.ts)和运行时宿主自产输入。                                                                                                  | 项目 MIT，可重复的工程/图形检查输入；10k性能源为合法分子的 identity-only 显示，不当作独立科学 oracle 或500源真实扩胞。                                                                                 |
| D-011   | [独立科学参考](../packages/alchemion/src/core/__tests__/fixtures/scientific-reference.json)及[生成器](../scripts/scientific-reference.py)。                           | 项目 MIT。固定 Python 3.12.10、NumPy 2.2.6、SciPy 1.15.3；生成方法独立于生产代码，输入、环境、结果与完备性证书保存在参考资产中，只供开发测试。                                                         |
| D-012   | [Unicode 16.0.0 来源记录](../packages/alchemion/src/formats/cif/unicode-source.json)及[许可](../packages/alchemion/src/formats/cif/UNICODE-LICENSE.txt)。             | 1557条 C+F casefold 映射，NFD前后归一，用于 CIF2 名称比较；官方输入/许可 SHA 在来源记录，分发表 SHA 随构建写入格式 manifest。                                                                          |
| D-013   | [CTfile 参考质量数](../packages/alchemion/src/formats/mol/reference-isotopes.json)及[RDKit BSD许可](../packages/alchemion/src/formats/mol/RDKIT_LICENSE.txt)。        | 固定 RDKit `Release_2025_09_6` 的 `atomic_data.cpp` reference mass-number 列，仅用于 V2000 mass difference 编码，不取代科学平均质量。源/许可 SHA 在 JSON，输出 SHA 随构建分发。                        |
| D-014   | [CIF 格式 fixture 工具](../scripts/format-cif-fixtures.ts)、[MOL/POSCAR fixture 工具](../scripts/format-mol-fixtures.mjs)及对应单元输入。                             | 项目独立构造，MIT；算术真值显式给出，预期不从生产 reader 反推。SDK 输出由本地独立工具核验，生成产物在 `.tmp/format-reference`。                                                                        |
| D-015   | [范德华显示半径](../packages/alchemion/src/core/data/vdw-radii.ts)，mendeleev-data 1.1.0，固定提交 `67e08702c5e9e8541d9944824b10edfb718d61e8`，Alvarez2013/Vogt2014。 | MIT，94值、24缺失，含估算；`vdw_radius_alvarez` pm/100→Å，不覆盖质量、共价半径或成键规则。源/元数据/许可/输出 SHA 见[范德华 manifest](../packages/alchemion/VDW_DATA_MANIFEST.json)。                  |
| D-016   | [demo 离线样例](../apps/demo/src/samples.ts)：自产 MOL V3000 四原子非共面几何及双 block CIF。                                                                         | 项目 MIT；分子给出3Å距离/90°角/有符号二面角，晶体为正交/倾斜教学胞、恒等/反演，不是实验或数据库记录；随静态产物离线分发。                                                                              |
| D-017   | [默认视觉配色](../packages/alchemion/src/viewer/frame.ts)。                                                                                                           | 项目独立定义，MIT；颜色为显示选择，不称为导入的 CPK/Jmol 数据或科学常数。                                                                                                                              |
| D-018   | [实验晶体 CIF 测试输入](../tests/fixtures/crystals/README.md)：COD 9003308@291351（岩盐）、9000775@291269（石英）、9004143@291351（金红石，600°C）。                  | COD CC0 1.0，保留原始字节、AMCSD 说明和实验文献署名；逐文件 SHA256 见夹具说明。只用于真实晶体 demo 回归，不替换内置教学样例或随 SDK 分发；几何预期由晶体参数与独立算术给出。                           |

## 规范与原始输入

- [IUCr CIF 规范](https://www.iucr.org/what-we-do/digital-standards/cif/specification)及[CIF2 正式规范](https://journals.iucr.org/j/issues/2016/01/00/aj5269/)界定文档语法、值和容器；结构语义范围见[产品矩阵](product.md#格式支持矩阵)。
- [BIOVIA CTfile Formats 2020](https://discover.3ds.com/sites/default/files/2020-08/biovia_ctfileformats_2020.pdf)界定 MOL V2000/V3000 记录、属性和表示限制。
- [VASP POSCAR 说明](https://vasp.at/wiki/POSCAR)界定比例因子、基矢、元素计数和 Direct 坐标。
- [periodictable v2.0.2](https://github.com/pkienzle/periodictable/tree/v2.0.2/periodictable)提供当前元素与质量/共价半径输入；质量来源为 CIAAW2021/AME2020，半径来源为 Cordero2008，具体约定随科学 manifest 保存。
- [spglib v2.6.0](https://github.com/spglib/spglib/tree/v2.6.0)提供 Hall setting 数据和 BSD 3-Clause 许可；原字节与转换记录随科学 manifest 保存。
- [Unicode CaseFolding.txt](https://unicode.org/Public/16.0.0/ucd/CaseFolding.txt)固定原字节 SHA256 为 `6f1f9c588eb4a5c718d9e8f93b782685e5c7fec872cf05e8e6878053599e09bb`。
- [RDKit 固定 atomic_data.cpp](https://raw.githubusercontent.com/rdkit/rdkit/Release_2025_09_6/Code/GraphMol/atomic_data.cpp)原字节 SHA256 为 `7f9cee6e430b60d303a0a7fa9e33c45e5c529ee204f86afeab6a20f68b6b0631`。

## 独立工具与重生成

科学数据/参考依赖由[scientific-data/requirements.txt](../scripts/scientific-data/requirements.txt)固定；格式核验依赖由[format-reference-requirements.txt](../scripts/format-reference-requirements.txt)固定。NumPy/SciPy、PyCifRW、RDKit、ASE 和 Open Babel 只用于本地独立参考，不进入 SDK 运行依赖，也不上传用户文件。

数据重生成工具和执行方式见[开发指南](development.md#独立参考与数据工具)。重生成需审查输入散列、单位、缺失、转换与许可，不能把“安装成功”“计数正确”或“生成器退出0”单独作为科学验证通过。变更正式数据或规则时同步领域规范及对应独立验证；已认可 golden 不静默覆盖。

## 分发与署名

晶体识别使用由 spglib `v2.6.0` 与 Emscripten `4.0.23` 构建的 WebAssembly。源提交、编译器版本、资产 SHA-256 与许可证散列记录在[构建清单](../packages/alchemion/src/viewer/runtime/spglib/manifest.json)。SDK 在 `dist/spglib-notices` 提供清单和 BSD-3-Clause、工具链许可。demo 的离线来源页同时包含这些内容。

SDK 随包携带 `SCIENTIFIC_DATA_MANIFEST.json`、`VDW_DATA_MANIFEST.json`、构建生成的 `dist/FORMAT_DATA_MANIFEST.json` 和完整 `THIRD_PARTY_NOTICES.md`。格式 manifest 记录 Unicode/CTfile 数据来源、许可和分发表 SHA，数据源与输出是不同散列。Three 运行依赖由 SDK manifest 声明。

[demo 资产生成器](../scripts/demo-assets.mjs)核验科学/范德华/格式 manifest、许可与自产样例源码，生成静态 `generated/notices.txt` 和 `generated/data-manifests.json`，无网络也可查看来源与许可。真实包消费者与 demo 验证须核对实际产物内容和散列，来源登记不代替行为验证。

本表不保存已移除资产的开发处置记录。重新引入其他数据、样例或视觉资产时重新登记来源、固定版本、使用条件和署名，不沿用无关资产的许可结论。
