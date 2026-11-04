# Alchemion 交付与集成说明

Alchemion 0.1.0 是面向现代桌面浏览器和 WebGL2 的晶体、分子结构 TypeScript SDK。本说明随交付包提供，也可在已有 Vite 项目中单独使用。SDK 尚未发布到 npm；使用交付的实际 tarball 安装。Node.js 用于开发和构建，不是 SDK 的目标运行环境。

## 交付内容

解压交付 ZIP 后，内容如下：

```text
INTEGRATION.md           本说明
alchemion-0.1.0.tgz       SDK 安装包：ESM、TypeScript 声明、Worker、数据与许可
demo/                     独立工作台的生产静态文件
  index.html
  assets/                 脚本、样式和模块 Worker
  generated/              离线来源、数据清单与许可
```

不要只复制 SDK 中的某个 JavaScript 文件；安装完整 tarball，并保留构建器生成的全部资产。安装时包管理器还要取得 SDK 声明的 `three@0.186.1` 依赖；tarball 本身不包含该依赖，离线安装需预先准备包管理器缓存或内部镜像。

## 安装到浏览器项目

在已有 TypeScript/ESM 浏览器项目的根目录运行，将路径改为解压后的实际文件位置：

```sh
pnpm add "/absolute/path/to/alchemion-0.1.0.tgz"
```

Windows 例如 `pnpm add "D:/delivery/alchemion-0.1.0.tgz"`。不要用 `pnpm add alchemion` 假定能从公共 registry 获取本交付版本。当前实际消费者使用 Node 26.13.0、pnpm 12.16.1、Vite 8.3.5 和 TypeScript 7.0.2；下面的命令假定 Vite 已安装在宿主项目中。TypeScript 应使用 ESM、`moduleResolution: "Bundler"` 及 ES2022/DOM 类型。

只使用以下公开子路径：

| 入口                | 用途                                             |
| ------------------- | ------------------------------------------------ |
| `alchemion/core`    | 结构模型、科学计算及同步编辑事务                 |
| `alchemion/formats` | CIF、MOL 和 POSCAR 文本导入导出                  |
| `alchemion/viewer`  | 浏览器三维显示、交互、异步编辑控制器和计算运行时 |

不提供包根入口、CommonJS 或内部文件深层导入。支持的格式与限制以安装包声明和项目产品规范为准；POSCAR 的范围是 VASP5 几何信息。

## 最小显示示例

在 Vite 项目的 `index.html` 的 `<body>` 中提供有尺寸的容器和状态显示：

```html
<div id="viewer" style="width: 100%; height: 480px"></div>
<p id="viewer-status"></p>
<script type="module" src="/src/main.ts"></script>
```

将以下代码保存为 `src/main.ts`：

```ts
import { parseStructure } from 'alchemion/formats'
import { createViewer } from 'alchemion/viewer'

const cifText = `data_example
_cell_length_a 4
_cell_length_b 4
_cell_length_c 4
_cell_angle_alpha 90
_cell_angle_beta 90
_cell_angle_gamma 90
loop_
_atom_site_label
_atom_site_type_symbol
_atom_site_fract_x
_atom_site_fract_y
_atom_site_fract_z
C1 C 0.25 0.25 0.25
`

const container = document.querySelector<HTMLElement>('#viewer')
const status = document.querySelector<HTMLElement>('#viewer-status')
if (!container || !status) throw new Error('Viewer elements are missing.')

const parsed = parseStructure(cifText, { format: 'cif' })
for (const diagnostic of parsed.diagnostics) console.log(diagnostic)
if (!parsed.structure) throw new Error('CIF did not produce a structure.')

const viewer = createViewer(container, { renderMode: 'ball-and-stick', showLattice: true })
const unsubscribe = viewer.subscribe((event) => {
  if (event.type === 'state') status.textContent = event.state.status
  if (event.type === 'error') console.error(event.diagnostics)
})
void viewer.load(parsed.structure).catch((error: unknown) => {
  if (error instanceof Error && error.name === 'AbortError') return
  console.error(error)
})

function onPageHide(event: PageTransitionEvent): void {
  if (event.persisted) return
  unsubscribe()
  viewer.dispose()
  window.removeEventListener('pagehide', onPageHide)
}
window.addEventListener('pagehide', onPageHide)
```

执行 `pnpm exec vite --host 127.0.0.1`，打开输出的 HTTP 地址。正常载入后状态显示 `ready`，容器内出现晶胞和原子。`createViewer` 在容器无效或 WebGL2 不可用等情况下可能抛错，实际宿主应展示错误。

## 集成与生命周期

- 解析结果须检查 `structure` 和 `diagnostics`；科学函数须检查 `ScientificResult.ok`。不能仅靠异常判断科学或格式操作是否成功。
- `viewer.load`、编辑、撤销及重算等方法异步完成；对应完整帧提交后 Promise 才完成。请求被取消、取代或销毁时可能以 `AbortError` 结束。
- 组件卸载时调用订阅返回的退订函数及 `viewer.dispose()`；调用者仍负责自己的 DOM、监听器和下载 URL。单页应用应将清理绑定到组件卸载，而不是只依赖页面关闭。
- `clear()` 清空文档及历史；`cancel()` 保留已接受的源和历史，后续可调用 `recompute()`。一次编辑命令或命令数组对应一次历史事务。
- 格式导出可能报告科学损失并拒绝输出。先向用户展示具体损失，在接受当前源与选项的本次输出后才传 `allowLoss: true`；硬性格式限制不能通过该选项绕过。

## 构建和部署

使用能处理 ESM、静态 `import.meta.url` 与模块 Worker 的构建器。Vite 生产构建例如：

```sh
pnpm exec vite build --base=./
```

将构建目录中的 HTML、脚本、样式和 Worker 资产一起通过 HTTP/HTTPS 发布。若部署到子目录，确保访问目录 URL 以 `/` 结尾，并按宿主路径配置构建器的 `base`；上例相对路径适合目录式静态部署。服务器须以正确 JavaScript MIME 类型返回模块和 Worker；如启用 CSP，还须允许同源模块 Worker 及页面资产。不要直接双击 `file://` HTML 验证 Worker，也不要在服务端渲染阶段创建 Viewer。

交付包中的 `demo/` 已按相对基础路径构建，可整体发布到站点根目录或子目录。临时本地预览可在 `demo/` 目录运行 `python -m http.server 8080`，再访问 `http://127.0.0.1:8080/`；部分系统使用 `python3`。这是本地静态预览命令，生产环境使用自己的 HTTP/HTTPS 服务器。

## 许可与接口资料

SDK tarball 内的 `LICENSE`、`THIRD_PARTY_NOTICES.md` 和数据 manifest 记录项目许可及相关科学数据来源；安装后的 Three.js 依赖自带许可。独立 demo 的 `generated/notices.txt` 与 `generated/data-manifests.json` 提供离线声明，发布 demo 时须一并保留。完整类型声明随 SDK 包安装；在源码仓库中可查阅 `docs/getting-started.md` 和 `docs/api/` 获取编辑、导出及完整 API 说明。

## 从源码重新准备交付

维护者在仓库根目录使用固定 Node/pnpm，先安装依赖和 Playwright 的 Chromium、Firefox、WebKit，再执行：

```sh
pnpm build
pnpm test:package -- --prepared
pnpm --dir apps/demo exec vite build --base=./ --outDir ../../.tmp/portable-demo
```

`--prepared` 只复用本轮构建。第二条命令生成并验证真实 tarball；其路径和 SHA-256 记录在 `.tmp/package-inspection.json` 的 `archive` 和 `tarballSha256` 字段。第三条命令将相对路径 demo 构建到一个新的、空的输出目录；若使用其他目录，应相应修改命令。交付时把通过验证的同一 tarball、此 demo 目录和本说明 `docs/integration.md`（复制为 `INTEGRATION.md`）放入新目录，再将该目录内容压缩为 ZIP。解压后通过 HTTP 子目录检查工作台和 Worker，并核对 tarball 散列。构建产物不代表已经发布到 npm 或线上站点。
