# 体数据等值面与切片

状态：未开始。需求与验证：新增实空间网格及后处理显示，复用 R-007、R-019、R-028，沿用 T-DOM-01、T-FMT-04、T-RUN-01、T-VIEW-01、T-VIEW-04、T-DEMO-01，新增斜晶胞、网格采样和周期接缝用例。

## 需求与当前事实

当前 SDK 缺少将电荷密度、静电势、轨道和自旋密度叠加到对应结构的通用体数据表示。先走通 VASP `CHG`／`CHGCAR`，再覆盖电势及带符号的轨道等数据。计划复用[结果配准](../2026-11-04-calculation-result-import/README.md)和[图层管理](../2026-11-04-calculation-result-layers/README.md)。对照 [VASP CHG](https://vasp.at/wiki/CHG)、[VASP CHGCAR](https://vasp.at/wiki/CHGCAR)和 [BIOVIA Visualizer 的场分析](https://www.3ds.com/fileadmin/PRODUCTS-SERVICES/BIOVIA/PDF/materials-studio-visualizer.pdf)。

## 验收条件与实施步骤

1. 定义网格的原点、三个步进向量、尺寸、数据排列、周期轴、边界采样、物理量、单位及帧和通道。校验 VASP 网格顺序、归一化及自旋块，对额外的增广数据按格式识别。后续按已验证的格式子集支持 `LOCPOT` 和能表达轨道的 Cube 等输入，明确区分波函数幅值与部分电荷密度。见 [VASP LOCPOT](https://vasp.at/wiki/LOCPOT)和 [Quantum ESPRESSO pp.x](https://www.quantum-espresso.org/Doc/INPUT_PP.html)。
2. 在正确的结构坐标上生成可调阈值的等值面和任意平面切片，支持透明度、色标、正负阈值分别配色及点取样。对周期网格定义接缝和邻胞重复规则。
3. 支持在明确相容的结构、单位和网格上生成差分场。输入网格不同时，只有用户明确选择合法配准与重采样方案后才运算。在密度等值面顶点采样电势等第二个场，并使用第二个场的单位及图例着色。
4. 用斜晶胞及解析标量场独立核对轴顺序、归一化、切片和等值面位置、点采样与周期接缝。用 VASP 文件验证积分、通道和关联结构，走通导入、显示、编辑后失配及 PNG 导出的浏览器路径。

## 进展与续接

缺口已登记，功能验证未运行。下一步是定义网格坐标和周期边界契约，并准备斜晶胞 `CHG`／`CHGCAR` 与已知积分的参考场。
