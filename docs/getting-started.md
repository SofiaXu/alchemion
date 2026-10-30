# SDK 快速开始

Alchemion 是面向晶体和分子的浏览器 TypeScript SDK，运行目标为现代桌面 WebGL2。SDK 只有 `alchemion/core`、`alchemion/formats`、`alchemion/viewer` 三个公开 ESM 入口。Node.js 和 pnpm 用于开发构建，Node.js 运行时不是 SDK 支持目标。

## 构建与安装实际包

本仓库完成了打包消费者验证，尚未发布 npm 包或线上站点。不要假设 `pnpm add alchemion` 会取得本仓库产物。先按[开发指南](development.md)准备仓库固定的 Node/pnpm，在仓库根执行：

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm --dir packages/alchemion pack --pack-destination ../../.tmp/packages
```

最后一步生成 `.tmp/packages/alchemion-<version>.tgz`，版本来自 SDK 的 `package.json`。在仓库外的 TypeScript/ESM 浏览器项目中安装该实际文件；下面的路径须替换为生成位置，Windows 可用 `D:/.../alchemion-<version>.tgz`：

```sh
pnpm add "/absolute/path/to/alchemion-<version>.tgz"
```

仓库的实际消费者路径使用 Vite：通过公开子路径导入完整安装包，让构建器处理 ESM、静态 `import.meta.url` 和模块 Worker 资产。不要使用 SDK 源码 alias、深层导入或只复制单个 `viewer.js`。将构建目录及其资产一起通过 HTTP/HTTPS 提供；模块 Worker 不能靠直接打开本地 HTML 文件验证。开发依赖版本和消费者检查命令见[开发指南](development.md)与[质量规范](quality.md)。

如果只想使用工作台，在仓库根运行 `pnpm dev`，打开命令输出的地址；完整操作见[demo 指南](demo.md)。

## 完整 TypeScript 示例

在一个已安装该 tarball 的浏览器项目中，将下面代码保存为 `src/main.ts`，由 HTML 的 `<script type="module" src="/src/main.ts"></script>` 载入。TypeScript 使用 ESM、Bundler 模块解析和 ES2022/DOM 类型。代码展示 CIF 导入、科学结果检查、显示、一次事务、撤销及 CIF 导出。

<!-- typecheck:quickstart -->

```ts
import { createStructureSnapshot } from 'alchemion/core'
import type { Diagnostic } from 'alchemion/core'
import { parseStructure, writeStructure } from 'alchemion/formats'
import { createViewer, ComputationError } from 'alchemion/viewer'

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

function reportDiagnostics(items: readonly Diagnostic[]): void {
  for (const item of items) console.log(item.severity, item.code, item.message)
}

async function mount(): Promise<void> {
  const parsed = parseStructure(cifText, { format: 'cif' })
  reportDiagnostics(parsed.diagnostics)
  if (!parsed.structure) throw new Error('CIF did not produce a structure.')

  // 自建源结构也使用此工厂；ScientificResult 须先检查 ok。
  const checked = createStructureSnapshot(parsed.structure)
  reportDiagnostics(checked.diagnostics)
  if (!checked.ok) throw new Error('The source structure is invalid.')

  const container = document.createElement('div')
  container.style.width = '100%'
  container.style.height = '480px'
  document.body.append(container)

  const viewer = createViewer(container, {
    renderMode: 'ball-and-stick',
    interactionMode: 'select',
    showLattice: true
  })
  const unsubscribe = viewer.subscribe((event) => {
    if (event.type === 'state') console.log(event.state.status, event.state.revision)
    if (event.type === 'error') reportDiagnostics(event.diagnostics)
  })
  let disposed = false
  function dispose(): void {
    if (disposed) return
    disposed = true
    window.removeEventListener('pagehide', dispose)
    unsubscribe()
    viewer.dispose()
    container.remove()
  }
  window.addEventListener('pagehide', dispose, { once: true })

  try {
    await viewer.load(checked.value)
    const atom = viewer.getSnapshot()?.atoms[0]
    if (!atom) throw new Error('The example needs one source atom.')
    await viewer.execute({ type: 'set-element', atomId: atom.id, element: 'O' })
    await viewer.undo()

    const source = viewer.getSnapshot()
    if (!source) throw new Error('The document was cleared.')
    const written = writeStructure(source, { format: 'cif', version: '2' })
    reportDiagnostics(written.diagnostics)
    if (written.text === undefined) throw new Error('Export requires resolving the diagnostics.')
    console.log(written.text)
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return
    dispose()
    throw error
  }
}

void mount().catch((error: unknown) => {
  if (error instanceof ComputationError) reportDiagnostics(error.diagnostics)
  else console.error(error)
})
```

格式函数返回可选 `structure/text` 与诊断，科学函数返回带 `ok` 的结果；两者都不能只靠 try/catch 判断成功。Viewer 的异步方法在相应完整帧后完成。调用者取消、后续请求取代、clear 或 dispose 会使未完成操作以 `AbortError` 结束，应作为正常控制流处理。

`cancel()` 保留已接受的源和历史，`recompute()` 恢复显示，不增加事务或修订。`clear()` 清空文档与历史，`dispose()` 释放 Viewer 自有资源；宿主卸载组件时应退订并销毁，不只移除容器。

导出默认拒绝科学损失。示例遇到损失会报告并停止；实际应用应先展示具体损失，在用户接受当前源与选项的这次输出后才传 `allowLoss: true`。硬性格式限制始终有效，详见[formats API](api/formats.md)。

## 选择合适的入口

| 任务                                                         | 入口与文档                              |
| ------------------------------------------------------------ | --------------------------------------- |
| 构造/校验源结构，晶胞、对称、成键、测量、倒易/BZ，纯同步事务 | [`alchemion/core`](api/core.md)。       |
| CIF/MOL 文本读写、周期 POSCAR 输出、CIF 文档 AST             | [`alchemion/formats`](api/formats.md)。 |
| 三维 Viewer，或独立异步编辑控制器/计算运行时                 | [`alchemion/viewer`](api/viewer.md)。   |

core/formats 不依赖 DOM，也没有导入时的场景/Worker 副作用；完整浏览器运行与支持范围仍以[架构](architecture.md)和[产品规范](product.md)为准。所有正式文档入口见[文档导航](README.md)。
