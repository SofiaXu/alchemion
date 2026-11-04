# 计算结果参考夹具

`CHGCAR.nospin.gz` 是锂的原始非自旋极化计算输出，取自 [pymatgen-test-files 的固定提交](https://github.com/materialsproject/pymatgen-test-files/blob/85005108e99e40cbd59e78f067459b0ca664efc6/io/vasp/outputs/CHGCAR.nospin.gz)，使用随附 [MIT 许可](LICENSE.pymatgen-test-files)。

gzip SHA-256 为 `1d0f7cab991845fb6b5576839727948d189d339e908c5908ea8ffd935337a715`，解压后的 SHA-256 为 `b58e1fb93dedfa746c3f5d1efe033a0560938b375adddd6ff40ef932a73a3c3a`。网格为 32 × 32 × 32，晶胞为斜晶胞，后随一条长度 15 的增广记录。用 Python 标准库独立读取原始采样行，`math.fsum(raw) / 32**3` 得到 0.9999999934509903 个电子。ASE 3.26.0 的 `VaspChargeDensity` 给出同一积分至浮点舍入精度。夹具的前三个轴向参考样本见定向格式测试。

以下文件沿用同一来源和许可。

- [`vasprun_Si_bands.xml.gz`](https://github.com/materialsproject/pymatgen-test-files/blob/85005108e99e40cbd59e78f067459b0ca664efc6/io/vasp/outputs/vasprun_Si_bands.xml.gz) 的 gzip SHA-256 为 `c54b9e248c598c42fff058aab4ccb3dae90eb5362010cdece9a4542a0581b37c`。独立用 Python ElementTree 读取 160 个 k 点、原始能量、DOS 自旋和原子投影，并按 16 点一段核对断点。
- [`OUTCAR.NiO_SOC.gz`](https://github.com/materialsproject/pymatgen-test-files/blob/85005108e99e40cbd59e78f067459b0ca664efc6/io/vasp/outputs/OUTCAR.NiO_SOC.gz) 的 gzip SHA-256 为 `8078da383e06932982589dceffb9498fde2036592e3f0c55988c0bd11af5e24e`。最后一组记录给出 Ni 原子的 1.671 μB 自旋基底分量，文件的 SAXIS 矩阵将其转换为三个约 0.96475235 μB 的笛卡尔分量。

[`OUTCAR.NaCl-dfpt.gz`](https://github.com/phonopy/phonopy/blob/418265993248cc792e9b24dc576f4e8b3b6095e0/example/NaCl-VASPdfpt/OUTCAR) 取自 Phonopy 的 NaCl DFPT 例子，使用随附 [BSD 3-Clause 许可](LICENSE.phonopy)。原始 SHA-256 为 `a78bff03dc78a14c4ceae5604d1495403d987e5bc1e85ece3978cba5385d4796`，gzip SHA-256 为 `1af3dbea2298bde4b4cb8a9f972ddaea6ee3e853cc6686d12345e6c7192afad4`。原始文本给出 64 个原子、192 个 Γ 模式，第一模式为 6.252562 THz。
