# M2 渲染选型证据

状态：已完成，选择 Three.js 0.186.1；硬件、功能、资源和分发证据齐备。日期：2026-10-29，Asia/Hong_Kong。工作目录：`D:\source\alchemion`。

## 范围与固定环境

本轮只比较准备好的 10,000 原子实例/20,000 键快照，不实现科学算法或完整 viewer。两个候选为 three 0.186.1（类型 0.186.0）及 Babylon core 9.32.1；精确依赖与 integrity 由锁文件保存。历史 SDK Babylon 7.23.0 与 demo 按用户确认保留至 M5/M6，候选依赖仅用于开发验证。

工具固定 Node 24.22.1、pnpm 9.7.0、Playwright 1.63.0。系统 Node 26.13.0 和失效的系统 pnpm shim 不用于正式验收。便携 wrapper 已修正子进程 PATH，`pnpm exec node --version` 实际返回 v24.22.1。

设备为 Lenovo 21VG、Intel Core Ultra X7 358H、16 逻辑处理器、33,840,197,632 bytes 内存，Windows 11 10.0.26300；Intel Arc B390 驱动 32.0.101.8356。初始电源计划为平衡、接电。正式原始数据另保存每次环境、供电、浏览器与 WebGL renderer。默认 Chromium headless shell 报告 SwiftShader；完整 Chromium 153.0.8010.12 使用 `--enable-gpu --use-angle=d3d11` 后报告 Intel Arc B390 / D3D11，WebGL 与 GPU compositing 均启用。该探测证明可采样，不证明性能预算已通过。

## 方法与验证范围

- 同一格点、键顺序、ID 映射、typed-array 哈希、球 24×16 和封口圆柱 16 段。球/键半径、相机、Lambert shader、线性 RGB、白底及 1920×1080/DPR1 均共享。
- 首帧在收到准备好的快照后开始，等待材质就绪、完整绘制、GPU fence 和帧观察；初始化另记。更新计时不含派生快照准备，包含真实 GPU 提交。
- 点击使用实际指针；Node 单调时钟包含发送 pointer down/up 到收到正确选择的回报。像素验证与截图在计时区间外执行，ID oracle 来自独立预设前表面目标，不由候选拾取结果生成。
- 新增测试的技术理由：M1 不覆盖实例回源、局部缓冲更新、可控 Worker 乱序、多个 viewer 或实际资源计数。功能测试默认 4 进程、无自动重试。正式性能采样独占串行，避免 GPU 争用。
- 真实 SDK tarball 冒烟只验证本次修改的任务编排/依赖没有破坏分发；单候选 ESM 消费者另验其实际构建产物和 Worker URL。未运行无过滤的 `pnpm check` 或科学/格式全套测试。

## 已执行检查及修复

| 检查                                             | 退出码 | 结果及重跑理由                                                                                                                                                                      |
| ------------------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 首次 `pnpm build`                                | 1      | 便携入口尚未为 lifecycle 子进程固定 PATH，实际使用 Node26；修正正在使用的 wrapper 又触发批处理尾部错误。该次不作为固定工具验收。                                                    |
| 固定子进程 Node24 后 `pnpm build`                | 0      | 已通过 SDK/声明/Worker 和独立 demo 构建；仅有历史 Sass 与 chunk-size 警告。重跑理由为修复工具环境。                                                                                 |
| 首轮 `pnpm exec tsc -p tsconfig.json`            | 1      | 三处新 harness 类型错误：跨 await 状态假缩窄、canvas listener 的 null 重载；修复后定向重跑。                                                                                        |
| 修复后三处类型检查                               | 0      | 已通过；后续改动还需纳入最终类型检查。                                                                                                                                              |
| 首轮 `pnpm test:browser -- --phase=m2`           | 1      | 测试发现阶段错误地由候选列表导入引擎，Node 无法解析 Babylon 子路径；尚未执行测试。改为纯候选名称模块后重跑同一范围。                                                                |
| 修正候选列表后 `pnpm test:browser -- --phase=m2` | 0      | 12/12；两个候选×两个模式×三个浏览器，4 进程，无重试，26.1 秒。包含像素、真实指针、resize、实际 GPU 更新探针和 Worker/多实例/释放。                                                  |
| `pnpm test:package -- --prepared`                | 0      | 真实 tarball 消费者声明、生产构建、三浏览器嵌套 Worker/拾取/销毁 3/3，10.4 秒；目录为 `C:\Users\aoba\AppData\Local\Temp\alchemion-m1-consumer-u7STM0`。只运行一次并复用已构建 SDK。 |
| shader 诊断回调后的定向类型检查                  | 1→0    | Three 类型包将回调参数误标为其内部 wrapper，实际 r186 传原生 WebGLProgram；核对精确源码后只在诊断调用处修正类型断言，重跑类型检查通过。类型断言被擦除，不重复浏览器矩阵。           |

## 实测与选择结果

[功能原始记录](m2-renderer-selection/correctness.json) 保存 12 个组合的浏览器版本、GPU、身份、Worker 和资源结果。已人工核对 [Three 空间填充](m2-renderer-selection/functional-three-space-filling.png)、[Babylon 空间填充](m2-renderer-selection/functional-babylon-space-filling.png)、[Three 球棍](m2-renderer-selection/functional-three-ball-and-stick.png)、[Babylon 球棍](m2-renderer-selection/functional-babylon-ball-and-stick.png)：可见形状、布局及配色一致。截图仅作辅助，数值/身份/更新由断言验证。

本次受影响文件的 ESLint、Prettier、类型和 Markdown 链接检查已通过。功能矩阵结束后只补了被擦除的 Three 类型断言和 JSON 报告器，未改变已测运行时代码，不重复矩阵。

比较源码为 `07527f8e0350fedb17926c8a5ff16a8c4cdc4084`。`pnpm bench -- --renderer-selection` 退出 0；2026-10-29 14:36:45–14:53:18（Asia/Hong_Kong），同机两模式各三轮 12/12 全部达标，无候选性能修复或重复采样。[汇总及选择公式](m2-renderer-selection/summary.json)、[全部轮次顺序](m2-renderer-selection/runs.json)、[产物模块与字节](m2-renderer-selection/artifacts.json)、[真实 ESM 消费者](m2-renderer-selection/consumers.json) 已归档；每轮 JSON 和 PNG 以 candidate-mode-rN 命名保存于同目录。

| 指标（全部模式/三轮最差值） | Three 0.186.1       | Babylon 9.32.1        |
| --------------------------- | ------------------- | --------------------- |
| 首次完整帧                  | 95.4 ms             | 97.3 ms               |
| 最低 median FPS             | 59.88               | 59.88                 |
| 拾取 p95                    | 16.35 ms            | 36.59 ms              |
| 100 原子及关联键更新 p95    | 52.5 ms             | 52.5 ms               |
| 销毁                        | 120/120             | 120/120               |
| 完整 raw / minified 字节    | 1,132,052 / 875,183 | 2,803,088 / 2,142,677 |
| 完整 gzip 字节              | 186,577             | 449,787               |
| 候选专属有效行              | 291                 | 357                   |

两者全部硬门槛通过；用于决策的最差 `max(拾取 p95, 更新 p95)` 同为 52.5 ms，差异 0%，小于 10%。因此比较完整 ESM 消费者 gzip，Three 小 58.52%，按 ADR 0002 选择 Three，未使用最终平手规则。两种构建均为 ES2022/ESM、tree shaking、esbuild minify、gzip level9；所有 lazy chunk 和 Worker 均纳入总量（Three 2 个输出、Babylon 18 个输出）。共享夹具、图形、运行时、测试协议和 Worker 都属于比较消费者；没有科学 core/formats 成本。有效行排除空行/独立注释，包含 GLSL，仅作解释。

正式采样使用电池供电、平衡模式，初始电量 45%；[20 秒供电观察](m2-renderer-selection/power-observations.json) 始终为放电/同一计划，记录电量 44%–39%。每轮重新读取真实 WebGL renderer 与浏览器版本。Edge/Codex 仍在运行，未终止其他会话应用。上述数据仅代表本设备配置，不是所有设备的性能保证。

自有 GL 句柄、canvas 监听、Worker、RAF、观察器、Promise 与 canvas 动态计数均归零；Three 的 7 个引擎基础纹理/帧缓冲句柄由实际 context loss 释放，账本保留该事实，没有手工重置。JS heap 仅记录趋势：Three 38.3–52.6 MB，Babylon 34.7–67.9 MB，不要求或宣称 GC 精确归零。

最终审查发现 canvas 账本未覆盖 Babylon 的 6 个 window/document 监听。为补齐该特定缺口，追加 `pnpm bench -- --renderer-selection --resources-only --source-ref=07527f8`，只验证资源，不重复性能。[CDP 原始记录](m2-renderer-selection/global-resources.json) 证明每候选/模式各 20 轮，共 80 轮，window/document/navigator 全局监听逐轮恢复基线；Babylon 存活期间增加 window 2、document 4，销毁后均移除。观察使用 CDP，不改全局对象或引擎状态。

## Ubuntu 与软件功能路径

[首次 Ubuntu CI](https://github.com/SofiaXu/alchemion/actions/runs/40831646537) 的安装、构建、类型、lint 和文档检查通过，浏览器 12/12 失败；tarball 步骤未运行。[失败摘要](m2-renderer-selection/ci-initial-failure.json) 保留错误：Chromium 软件 fence 超时，Firefox/WebKit 隐藏场景的 RAF 等待不结束。该结果不替代 Windows 硬件证据，也未标为通过。

本地定向软件诊断只运行 Chromium 两模式，复现了固定 90ms 等待不足以证明 Worker 迟到回复、软件绘制阻塞后的 30s 请求超时及 5s resize 等待。修复只影响功能验证：软件模式显式使用 finish 和可取消 task 交付，双实例画布保持屏幕内，等待实际 stale 回复并有 watchdog；默认 Worker 30s 不变，软件功能配置显式给 120s、断言等待 30s；关闭软件 tracing 减少额外 readback。硬件性能仍使用原 fence+RAF，bench 明确拒绝软件同步路径。保留同一 10k/20k 数量和完整几何，没有降低画质或性能门槛。

四个并发软件 viewer 已出现等待超时，Ubuntu 软件功能进程数降为 2；硬件功能默认仍为 4。新增资源审计、软件诊断和修复后复验均针对已观察到的具体缺口；没有默认运行完整科学/格式套件。

修复后的本地软件 Chromium 两模式 2/2 通过（49.2s、58.7s，整体 1 分钟）；[原始记录](m2-renderer-selection/software-functional.json) 明确标记 finish 功能路径。这是针对已复现软件失败的定向复验，不是性能采样。

[修复后的 Ubuntu CI](https://github.com/SofiaXu/alchemion/actions/runs/40836102937) 在源码 08529de、attempt1 全部通过：[步骤与日志摘要](m2-renderer-selection/ci-validation.json)。冻结安装、SDK/demo 构建、类型/lint/文档、M2 6/6（2 进程，5.0 分钟）、真实 tarball 3/3（20.4 秒）。浏览器安装版本为 Chromium 153.0.8010.12、Firefox 155.0、WebKit 26.6；软件结果不验收 T-PERF-01，不等同真实 Safari。

收束及 harness 修复后的 [Windows 最终功能记录](m2-renderer-selection/selected-correctness.json) 为 6/6、4 进程、14.4 秒，全部走硬件 fence 路径。复验理由是候选依赖删除、双实例可见布局和迟到观察逻辑发生变化。该变更不进入原性能采样的渲染/时钟路径，因此不重复 60 秒采样。

最终 [Three ESM 产物](m2-renderer-selection/selected-artifacts.json) 及 [实际加载记录](m2-renderer-selection/selected-consumer.json) 已通过 `--artifacts-only` 复验。raw/minified/gzip 为 1,132,816/875,812/186,790 bytes；新增可观测性使 gzip 比原比较增加 213 bytes。选型始终使用 07527f8 的成对数据，未把最终单边体积混入比较。SDK 公开 API 和历史实现未改变，不重复无关科学/格式测试。

当前源码只保留获选原型和开发依赖；历史 SDK Babylon 7.23.0 未改。完整双候选复跑须在独立 checkout 检出 `07527f8`，按 README 配置固定工具并冻结安装，再运行原比较命令；当前树的 bench 只复验 Three。软件功能诊断使用 `M2_FUNCTIONAL_SOFTWARE=1`，不是性能验收。`--resume` 只自动核对源码，操作者仍须确认同机/浏览器/供电状态，不能跨环境拼接结果。
