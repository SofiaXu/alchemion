# 原子约束与 POSCAR Selective Dynamics

状态：未开始。需求与验证：扩展 R-006、R-017、R-029，沿用 T-FMT-03、T-FMT-04、T-EDIT-01、T-DEMO-01，新增约束往返与变换用例。

## 需求与当前事实

当前 POSCAR 读写只涵盖几何，导入遇到 `Selective Dynamics` 会明确拒绝。目标是在周期源保存逐原子约束，允许在工作台固定选中原子或 slab 底层，并无歧义地导入和导出。VASP 的三个标志对应 Direct 分量，坐标以 Cartesian 输入时也沿用这一约定。见[当前 POSCAR API](../../api/formats.md#poscar-导入)和 [VASP POSCAR 规范](https://vasp.at/wiki/POSCAR#Full_format_specification)。

## 验收条件与实施步骤

1. 定义逐原子三分量移动标志、默认行为和数据校验。明确对称展开、超胞、换基与切面时的传播规则。无法用三个 Direct 标志表达的变换须给出诊断。
2. VASP5 POSCAR 导入解析并验证标志，导出随元素分组保持每个原子与其标志的对应。无法表达约束的格式沿用科学损失诊断与显式确认。
3. 工作台按原子选择或按[薄层](../2026-11-04-surface-slab-builder/README.md)的底层选择批量设置约束，每次操作支持一次撤销。已有无约束结构保持原行为。
4. 对照 VASP 文档，验证斜晶胞 Direct 与 Cartesian 的同一组标志、元素重排、非法标志、约束往返及换基后的诊断。浏览器验证固定底层后导出并重导入。

## 进展与续接

缺口已登记，功能验证未运行。下一步是确定约束字段及变换规则，用 VASP 官方示例准备独立往返夹具。
