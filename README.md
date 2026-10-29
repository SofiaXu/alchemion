# Alchemion

Alchemion 面向晶体和分子结构的浏览器 TypeScript SDK，交付一个 SDK 和独立 demo。运行目标为现代桌面 WebGL2；Node.js 仅用作开发工具。

## 当前状态

M1 工程基线正在最终验收：已建立 pnpm workspace、ESM 子路径、声明、两层模块 Worker、独立 demo 与定向检查。保留的 Babylon.js 与科学/格式实现仅用于历史场景迁移；渲染引擎由 M2 实测定案。稳定身份、统一科学模型、完整格式、编辑历史和异步协议尚待 M3–M5，不因搬迁而视为完成。

实际进展见 [交接](docs/handoff.md)、[M1 计划](docs/plans/m1-foundation.md) 和 [运行证据](docs/evidence/m1-foundation.md)。历史代码基准为 06784cf。

## 现有工程入口

固定 Node **24.22.1**（见 .node-version）与 pnpm **9.7.0**（packageManager）。先配置对应 Node，再运行：

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm exec playwright install chromium firefox webkit
pnpm dev
```

Linux 安装浏览器时使用 Playwright 的 --with-deps 选项。不要跳过安装脚本。CI 使用 Ubuntu 24.04；本地 Windows 和 Linux 的运行结果分别记录。

| 命令                    | 当前作用                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| pnpm dev / pnpm demo    | 等价入口；先构建 SDK/声明，再监听 SDK 更新并启动独立 demo。                                     |
| pnpm build              | SDK 类型检查、ESM/模块 Worker/声明构建，然后构建 demo。                                         |
| pnpm typecheck          | 先准备 SDK，再检查纯 core/formats、demo、测试和构建配置。                                       |
| pnpm lint               | 只读 ESLint，包含模块边界限制。                                                                 |
| pnpm format:check       | 只读 Prettier，包含代码、配置和 Markdown。                                                      |
| pnpm test -- <文件路径> | 单次 Vitest；可指定相关文件，默认最多 4 个进程，无重试。                                        |
| pnpm test:watch         | 显式启用 Vitest watch。                                                                         |
| pnpm test:browser       | 准备 SDK，运行三个浏览器的 M1 创建/真实 Worker/拾取/销毁冒烟。                                  |
| pnpm test:package       | pack 后在仓库外安装 tarball，检查全部公开声明、生产构建和三个浏览器的嵌套 Worker 场景。         |
| pnpm check:m1           | 复用一次 SDK 构建，执行 M1 工程检查、两个 CIF 文件、浏览器与 tarball 验收。当前 CI 使用此范围。 |
| pnpm check              | 显式全量检查入口；新增阶段后可能扩大，不作为默认任务验证。                                      |
| pnpm bench -- --smoke   | 128 原子、120 帧的真实采集冒烟，输出 .tmp/bench/m1-smoke.json；不验收 T-PERF-01。               |
| pnpm docs:check         | 检查本地 Markdown 链接。                                                                        |

测试默认 4 个进程，可用 TEST_WORKERS 覆盖浏览器并行数。资源允许时使用 4–8；资源不足时记录降并行的原因。只运行与变更直接相关的检查，重复或扩大验证须记录技术理由。

## SDK 与 demo 边界

唯一 SDK 位于 packages/alchemion，独立应用位于 apps/demo。三个入口为 alchemion/core、alchemion/formats、alchemion/viewer；无旧根入口、CJS 或内部深层导入。demo 和消费者不使用源码 alias。SDK 的常规浏览器依赖由其 manifest 声明，模块 Worker 的计算依赖随资源打包。

M1 暂保留 AlchemionEditor 和旧模型；loadStructure 前订阅 status，completed 表示历史渲染路径完成。先准备好 SDK 后，浏览器消费者可通过公开入口使用：

```ts
import { CifParser } from 'alchemion/formats'
import { AlchemionEditor } from 'alchemion/viewer'

const editor = new AlchemionEditor('#editor')
editor.status.subscribe((status) => console.log(status))
editor.loadStructure(new CifParser().parse(cifText))
// 宿主卸载时调用；dispose 可重复调用。
window.addEventListener('pagehide', () => editor.dispose(), { once: true })
```

上例仅展示 M1 入口，不承诺新版 CIF1/2 支持矩阵或 M4/M5 的最终 API。完整需求见 [产品规范](docs/product.md)。

## 文档导航

- [Codex 指令](AGENTS.md)、[执行计划规则](PLANS.md)、[当前交接](docs/handoff.md)
- [产品](docs/product.md)、[领域](docs/domain.md)、[架构](docs/architecture.md)、[质量](docs/quality.md)
- [历史审计](docs/baseline.md)、[数据来源](docs/data-sources.md)、[路线图](docs/roadmap.md)
- [基础决策](docs/decisions/0001-project-foundation.md)、[待实测的渲染决策](docs/decisions/0002-renderer-selection.md)

仓库代码使用 [MIT License](LICENSE)。科学数据和样例保留来源台账中的待核实状态，M1 搬迁不表示已经完成数据审核。
