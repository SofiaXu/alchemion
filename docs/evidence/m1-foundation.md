# M1 工程基线证据

日期：2026-10-29（Asia/Hong_Kong）。工作目录：`D:\source\alchemion`。
历史代码基准 `06784cf`；M0 前置文档提交 `9742727`；实施分支 `codex/m1-foundation`。

## 原始基线

以下均在修改 manifest/lockfile 和搬迁源码之前运行，Node 24.14.0、pnpm 9.7.0。

| 命令                                                                                                                                                             | 退出码 | 结果                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                                 | 0      | 已通过；291 packages，41.7 秒。依赖归类差异没有导致 pnpm 9.7.0 拒绝冻结安装；不得描述为已复现锁冲突。 |
| `pnpm exec vitest run src/parsers/cif-parser/__tests__/index.test.ts src/parsers/cif-parser/__tests__/cif-document-parser.test.ts --maxWorkers=4 --minWorkers=4` | 1      | 19 通过、1 失败。缺失 `_atom_site_type_symbol` 时直接索引 undefined，`cif-parser/index.ts:31`。       |
| `pnpm lint`                                                                                                                                                      | 0      | 已通过。                                                                                              |
| `pnpm build`                                                                                                                                                     | 0      | 已通过；2898 模块，Vite 构建 54.60 秒；ES/CJS 和内联 Worker 是历史输出，不是新版分发证据。            |

旧结构用例尚未执行到其 29 原子断言；fixture 的 atom loop 实际仅 Ca、Sr、Ti、O1、O2 五条源记录。M1 复用原用例校正预期，不把对称扩展数当源记录数。原 Vitest 1.6 的字符串 `toMatchObject` 未失败，只有升级后证实需要时才调整 matcher。

## 环境与依赖决定

- 固定 Node 24.22.1、pnpm 9.7.0。系统 Node 不修改；任务使用 `.tools` 下的便携 Node。
- nodejs.org 直接下载发生 TLS 连接中断；改从 npm 的 `node-win-x64@24.22.1` 精确版本取得二进制（仓库指向 `aredridel/node-bin-gen`），实际 `node --version` 为 v24.22.1。这不是一次成功的 nodejs.org 下载。
- Vite 7.3.5、TypeScript 5.9.3、Vitest 4.0.18、ESLint 9.39.1、typescript-eslint 8.50.0、Playwright 1.63.0 的 registry engines/peer 元数据均覆盖选定组合。采用 TypeScript 声明生成，移除 vite-plugin-dts。
- 一手资料：[Node 24.22.1](https://nodejs.org/en/blog/release/v24.22.1)、[Vite 支持范围](https://vite.dev/releases)、[Vite 模块 Worker](https://vite.dev/guide/features.html#web-workers)、[Playwright 安装](https://playwright.dev/docs/intro)。

## 当前验证策略

仅验收两个迁移 CIF 文件、M1 三浏览器冒烟、真实 tarball 子路径/声明/两层 Worker、工程静态检查、干净冻结安装和短 bench。默认 4 进程、无自动重试。原始基线和迁移后验证的技术目的不同；最终干净 checkout 是重现性关卡。后续重复/扩展仅针对变动或失败，并在此登记原因。

## 实施后结果

### 已定位并修复的阻塞

- 新 Vitest 两个原文件：19 通过、1 失败，实际源原子数 5、旧断言 29。改为核对五个源标签。6 处字符串 matcher 虽能运行，但新类型声明拒绝向 `toMatchObject` 传入字符串；改成 `toBe` 并保留全部预期字符串。
- ESLint 9 启用的基础规则发现旧正则无用转义和两个未用 catch 参数；只做等价词法清理。CIF2 允许 TAB/LF/CR 的正则有意保留控制码并给出行内说明，没有关闭整类 lint。
- SDK 类型与构建通过；core/formats 在无 DOM、无 Node 全局的独立 TS 配置下通过；正式 viewer 声明不再出现 Babylon 引擎类型。
- pnpm 9.7 的 `--filter ... pack` 被转为不支持的 recursive pack；改为在 SDK 工作目录执行 `pnpm pack`。
- 初次隔离消费者构建只输出外层 `index-BewfPGKG-BK9MC7fy.js`，没有内层 atom-worker。三浏览器 nested 用例均超时失败（60 秒，自动重试为 0）。Vite 将 SDK Worker URL 包装为字符串拼接，二次构建只将其识别为普通 asset。增加固定版本的产物正规化步骤，保留两层原生静态模块 Worker 构造；主构建和 watch 都执行，消费者不复制资产兜底。仅针对这次分发修复重跑 package 场景。
- 消费者声明验证移除 `skipLibCheck`；新导出的、依赖私有 TokenStream 的 CifDocumentParser 类撤回，避免产生不可使用的公开接口。
- Worker 修复后两层资源均进入消费者生产构建，实际计算完成；三浏览器进一步暴露空拾取。失败截图显示球体比例畸变：Engine 在 canvas 挂入容器前创建，使用了默认画布尺寸。将挂载移到 Engine 创建前，失败仍在 catch 中清理。仅重跑受影响的 Chromium package 场景定位修复，1/1 通过；最终干净验收再执行三浏览器矩阵。

后续按真实命令补充最终关卡。不将 M1 机械迁移作为 M3–M5 科学、异步或完整生命周期通过证据。

### Bench 采集冒烟

`pnpm bench -- --smoke` 退出 0。128 原子、0 键，实际采集 120 个 RAF 间隔；加载 840.5 ms，帧间隔 p95 为 166.7 ms。Node 24.22.1，Chromium 153.0.8010.12，Windows 10.0.26300，Intel Core Ultra X7 358H，内存 33,840,197,632 bytes。WebGL2 renderer 为 ANGLE/Vulkan/SwiftShader（软件渲染）。[原始样本](m1-bench-smoke.json) 已保存；该结果只证明采集入口可用，不是桌面 GPU 或一万实例性能通过结论。只运行此一次短采集，不重复做 M2 基准。
