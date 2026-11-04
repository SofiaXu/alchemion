# 开发、构建与验证工具

本指南维护当前可执行命令、工具归属和输出位置。SDK 能力与接口见[产品](product.md)和[架构](architecture.md)，测试场景、独立参考方法与性能预算见[质量规范](quality.md)。

## 环境与启动

Node 固定为 **26.13.0**（`.node-version`），pnpm 固定为 **12.16.1**（根 `packageManager`）。从仓库根目录执行：

```sh
npm install --global pnpm@12.16.1
pnpm install --frozen-lockfile
pnpm exec playwright install chromium firefox webkit
pnpm dev
```

Linux 安装浏览器使用 `pnpm exec playwright install --with-deps chromium firefox webkit`。Windows 本机如已有 `.tools/pnpm.cmd`，可用它同时固定 Node/pnpm；该忽略目录是本机便利入口，不是仓库消费者的前提。不跳过依赖安装脚本，安装策略由 `pnpm-workspace.yaml` 声明。

当前编译器为 TypeScript 7.0.2，通过 `@typescript/native` 别名提供原生 `tsc`。`typescript` 指向官方 `@typescript/typescript6` 6.0.2 API 包，供 typescript-eslint 使用受支持的 API 版本，不忽略不兼容 peer。Vite 8.3.5、Vitest 5.0.5、ESLint 10.13.0、Playwright 1.64.1、Prettier 3.9.10 和 Three 0.186.1 均精确固定；完整依赖以 package manifest 和锁文件为准。仓库外消费者使用根 manifest 中相同的编译器/Vite 版本。

SDK 构建固定 `json: { stringify: true, namedExports: false }`，使科学/格式 JSON 表以 `JSON.parse` 字符串表达，不把新版 Unicode 数据键改成 JavaScript 标识符。某些 WebKit 的标识符 Unicode 表早于数据版本；仅 ASCII 转义仍可能产生不支持的标识符。真实产物消费者检查 Unicode 16 CIF 名称大小写折叠及 MOL 同位素参考，数据表本身不降级或修改。该配置使用 [Vite JSON 选项](https://vite.dev/config/shared-options.html#json-stringify)。

## 当前命令

| 命令                                                  | 行为                                                                                                                      |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev` / `pnpm demo`                              | 准备 SDK/声明和离线来源资产，监听 SDK 更新，启动独立 demo；demo 只消费正式子路径。                                        |
| `pnpm dev -- --smoke --prepared`                      | 复用同轮 SDK，在 Chromium 检查开发模式 Worker、编辑、导出及进程释放。                                                     |
| `pnpm build`                                          | 按 SDK 类型/ESM/模块 Worker/声明 → demo 顺序生产构建。                                                                    |
| `pnpm typecheck`                                      | 准备 SDK 后检查无 DOM core/formats、SDK、demo、测试和配置。                                                               |
| `pnpm lint` / `pnpm format:check`                     | 显式全仓只读检查；普通任务可对实际改动文件调用对应工具。                                                                  |
| `pnpm test <文件路径>`                                | 单次定向 Vitest，默认最多4进程，无重试。                                                                                  |
| `pnpm test:watch`                                     | 显式启用 Vitest watch。                                                                                                   |
| `pnpm test:browser -- --suite=runtime`                | 独立控制器和真实计算 Worker 的异步、事务、错误与生命周期场景。                                                            |
| `pnpm test:browser -- --suite=viewer`                 | 正式 viewer 的显示/拾取/测量/编辑、取消/恢复、上下文及资源场景。                                                          |
| `pnpm test:browser -- --suite=demo`                   | 生产 demo 的三浏览器用户路径；默认 suite 为 demo。                                                                        |
| `pnpm test:package`                                   | 唯一真实 tarball 消费者；仓库外安装后检查声明、三个入口、嵌套静态 Worker URL、编辑/历史、双实例和20轮释放，默认三浏览器。 |
| `pnpm bench`                                          | 唯一正式包 10k原子/20k键基准，两模式各三轮，GPU 独占串行。                                                                |
| `pnpm bench -- --artifacts-only`                      | 只构建/检查真实包与 raw/minified/gzip、引擎/Worker 分项，不运行硬件性能关卡。                                             |
| `pnpm ci:changes --scope`                             | 按提交 diff（含删除）选择受影响关卡。                                                                                     |
| `pnpm ci:changes --scope --worktree`                  | 只读检查当前已跟踪与新增工作区文件的关卡/功能过滤。                                                                       |
| `pnpm ci:changes --unit` / `pnpm ci:changes --checks` | 分别运行受影响单元或现存改动文件的 lint/格式/文档检查，每次只传一种模式。                                                 |
| `pnpm docs:check`                                     | 检查仓库 Markdown 本地链接及 Markdown 标题锚点。                                                                          |
| `pnpm check`                                          | 人工显式全量入口，依次格式/lint/构建/类型/单元/浏览器/消费者，不包含硬件基准，不作为普通任务默认验证。                    |

`--prepared` 只复用本轮已构建且输入匹配的 SDK；不能依赖上个会话的 dist。`--project=chromium|firefox|webkit` 和 `--grep=<正则>` 定向选择浏览器或场景，不能用子集宣称完整集合通过。普通场景默认4进程，可配置 `TEST_WORKERS`，无自动重试。

真实晶体页面回归可执行 `pnpm test:browser -- --suite=demo --grep=@real-crystals`，默认在三个浏览器检查[固定 COD 实验 CIF](../tests/fixtures/crystals/README.md)，无需运行时联网。原始文件也可直接从该目录选择导入 demo；样例的实验条件、预期与诊断边界见夹具说明。

`--phase`、`check:m1` 和 `bench --smoke` 已删除，调用时明确报错，不兼容转发到其他 suite。按功能选择 runtime/viewer/demo，包消费者和正式基准各只有一个入口。

五项结构工作台能力使用 `@features` 浏览器标签，viewer 另保留直接受影响的派生编辑/历史回归。CI 在已知功能实现与入口增量的 diff 内输出对应 `*_grep`，本地通过同一 `--grep` 选择；未知共享修改保留保守路由。只检查 POSCAR 时不因新增 `ParseOptions` 联合而默认执行全部 CIF/MOL 用例。单元可显式 `--maxWorkers=8`，浏览器 `TEST_WORKERS=4`；不为凑并行复制单场景。

开发 watcher 会改写 SDK dist。需要开发冒烟与生产消费者/基准时，先开发冒烟，再生产构建，然后用 `--prepared` 复用同轮生产产物；不能把开发产物误当最终生产包。独立命令自行准备前置产物，聚合任务可复用一次构建，SDK 源类型检查不依赖 demo。

## 测试宿主、脚本与 CI

计算结果的浏览器路径使用 `--grep=@calculation-results`。用同轮 `pnpm build` 产物运行 `pnpm test:browser -- --suite=viewer --prepared --grep=@calculation-results`、`pnpm test:browser -- --suite=demo --prepared --grep=@calculation-results` 与 `pnpm test:package -- --prepared --grep=@calculation-results`。共享呈现或 Worker 有改动时，按 CI 路由补充直接受影响的旧场景。科学与解析按对应 Vitest 文件或用例选择。

建模浏览器路径使用 `--grep=@modeling`，真实 CIF 兼容回归使用 `--grep=@real-crystals`。`pnpm test:package -- --prepared --grep=@modeling` 使用本轮生产 SDK 验证真实 tarball 的对称 WASM 与释放。单元验证按相关文件或用例选择，CI 根据已识别的建模变更路由。

科研工作台的表单映射、教程导航和示例失效用 `--suite=demo --grep=@kit` 定向验证。仅检查布局、键盘与预览对话框时使用 `--grep=@kit-navigation`。

| 位置                                                  | 用途                                                  |
| ----------------------------------------------------- | ----------------------------------------------------- |
| `tests/runtime`                                       | 无 canvas 的控制器/计算运行时浏览器宿主。             |
| `tests/viewer`                                        | 三维功能宿主、可重复图形夹具与硬件基准场景。          |
| `tests/consumer`                                      | 打包消费者入口和公开 API/生命周期验证。               |
| `tests/shared/resources.ts`                           | 跨宿主资源计数及所有权观察，避免多套独立实现。        |
| `scripts/tasks.mjs`                                   | SDK/demo 构建、浏览器宿主、消费者准备和命令编排。     |
| `scripts/pnpm.mjs`                                    | 通过 npm_execpath 调用固定 pnpm 原生可执行文件。      |
| `scripts/worker-urls.mjs`                             | 构建 Worker 静态 URL 归一和真实资产检查。             |
| `scripts/viewer-bench.mjs`                            | 唯一正式 viewer 硬件/体积采集器。                     |
| `scripts/demo-assets.mjs` / `scripts/format-data.mjs` | 离线来源声明、科学/格式数据 manifest 校验和构建资产。 |

默认 Playwright 配置用于 demo；runtime、viewer、package 各有专用配置。普通功能使用 Chromium/Firefox/WebKit；开发模式差异仅 Chromium。Playwright WebKit 不构成真实 Safari 结论，CI 软件图形也不构成硬件性能结论。

[交付 CI](../.github/workflows/ci.yml)在 Ubuntu 24.04 上使用同一固定 Node/pnpm、冻结安装和公共命令，按实际 diff 选择单元、构建/类型、runtime/viewer/demo、开发冒烟和真实消费者。变化的路径包括删除项，格式/lint 只检查仍存在的改动文件；文档归档不触发无关科学/格式或硬件重测。`ci:changes` 比较提交，不覆盖当前未提交工作区；本地审查须额外检查实际修改/新增文件。

## 结果与临时产物

| 输出                                 | 内容                                             |
| ------------------------------------ | ------------------------------------------------ |
| `.tmp/runtime-browser.json`          | runtime 浏览器结果。                             |
| `.tmp/viewer-browser.json`           | viewer 浏览器结果。                              |
| `.tmp/demo-browser.json`             | 生产 demo 用户路径。                             |
| `.tmp/package-browser.json`          | 唯一打包消费者。                                 |
| `.tmp/demo-dev.json`                 | 开发冒烟与释放。                                 |
| `.tmp/package-inspection.json`       | tarball 内容/声明/Worker/散列检查。              |
| `.tmp/demo-assets.json`              | demo 离线来源资产检查。                          |
| `.tmp/bench/viewer`                  | 硬件逐轮数据、环境、体积与截图。                 |
| `.tmp/format-reference`              | 自产格式输入、SDK 输出、算术预期和独立工具报告。 |
| `playwright-report` / `test-results` | Playwright 报告与附件，由 CI 按需上传。          |

结果保留首轮失败和后续修正的对应关系，失败、未运行、通过分开记录。采样输入或产物改变时不能拼成同一轮成绩。持久文档只保留当前能力、约束和方法；未完成任务进入[计划索引](plan/README.md)，原始日志留在 `.tmp` 或 CI artifacts。

## 独立参考与数据工具

重建对称识别资产时，在临时目录检出 spglib `v2.6.0`，激活 Emscripten `4.0.23`，运行 `python scripts/spglib-wasm/build.py <spglib-checkout>`。脚本核对提交与编译器，更新浏览器资产、许可证及 SHA-256 清单。日常 SDK 构建使用已固定的资产并校验其散列。

### 源编辑定向归因

现有 `bench` 采集器提供独立诊断入口，复用真实 tarball、固定 10k 原子/20k 键及正式源/相机配置，仅执行源编辑归因所需的更新，不运行完整性能关卡：

```sh
pnpm bench --prepared --profile-source-edit --profile-label=final
```

`--prepared` 仅使用本轮匹配构建；缺省为球棍、3 次确定的百原子更新。`--profile-consumer=<package.json记录路径>` 可使用已经冻结的真实消费者，防止并行开发改变 baseline。采集前后核对源码、包、夹具与选项 SHA，保留 main/Worker CPU profile、互斥分类、Worker 往返、完整帧和 wall 窗口对应，结果在 `.tmp/feature-directions/profile`（标签形成子目录）。每个标签的失败记录应另存后再修复复验，不覆盖已认可 baseline。

该入口用于定位与改动复核，含 profiler 开销；采样 CPU 不是精确函数计时，main/Worker CPU 不能相加当 wall。copy 分类仅覆盖已识别的复制/快照帧，其他克隆可能归入 other；Worker 往返含传递和排队。三次诊断不构成 p95、完整 T-PERF-01 或跨设备倍速承诺。GPU 采样独占串行。

### 独立科学与格式参考

这些工具供有意更新科学数据或验证语义时使用，不属于普通安装/文档检查，也不把开发 Python 包加入 SDK 运行依赖。科学方法、容差和固定版本详见[质量规范](quality.md#独立科学参考)。

科学环境使用 Python 3.12.10，并按[requirements](../scripts/scientific-data/requirements.txt)建立专用 venv，例如 `.tmp/scientific-reference-env`。设置 `OPENBLAS_NUM_THREADS=1`、`OMP_NUM_THREADS=1` 后执行：

```sh
python scripts/scientific-reference.py --output .tmp/scientific-reference-review.json
```

这里的 `python` 必须来自上述固定环境。默认输出为已认可的测试 golden，生成器拒绝覆盖；先用新路径对照输入、数值与完备性证书，再审查是否更新。不要为格式化重生成参考。

格式核验使用单独的 Python 3.12.10 环境，依赖见[format-reference-requirements.txt](../scripts/format-reference-requirements.txt)。先构建当前 SDK，再生成自产样例和输出，最后用固定 Python 核验：

```sh
pnpm --filter alchemion build:source
node --experimental-strip-types scripts/format-cif-fixtures.ts
node scripts/format-mol-fixtures.mjs
python scripts/format-reference.py
```

所有输入/输出在 `.tmp/format-reference`；核验器支持 `--file=<相对文件>` 与 `--report=<文件名>`，用于有具体原因的定向复验与分开保留结果。工具不会上传用户文件。Windows expected JSON 显式 UTF-8，Open Babel 的有限参考适配规则见[质量规范](quality.md#独立格式核验)。

POSCAR 导入有独立的最小参考入口，使用同一固定 Python 环境：

```sh
node scripts/format-poscar-fixtures.mjs
python scripts/format-reference.py --poscar-imports-only --report=poscar-import-results.json
```

它只生成并核对新增 POSCAR 的五组算术输入、SDK 读取结果及对应导出，不加载 CIF/MOL 预期或执行无关格式核验。实际工具、逐文件 SHA 与结果由报告记录。

| 数据工具                                                              | 维护对象与约束                                                                                                                                                      |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [scientific-data/generate.py](../scripts/scientific-data/generate.py) | 从固定 periodictable/spglib 来源生成元素/共价半径/setting、科学 manifest 和对应声明；上游字节在 `.tmp` 缓存并核 SHA。输出变更需审查科学数据、许可和完整第三方声明。 |
| [generate-vdw-data.mjs](../scripts/generate-vdw-data.mjs)             | 从固定 mendeleev-data 源提取 `vdw_radius_alvarez`、pm→Å、缺失保持缺失，更新范德华 manifest/许可；不重生成质量/共价半径/setting。                                    |
| [format-data.mjs](../scripts/format-data.mjs)                         | 核验 Unicode/RDKit 许可与分发表 SHA，生成 SDK dist 中的格式 manifest。                                                                                              |
| [demo-assets.mjs](../scripts/demo-assets.mjs)                         | 核验科学/范德华/格式来源和许可，生成 demo 的离线声明与数据清单。                                                                                                    |

源、版本、转换和分发要求统一见[数据来源台账](data-sources.md)。变更单位、容差、数据、成键、对称或格式语义时，同步领域规范和相关独立验证。
