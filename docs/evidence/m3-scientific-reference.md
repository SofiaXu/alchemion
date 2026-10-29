# M3 独立科学参考

日期：2026-10-29，Asia/Hong_Kong。参考生成与生产 TypeScript 无代码复用；生产几何尚须通过定向测试后才能记为通过。

## 固定环境与执行

Python 3.12.10、NumPy 2.2.6、SciPy 1.15.3，专用环境 `.tmp/m3-reference-env`。系统 NumPy 2.5.3 不符合该固定组合，未用于参考。依赖同时固定 spglib 2.6.0、periodictable 2.0.2，详见 [requirements](../../scripts/scientific-data/requirements.txt)。

仓库根目录设置 `OPENBLAS_NUM_THREADS=1`、`OMP_NUM_THREADS=1` 后执行 `.tmp/m3-reference-env/Scripts/python.exe scripts/scientific-reference.py`。只生成一次，退出 0，耗时 5.67 秒。脚本拒绝无提示覆盖已存在参考，未因格式化重新生成。

[生成程序](../../scripts/scientific-reference.py) 与 [参考 JSON](../../packages/alchemion/src/core/__tests__/fixtures/scientific-reference.json) 保存全部输入、版本、结果和完备性证书。原始生成字节 SHA-256 为 `05a3c0ad48b9ccafe0b73132527fe795d00b44ffc9ecbb3b4f3a7f093105ad01`；最终格式化资产散列在科学核心报告中登记。输入语义 SHA-256 为 `b4ff1f56fbace6f73233c9c1e2f8f90ff4d3bea27a3956cfde9b729f5b4702f4`。

## 方法与覆盖

六个自编胞为立方、正交异长、单斜、三斜、旋转倾斜基矢以及多壳反例。晶胞参数由独立给定基矢的长度/点积求得，体积、逆矩阵和坐标由 NumPy 线性代数计算，不复制生产参数到基矢的公式。

BZ 使用 [SciPy Voronoi](https://docs.scipy.org/doc/scipy-1.15.3/reference/generated/scipy.spatial.Voronoi.html) 的 Qhull 原点胞与 [ConvexHull](https://docs.scipy.org/doc/scipy-1.15.3/reference/generated/scipy.spatial.ConvexHull.html) 体积；不调用生产增量裁剪。参考用 SVD 最小奇异值证明未枚举格矢不能继续裁剪，并验证所有枚举半空间。六个参考最终枚举壳为 `3/3/3/3/3/6`。多壳反例的直接基矢列为 `(1,0,0)`、`(2.2,0.5,0)`、`(0,0,1)`。

独立解析部分包含立方 BZ 的八顶点、六面、十二三角形和体积；距离/角/二面角使用明确笛卡尔点；小体系成键使用测试内独立全对枚举；空间群闭合和逆元用独立整数运算检查。

参考只供开发测试，不进入 SDK 运行依赖或 tarball。来源数据生成、原始散列与许可见 [随包 manifest](../../packages/alchemion/SCIENTIFIC_DATA_MANIFEST.json) 和 [第三方声明](../../packages/alchemion/THIRD_PARTY_NOTICES.md)。
