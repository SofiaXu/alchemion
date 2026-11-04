# 真实晶体测试输入

以下文件于 2026-10-30 从 [Crystallography Open Database（COD）](https://www.crystallography.net/cod/)下载，保持原始字节与文献署名；不删减不支持的科学字段来消除诊断。COD 数据库及数据采用 [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)，原文件中的 AMCSD 与文献来源说明一并保留。这些文件只供测试，不作为 demo 的内置教学样例或 SDK 科学数据分发。

| 文件、固定修订                                                                                           | 实验文献与条件                                                                                                                                                                                                                   | SHA256                                                             |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [9003308.cif](9003308.cif)，[COD 9003308@291351](https://www.crystallography.net/cod/9003308.cif@291351) | Walker, D.; Verma, P. K.; Cranswick, L. M. D.; Jones, R. L.; Clark, S. M.; Buhre, S. (2004), “Halite-sylvite thermoelasticity”, American Mineralogist 89, 204–210。岩盐，25°C、0 kbar。                                          | `34ae2391f7417c12a800a0afddf56995c5b69c1fb7c73fc5509a432e230e48a3` |
| [9000775.cif](9000775.cif)，[COD 9000775@291269](https://www.crystallography.net/cod/9000775.cif@291269) | Levien, L.; Prewitt, C. T.; Weidner, D. J. (1980), “Structure and elastic properties of quartz at pressure”, American Mineralogist 65, 920–930。α 石英，1 atm。                                                                  | `573e4a570f2cf9e5c338cfb4f23c94fe6c6254de5ee90d9851204d912aa5ea48` |
| [9004143.cif](9004143.cif)，[COD 9004143@291351](https://www.crystallography.net/cod/9004143.cif@291351) | Meagher, E. P.; Lager, G. A. (1979), “Polyhedral thermal expansion in the TiO2 polymorphs: Refinement of the crystal structure of rutile and brookite at high temperature”, The Canadian Mineralogist 17, 77–85。金红石，600°C。 | `34d130609f9662d03522aa25547e8aef8fc32f5fcb2692e7e0c529e5f7ca9b95` |

## 独立算术预期

三个输入均有两个非对称单元站点，不能把页面的源原子数当作完整晶胞数。

- 岩盐：`a=b=c=5.6401 Å`、Fm-3m，`Z=4`，完整晶胞为 4 Na + 4 Cl。最近 Na–Cl 距离 `a/2=2.82005 Å`，Na 的六个邻居形成八面体，体积 `a³/6`。相邻晶胞中同一 Na 影像的间距是 `a`，不按最小影像缩为零。
- 石英：`a=b=4.916 Å, c=5.4054 Å, γ=120°`，`Z=3`，完整晶胞为 3 Si + 6 O。以文件显式六个操作和整数平移作用于 O 坐标，Si 的四邻居为两对。独立六方度量 `d²=a²(Δx²+Δy²−ΔxΔy)+c²Δz²`，两组位移可取 `(0.2634,0.1466,0.1191−1/3)` 和 `(-0.0562,0.2669,0.1191)`，得到约 1.6046315549 Å ×2、1.6136583157 Å ×2。四邻居形成四面体。原文件的 H-M 标识与数据库标准操作比对会产生 `SYMMETRY_IDENTIFIER_CONFLICT`，测试保留并检查该诊断，使用原文件显式操作，不替换为表中标准操作。
- 金红石：`a=b=4.616 Å, c=2.977 Å`，P42/mnm，`Z=2`，完整晶胞为 2 Ti + 4 O。令 `u=0.3045`，Ti 的六邻居距离是 `sqrt(2a²(1/2−u)²+(c/2)²)` ×4 和 `sqrt(2)au` ×2，约 1.9607102898 Å ×4、1.9877789853 Å ×2，形成六顶点八面体。
- `2×2×1` P1 超胞分别为 32、36、24 个独立源原子，a、b 加倍，c 和晶胞角保持；不是重复显示实例。

原始 CIF 含缺省占位、从标签推断元素、已舍入的报告体积和未映射科学字段，应显示相应诊断。石英和金红石含各向异性位移参数，模型不把它们误当作等方值；CIF/POSCAR 导出须显式接受无法表示的信息损失，不声称任意实验 CIF 无损往返。

## 运行

在仓库根执行 `pnpm test:browser -- --suite=demo --grep=@real-crystals`。用例通过实际文件输入、页面控件和画布操作生产 demo，覆盖对称及邻胞计数、两种显示、晶格/倒易/BZ、解析距离与配位、PNG、CIF1/2、超胞/空位/历史及完整超胞 POSCAR 重导入；不访问 demo 私有 viewer 对象，也不使用生产科学函数生成数值预期。截图、数值和浏览器版本为 Playwright 附件。
