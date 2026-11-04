# 能带、态密度与费米面

状态：未开始。需求与验证：新增电子结构结果的图表及倒易空间叠加，复用 R-012、R-013、R-020，沿用 T-DOM-05、T-FMT-04、T-VIEW-01、T-DEMO-01，新增能量基准、k 点及费米面用例。

## 需求与当前事实

现有 SDK 计算并显示倒易晶格和第一布里渊区。缺少导入能带和态密度、关联能带 k 点与三维倒易位置，以及叠加费米面的工具。依赖[结果导入](../2026-11-04-calculation-result-import/README.md)和[结果图层](../2026-11-04-calculation-result-layers/README.md)。见 [VASP 电子结构结果](https://vasp.at/wiki/Electronic_ground-state_properties)和 [BIOVIA CASTEP 课程目录](https://www.3ds.com/assets/invest/2023-10/materials_studio_course_catalog-biovia.pdf)。

## 验收条件与实施步骤

1. 先确定能带与 DOS 的 VASP 文件子集，记录 k 路径、分段与标签、倒易坐标、能量单位、自旋和可用投影。显式记录费米能及其来源，保留可核对的绝对和相对能量基准。见 [VASP 能带工作流](https://vasp.at/wiki/Band-structure_calculation_using_DFT)。
2. 显示联动能带和 DOS 图表，共享能量基准与范围。选取能带中的 k 点时在第一布里渊区标记位置，使用现有倒易基矢约定并标明折回规则。
3. 从带有晶胞及能量基准的三维 k 点网格生成费米能等值面，或导入有倒易坐标凭据的现成费米面。按带和自旋切换图层，明确网格采样、周期接缝及第一布里渊区裁切语义。仅有路径采样时给出费米面输入不足诊断。
4. 用已知能量位移、断开的 k 路径、非正交倒易基矢和解析能带网格核对坐标、图表及费米面。在浏览器检查 k 点联动、图层开关和导出。

## 进展与续接

缺口已登记，功能验证未运行。下一步是确定 VASP 首轮输入与能量基准契约，准备 k 路径和三维网格的独立参考。
