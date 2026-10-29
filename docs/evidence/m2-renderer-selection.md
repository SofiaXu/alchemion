# M2 渲染选型证据

状态：进行中；尚无选型结论。日期：2026-10-29，Asia/Hong_Kong。工作目录：`D:\source\alchemion`。

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

## 待完成证据

[功能原始记录](m2-renderer-selection/correctness.json) 保存 12 个组合的浏览器版本、GPU、身份、Worker 和资源结果。已人工核对 [Three 空间填充](m2-renderer-selection/functional-three-space-filling.png)、[Babylon 空间填充](m2-renderer-selection/functional-babylon-space-filling.png)、[Three 球棍](m2-renderer-selection/functional-three-ball-and-stick.png)、[Babylon 球棍](m2-renderer-selection/functional-babylon-ball-and-stick.png)：可见形状、布局及配色一致。截图仅作辅助，数值/身份/更新由断言验证。

本次受影响文件的 ESLint、Prettier、类型和 Markdown 链接检查已通过。功能矩阵结束后只补了被擦除的 Three 类型断言和 JSON 报告器，未改变已测运行时代码，不重复矩阵。

单候选完整产物体积与 ESM 冒烟、两模式各三轮性能与 20 轮资源计数尚待完成。原始结果暂存 `.tmp/bench/m2/`，正式归档时写入同名资源目录并链接；未归档前不视为已有报告。

只有全部必要数据满足 ADR 0002 才接受选型；失败、修复与未运行部分均保留。
