import type { ModelingTask } from 'alchemion/viewer'
import { tr, type Locale } from './i18n'
import './guides.css'

type Copy = readonly [en: string, zh: string]
type Mode = 'examples' | 'tutorials'
type Panel = 'import' | 'display' | 'measure' | 'edit' | 'model' | 'results' | 'export'
type ModelKind = ModelingTask['kind']
type Tool = readonly [panel: Panel, kind?: ModelKind]
export type ExampleId = 'crystal' | 'orthogonal' | 'molecule' | 'results'

interface Step {
  readonly title: Copy
  readonly instruction: Copy
  readonly tool?: Tool
  readonly recipe?: unknown
}

interface Workflow {
  readonly id: string
  readonly label: Copy
  readonly format: string
  readonly description: Copy
  readonly example?: ExampleId
  readonly steps: readonly Step[]
}

const crystalRecipe = {
  cell: { a: 4, b: 4, c: 4, alpha: 90, beta: 90, gamma: 90 },
  symmetry: { spaceGroup: { hallNumber: 1 } },
  atoms: [{ id: 'C1', element: 'C', fractional: [0, 0, 0] }]
}
const polymerRecipe = {
  recipe: { kind: 'homopolymer', unit: 'ethylene', count: 2 },
  ends: [
    { unit: 0, port: 'head', fragment: 'hydrogen', distance: 1.09 },
    { unit: 1, port: 'tail', fragment: 'hydrogen', distance: 1.09 }
  ]
}

const workflows: readonly Workflow[] = [
  {
    id: 'reciprocal',
    label: ['From CIF to reciprocal space', '从 CIF 到倒易空间'],
    format: 'CIF',
    description: [
      'Compare two teaching cells and connect the real-space lattice to its first Brillouin zone.',
      '比较两个教学晶胞，查看实空间晶格与第一布里渊区的对应关系。'
    ],
    example: 'crystal',
    steps: [
      {
        title: ['Choose the inclined cell', '选择倾斜晶胞'],
        instruction: [
          'Load the two-block example, choose oblique in the block list and click Read / import. The cell angles are 80°, 75° and 70°.',
          '加载双 block 示例，在候选列表选择 oblique，再点击「读取 / 导入」。晶胞角度依次为 80°、75°、70°。'
        ],
        tool: ['import']
      },
      {
        title: ['Trace a displayed atom', '追溯显示原子'],
        instruction: [
          'Activate Select atom or bond and click an atom. Check its source ID, symmetry operation and cell offset in the inspector.',
          '启用「选择原子或键」后点击一个原子。在检查器查看源 ID、对称操作和晶胞偏移。'
        ],
        tool: ['measure']
      },
      {
        title: ['Compare both spaces', '比较实空间和倒易空间'],
        instruction: [
          'Enable Cell and lattice directions, Reciprocal lattice and First Brillouin zone, then click Apply display settings. Rotate the crystal and compare the Å cell with the inset in Å⁻¹.',
          '开启「晶胞与晶格方向」「倒易晶格」和「第一布里渊区」，再点击「应用显示设置」。旋转结构，对照以 Å 显示的晶胞与以 Å⁻¹ 显示的小视窗。'
        ],
        tool: ['display']
      }
    ]
  },
  {
    id: 'measurement',
    label: ['Molecular measurements and figures', '分子测量和出图'],
    format: 'MOL V3000',
    description: [
      'Use a four-atom teaching molecule to check distance, angle and signed torsion.',
      '用四原子教学分子验证距离、夹角和有符号二面角。'
    ],
    example: 'molecule',
    steps: [
      {
        title: ['Measure a bond and an angle', '测量键长和夹角'],
        instruction: [
          'Load the molecule. Activate Distance and pick C then O for 3 Å. Activate Angle and pick C, O, N for 90°.',
          '加载分子。启用距离工具，依次点击 C 和 O，结果为 3 Å。启用角度工具，依次点击 C、O、N，结果为 90°。'
        ],
        tool: ['measure']
      },
      {
        title: ['Measure a signed torsion', '测量有符号二面角'],
        instruction: [
          'Activate Signed dihedral and pick C, O, N and S in that order. The inspector displays the positive value as 90.0000 °.',
          '启用有符号二面角工具，依次点击 C、O、N、S。检查器显示的 90.0000 ° 为正值。'
        ],
        tool: ['measure']
      },
      {
        title: ['Export the figure', '导出图片'],
        instruction: [
          'In the PNG section set the image dimensions and choose a background. Download the PNG with the current measurement label.',
          '在 PNG 图片区设置尺寸和背景，下载带当前测量标签的图片。'
        ],
        tool: ['export']
      }
    ]
  },
  {
    id: 'defects',
    label: ['Crystal, supercell and defects', '建晶、超胞和缺陷'],
    format: 'P1',
    description: [
      'Build a P1 carbon cell, expand it into editable sites and make a reversible substitution.',
      '创建 P1 碳晶胞，展开为独立位点，然后进行一次可撤销的替位。'
    ],
    steps: [
      {
        title: ['Start with one carbon site', '从一个碳位点开始'],
        instruction: [
          'Use the tutorial parameters for a 4 Å cubic cell with Hall number 1 and one carbon at fractional (0, 0, 0). Check Open as a new document, then preview and apply the model.',
          '填入教程参数，得到边长 4 Å、Hall 编号 1 的立方晶胞，含一个位于分数坐标 (0, 0, 0) 的碳原子。勾选「作为新文档打开」，再预览并应用构建结果。'
        ],
        tool: ['model', 'crystal'],
        recipe: crystalRecipe
      },
      {
        title: ['Expand to two sites', '展开为两个位点'],
        instruction: [
          'Choose Axis repeats and enter 2, 1, 1 along a, b, c. Confirm that the preview contains two carbon atoms, then apply to the current document.',
          '选择「沿各轴重复」，沿 a、b、c 输入 2、1、1。检查预览包含两个碳原子，再应用到当前文档。'
        ],
        tool: ['model', 'supercell'],
        recipe: [2, 1, 1]
      },
      {
        title: ['Replace one carbon', '替换一个碳原子'],
        instruction: [
          'Choose Substitution with C as the host, N as the replacement, count 1 and seed 1. Check C₁N₁ in the preview, then apply to the current document.',
          '选择「替位」，以 C 为基底元素、N 为替换元素，个数和随机种子均为 1。在预览中核对 C₁N₁，再应用到当前文档。'
        ],
        tool: ['model', 'defects'],
        recipe: {
          kind: 'substitution',
          element: 'N',
          hostElement: 'C',
          amount: { kind: 'count', value: 1 },
          seed: 1
        }
      },
      {
        title: ['Undo the substitution', '撤销替位'],
        instruction: [
          'Check for one C and one N in the source atom table. Click Undo in the workbench header and verify that the table shows two carbon sites again.',
          '在源原子表核对一个 C 和一个 N。点击工作台顶部的「撤销」，确认原子表恢复为两个碳位点。'
        ],
        tool: ['edit']
      }
    ]
  },
  {
    id: 'slab',
    label: ['Surface slab and POSCAR setup', '薄层与送算准备'],
    format: 'CIF → POSCAR',
    description: [
      'Inspect the (100) terminations, cut a slab with vacuum and lock its bottom layer for export.',
      '检查 (100) 终止面，裁切带真空的薄层，并固定底层以备导出。'
    ],
    example: 'orthogonal',
    steps: [
      {
        title: ['Find a termination', '查找终止面'],
        instruction: [
          'Load the orthogonal example and open the termination tool. Enter Miller indices 1, 0, 0 and preview. Choose a gap from the candidate list to prepare the slab form.',
          '加载正交示例并打开终止面工具。输入米勒指数 1、0、0 后预览。在候选中选择一个间隙，将参数带入薄层表单。'
        ],
        tool: ['model', 'terminations']
      },
      {
        title: ['Cut and constrain the slab', '裁切并约束薄层'],
        instruction: [
          'Choose Cell repeats for thickness, enter 2 and set vacuum to 12 Å. Preview and apply. In Selective Dynamics, enter 1 bottom layer and the flags F F F, then click Set flags on bottom layers.',
          '厚度模式选择「晶胞重复数」并输入 2，真空设为 12 Å。预览并应用。在「原子移动约束」中将底层层数设为 1，输入 F F F，再点击「设置底层的标志」。'
        ],
        tool: ['model', 'slab']
      },
      {
        title: ['Check and export POSCAR', '检查并导出 POSCAR'],
        instruction: [
          'Select POSCAR and click Check export. Review the diagnostics and accept any reported losses needed to generate the output. Verify the Selective Dynamics line and F F F flags before downloading.',
          '选择 POSCAR 并点击「检查导出」。查看诊断，按需接受列出的损失以生成输出。下载前核对 Selective Dynamics 行和 F F F 标志。'
        ],
        tool: ['export']
      }
    ]
  },
  {
    id: 'polymer',
    label: ['An end-capped polymer', '带端基的聚合物'],
    format: 'MOL V3000',
    description: [
      'Connect two ethylene units with hydrogen end caps, then check which recipe data MOL can carry.',
      '连接两个乙烯单元并加氢端基，然后检查 MOL 能保存的配方信息。'
    ],
    steps: [
      {
        title: ['Set the chain and end caps', '设置链和端基'],
        instruction: [
          'Use the tutorial parameters for a two-unit ethylene homopolymer. In Advanced settings, check that the head of unit 0 and tail of unit 1 each attach a hydrogen at 1.09 Å.',
          '填入教程参数，使用两个乙烯单元的均聚配方。展开高级选项，核对单元 0 的 head 和单元 1 的 tail 各连接一个氢，键长为 1.09 Å。'
        ],
        tool: ['model', 'polymer'],
        recipe: polymerRecipe
      },
      {
        title: ['Check the composition', '核对组成'],
        instruction: [
          'Preview and verify C₄H₁₀ with 14 atoms. Apply as a new document when the preview is ready.',
          '预览并核对组成 C₄H₁₀，共 14 个原子。预览就绪后作为新文档应用。'
        ],
        tool: ['model', 'polymer']
      },
      {
        title: ['Inspect export loss', '查看导出损失'],
        instruction: [
          'Check MOL V3000 export. The diagnostics list the polymer recipe loss. Accept the loss if you want to download the molecular geometry.',
          '检查 MOL V3000 导出。诊断会列出聚合物配方损失。需要下载分子几何时，接受该损失并下载。'
        ],
        tool: ['export']
      }
    ]
  },
  {
    id: 'results',
    label: ['Explore calculation results', '浏览计算结果'],
    format: 'JSON v1',
    description: [
      'Explore two illustrative ionic steps, a periodic scalar field, bands and density of states.',
      '浏览两个教学离子步、周期标量场、能带和态密度。'
    ],
    example: 'results',
    steps: [
      {
        title: ['Open a structure frame', '打开结构帧'],
        instruction: [
          'Load the teaching result, choose frame first and click Open selected frame. The one-site Si cell opens with its result bound.',
          '加载教学结果，选择 first 帧并点击「打开所选帧」。工作台打开单硅位点晶胞并关联结果。'
        ],
        tool: ['results']
      },
      {
        title: ['Inspect the scalar field', '检查标量场'],
        instruction: [
          'In Layer settings, select Isosurface and the charge-density channel, set the isovalue to 0.75 e/Å³ and click Add layer. Switch to Plane slice on the same channel, enter point 0 0 2 Å and normal 0 0 1, then click Add layer again. The list should contain two layers.',
          '在「图层设置」中选择等值面和 charge-density 通道，等值阈值输入 0.75 e/Å³，再点击「添加图层」。切换至同一通道的平面切片，输入平面点 0 0 2 Å、法向 0 0 1，再点击「添加图层」。列表应显示两项。'
        ],
        tool: ['results']
      },
      {
        title: ['Compare the two steps', '比较两个离子步'],
        instruction: [
          'Use the energy curve or frame slider to move from first (−5 eV) to last (−6 eV). Select first again, then click Return to source to leave frame preview and inspect the bands.',
          '通过能量曲线或帧滑块由 first（−5 eV）切换到 last（−6 eV）。重新选择 first，再点击「返回源结构」退出帧预览并查看能带。'
        ],
        tool: ['results']
      },
      {
        title: ['Locate a reciprocal point', '定位倒易空间点'],
        instruction: [
          'Choose X in the k-point control. Look for its marker in the first Brillouin zone and compare the band energy with the shared DOS energy scale.',
          '在 k 点控件中选择 X。查看第一布里渊区中的标记，并比较能带和态密度共用的能量轴。'
        ],
        tool: ['results']
      }
    ]
  }
]

interface GuideHost {
  readonly signal: AbortSignal
  locale(): Locale
  available(): boolean
  openTool(panel: Panel, kind?: ModelKind, recipe?: unknown): void
  loadExample(sample: ExampleId): void
}

export function installGuides(host: GuideHost): () => void {
  const triggers = {
    examples: document.querySelector<HTMLButtonElement>('#kit-examples')!,
    tutorials: document.querySelector<HTMLButtonElement>('#kit-tutorials')!
  }
  const guide = document.createElement('aside')
  guide.id = 'kit-guide'
  guide.className = 'kit-guide'
  guide.hidden = true
  guide.setAttribute('aria-labelledby', 'kit-guide-title')
  document.querySelector('.workspace')!.append(guide)
  const inspector = document.querySelector<HTMLElement>('#kit-inspector')!
  const local = ([en, zh]: Copy) => (host.locale() === 'zh' ? zh : en)
  const actions = new Map<string, () => void>()
  const scrollPositions = new Map<string, number>()
  let mode: Mode | undefined
  let selected: Workflow | undefined
  const heading = document.createElement('h2')
  heading.id = 'kit-guide-title'
  heading.tabIndex = -1

  function appendText(parent: HTMLElement, tag: 'p' | 'h3' | 'h4' | 'span', copy: Copy) {
    const element = document.createElement(tag)
    element.textContent = local(copy)
    parent.append(element)
    return element
  }

  function button(parent: HTMLElement, id: string, text: string, run: () => void) {
    const control = document.createElement('button')
    control.type = 'button'
    control.textContent = text
    control.dataset.guideAction = id
    actions.set(id, run)
    parent.append(control)
    return control
  }

  function toolButton(parent: HTMLElement, id: string, target: Tool, recipe?: unknown) {
    const [panel, kind] = target
    const name = tr(panel === 'model' ? 'modeling' : panel)
    const control = button(
      parent,
      id,
      recipe === undefined
        ? local([`Open ${name}`, `打开${name}`])
        : local(['Use tutorial parameters', '填入教程参数']),
      () => host.openTool(panel, kind, recipe)
    )
    if (recipe === undefined) control.dataset.guideTool = panel
    else control.disabled = !host.available()
  }

  function starter(parent: HTMLElement, workflow: Workflow) {
    const example = workflow.example
    if (example) {
      const control = button(
        parent,
        `load-${workflow.id}`,
        local(['Load example', '加载示例']),
        () => host.loadExample(example)
      )
      control.dataset.guideExample = example
      control.disabled = !host.available()
    } else {
      const { tool, recipe } = workflow.steps[0]
      if (tool) toolButton(parent, `preset-${workflow.id}`, tool, recipe)
    }
  }

  function page() {
    return mode === 'tutorials' && selected ? `tutorial-${selected.id}` : mode
  }

  function navigate(next: Mode | undefined, workflow: Workflow | undefined) {
    const previous = page()
    if (previous) scrollPositions.set(previous, guide.scrollTop)
    mode = next
    selected = workflow
    const current = page()
    render(true, current ? (scrollPositions.get(current) ?? 0) : 0)
  }

  function close() {
    const trigger = mode && triggers[mode]
    navigate(undefined, selected)
    trigger?.focus()
  }

  function render(focusHeading = false, scrollTop = guide.scrollTop) {
    const focused = (document.activeElement as HTMLElement | null)?.dataset.guideAction
    guide.hidden = !mode
    inspector.inert = Boolean(mode)
    for (const key of ['examples', 'tutorials'] as const)
      triggers[key].setAttribute('aria-expanded', String(key === mode))
    actions.clear()
    guide.replaceChildren()
    if (!mode) return
    const header = document.createElement('div')
    header.className = 'kit-guide-header'
    heading.textContent = tr(mode === 'examples' ? 'kitExamples' : 'kitTutorials')
    header.append(heading)
    button(header, 'close', local(['Close', '关闭']), close)
    guide.append(header)
    if (!host.available())
      appendText(guide, 'p', [
        'You can read every guide here. Loading examples requires WebGL2.',
        '所有教程均可阅读。加载示例需要 WebGL2。'
      ]).className = 'kit-guide-note'

    if (mode === 'tutorials' && selected) {
      const workflow = selected
      const back = button(guide, 'tutorial-list', local(['All tutorials', '全部教程']), () =>
        navigate('tutorials', undefined)
      )
      back.className = 'kit-guide-back'
      appendText(guide, 'h3', workflow.label).dataset.guideWorkflow = workflow.id
      appendText(guide, 'p', workflow.description)
      if (workflow.example) starter(guide, workflow)
      const steps = document.createElement('ol')
      steps.className = 'kit-guide-steps'
      workflow.steps.forEach((step, index) => {
        const item = document.createElement('li')
        appendText(item, 'h4', step.title)
        appendText(item, 'p', step.instruction)
        if (step.tool) {
          const buttons = document.createElement('div')
          buttons.className = 'kit-guide-actions'
          toolButton(buttons, `step-${index}-tool`, step.tool)
          if (step.recipe !== undefined)
            toolButton(buttons, `step-${index}-recipe`, step.tool, step.recipe)
          item.append(buttons)
        }
        steps.append(item)
      })
      guide.append(steps)
    } else {
      appendText(
        guide,
        'p',
        mode === 'examples'
          ? [
              'Project-authored teaching datasets and starting recipes. Bundled for offline use under the MIT license.',
              '项目自产的教学数据和起步配方，以 MIT 许可随工作台离线分发。'
            ]
          : [
              'Follow a workflow at your own pace. Each step opens the corresponding tool.',
              '按自己的进度跟做。每步都可以打开对应的工具。'
            ]
      ).className = 'kit-guide-note'
      for (const workflow of workflows) {
        const card = document.createElement('section')
        card.className = 'kit-guide-card'
        appendText(card, 'span', [workflow.format, workflow.format]).className = 'kit-guide-format'
        const title = appendText(card, 'h3', workflow.label)
        title.id = `kit-workflow-${workflow.id}`
        card.setAttribute('aria-labelledby', title.id)
        appendText(card, 'p', workflow.description)
        const buttons = document.createElement('div')
        buttons.className = 'kit-guide-actions'
        if (mode === 'examples') starter(buttons, workflow)
        button(buttons, `tutorial-${workflow.id}`, local(['Open tutorial', '打开教程']), () =>
          navigate('tutorials', workflow)
        ).dataset.guideTutorial = workflow.id
        card.append(buttons)
        guide.append(card)
      }
    }
    const notices = document.createElement('a')
    notices.href = './generated/notices.txt'
    notices.target = '_blank'
    notices.rel = 'noopener'
    notices.className = 'kit-guide-notices'
    notices.textContent = tr('sources')
    guide.append(notices)

    if (focusHeading) heading.focus({ preventScroll: true })
    else if (focused)
      guide
        .querySelector<HTMLElement>(`[data-guide-action="${focused}"]`)
        ?.focus({ preventScroll: true })
    guide.scrollTop = scrollTop
  }

  for (const key of ['examples', 'tutorials'] as const) {
    const trigger = triggers[key]
    trigger.setAttribute('aria-controls', guide.id)
    trigger.setAttribute('aria-expanded', 'false')
    trigger.addEventListener(
      'click',
      () => {
        if (mode === key) close()
        else navigate(key, selected)
      },
      { signal: host.signal }
    )
  }
  guide.addEventListener(
    'click',
    (event) => {
      const action = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-guide-action]')
      if (action?.dataset.guideAction && !action.disabled)
        actions.get(action.dataset.guideAction)?.()
    },
    { signal: host.signal }
  )
  guide.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
      }
    },
    { signal: host.signal }
  )
  host.signal.addEventListener(
    'abort',
    () => {
      actions.clear()
      scrollPositions.clear()
      inspector.inert = false
      guide.remove()
    },
    { once: true }
  )
  return () => render()
}
