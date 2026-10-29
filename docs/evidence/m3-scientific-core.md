# M3 科学核心验证

日期：2026-10-29，Asia/Hong_Kong。工作目录 `D:\source\alchemion`；入口基准 `3ab8d6f`，共享契约/历史隔离提交 `80216d6`。实现和科学CI提交为 `93937da9dd9e69d4c92b83bd33b24f6ee41d2d79`；归档提交与主分支合并记录见 [PR #6](https://github.com/SofiaXu/alchemion/pull/6)。后续仅更新文档，源码保持该已测提交。

## 交付与科学依据

正式 `alchemion/core` 包含周期/非周期不可变快照、稳定身份、统一晶胞数学、对称/实例/逆映射/cutoff、空间索引成键、测量、含2π倒易和具有完备证书的第一BZ。旧 formats/viewer 只机械改为消费内部历史模型，没有新旧转换适配器。历史代码/数据不作为新科学默认；旧键价表及死索引删除。

独立解析和 NumPy/SciPy/Qhull 参考见 [参考证据](m3-scientific-reference.md)；数据的固定版本、六项上游字节散列、许可和转换见 [来源台账](../data-sources.md)。新表含118元素、96半径、530 setting/230 IT/7388操作，有理平移往返误差0；数据测试独立检查全部群闭合和逆元。

所有晶胞、坐标、倒易及BZ比较均满足领域绝对/相对容差 `1e-9 + 1e-10*max(abs(actual),abs(reference))`；测量使用领域角度容差及退化判据。BZ同时验证参考顶点/面数量、半空间、中心对称、外向面、闭合边、Euler关系和体积；多壳反例不能在第一壳无条件成功。测试没有从生产算法写回预期值。

最终参考 JSON 的规范 UTF-8/LF SHA-256：`a73dff0032572e226a6fdcb9b88bfe67cb2829615b6aabe9707d0838bef8c388`。数据表最终散列保存在随包manifest。参考和数据各生成一次，Prettier只改变参考JSON的表达，不重新生成科学结果。

## Windows 实际检查

使用仓库 `.tools/pnpm.cmd` 便携 wrapper，Node24.22.1、pnpm9.7.0；TypeScript5.9.3、Vitest4.0.18、Vite7.3.5、Playwright1.63.0、Chromium153.0.8010.12（同一安装二进制额外读取版本元数据，未重复浏览器场景）。默认单元4进程、无重试。下表命令均从仓库根目录运行。

| 命令/范围                                                                                 | 状态、退出码及观察                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec vitest run packages/alchemion/src/core --maxWorkers=4`                         | 已通过，0；7文件/57项，2.55秒。数据群运算1.062秒；万原子成键所在文件223ms，实际键数28600。不是三维性能验收。                                                                                                                           |
| `pnpm exec vitest run packages/alchemion/src/core/__tests__/bonds.test.ts --maxWorkers=4` | 已通过，0；13项，1.08秒。仅因审查新增来源反例和生产校验而复验该文件；万原子场景仍正确。                                                                                                                                                |
| `pnpm build` 初次、第二次                                                                 | 失败，1；首次有类型收窄错误及 Babylon 外部导入误替换，第二次剩两个元组断言类型错误；均在 SDK 类型阶段停止，没有把未构建产物算通过。                                                                                                    |
| `pnpm exec tsc -p packages/alchemion/tsconfig.json` 修复后                                | 已通过，0；显式三列元组与外部导入恢复后定向核对。                                                                                                                                                                                      |
| `pnpm exec tsc -p packages/alchemion/tsconfig.core.json`                                  | 已通过，0；ES2022、无DOM的源码边界。                                                                                                                                                                                                   |
| `pnpm build` 修复后                                                                       | 已通过，0；SDK类型/ESM/两层Worker/声明与独立demo构建。保留历史Bootstrap Sass和包体积警告，未为本次修改调整其阈值。                                                                                                                     |
| `pnpm exec tsc -p tsconfig.json`                                                          | 首次失败2：测试的readonly突变断言；等价改写后已通过0。没有因此重跑科学测试。                                                                                                                                                           |
| 改动源码/脚本的 `pnpm exec eslint <文件集合>`                                             | 已通过，0；之后只对元组注解和来源回归实际改动文件定向复验，通过0。                                                                                                                                                                     |
| `pnpm test:package -- --prepared --project=chromium`                                      | 已通过，0；1场景/1实际worker，7.8秒。并发上限设4，但不复制唯一场景。隔离消费者安装真实tarball、编译全部公开声明及单独无DOM core声明、生产打包、加载真实嵌套Worker、拾取、快照隔离、幂等销毁和无WebGL2错误。必要许可/manifest随包存在。 |

首次 tarball 位于仓库外临时消费者 `C:\Users\aoba\AppData\Local\Temp\alchemion-m1-consumer-3F48I7`。来源校验回归发生在该次消费者之后，因此Windows产物证据对应回归前版本；随后只重建受影响SDK，最终回归版本由Ubuntu同口径tarball核对，不重复本地浏览器场景。补充实例选项/派生选项类型导出没有运行时兼容别名。

## 最小充分验证与剩余关卡

新增7个科学测试文件用于首次交付的T-DOM-01–06及正式数据T-DATA-01。主会话审查新增1个来源回归测试，理由是缺失来源会静默跳过而破坏逆映射契约。唯一完整本地科学首跑后只重跑了对应成键文件；未执行旧CIF/MOL测试、完整check、M2三浏览器/硬件bench或M4/M5未来场景。

来源回归之后 `pnpm --filter alchemion build:source` 已通过0，并再次检查依赖新声明的 `tsc -p tsconfig.json` 通过0；没有重建未受影响demo。改动文件 `pnpm exec prettier --check <文件集合>` 已通过0；`pnpm docs:check` 已通过0，检查27份Markdown的本地链接。Ubuntu定向CI已首轮通过，结果见下节；主分支归档见PR #6。CI只在本次代码变化时执行M3集合；后续纯文档记录更新只查格式/链接。Ubuntu重复科学与打包是为跨平台工程证据，不能把软件WebGL结果当硬件性能结论。

完整R-022尚包括M4/M5样例和配色、M6最终分发复核；本阶段只声明新版科学数据通过。事务/历史/取消协议和Three正式viewer未实施，第一BZ和成键结果尚未接入历史demo显示。

## Ubuntu 最终源码与真实产物

[Actions run40851532341](https://github.com/SofiaXu/alchemion/actions/runs/40851532341)，job123371926616，attempt1，success；源码commit93937da。2026-10-29 17:40:54–17:43:16（Asia/Hong_Kong）。Ubuntu24.04.5、runner镜像ubuntu-24.04/20261025.353.1，Node24.22.1、pnpm9.7.0、Chromium153.0.8010.12。

实际7文件/58项科学测试通过，4进程、2.88秒；SDK/demo构建、两项类型检查、改动文件lint/格式和27文档链接检查全部通过。最终SDK真实tarball的Chromium消费者1/1通过，26.5秒；生产构建和两层Worker均正确。完整命令与退出状态见工作流日志，精简可复核数据见 [CI摘要](m3-ci-summary.json)。

CI使用LIBGL_ALWAYS_SOFTWARE=1；只提供功能/分发证据，不提供性能结论。M2工作流未触发。后续文档归档提交只检查格式/链接，保留已测源码不变；远端主分支的合并SHA以PR #6与master HEAD为准。
