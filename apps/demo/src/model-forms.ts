import { BUILT_IN_FRAGMENTS, ELEMENTS } from 'alchemion/core'
import type { ModelingTask } from 'alchemion/viewer'
import { getLocale } from './i18n'
import {
  advanced,
  asRecord,
  booleanField,
  choiceField,
  list,
  localizeFields,
  mapField,
  numberField,
  objectFields,
  optionalGroup,
  snapshotField,
  textField,
  tuple,
  variants,
  type Field,
  type FormContext,
  type Label
} from './model-form-fields'
import './model-form-fields.css'

type ModelKind = ModelingTask['kind']
const integer = (label: Label, optional = false) => numberField(label, { integer: true, optional })
const number = (label: Label, optional = false) => numberField(label, { optional })
const extras = (fields: Readonly<Record<string, Field>>) =>
  advanced(['Advanced settings', '高级选项'], objectFields(fields))
const group = (label: Label, fields: Readonly<Record<string, Field>>) => objectFields(fields, label)
const vector = (label: Label, labels = ['x', 'y', 'z'], integers = false) =>
  tuple(
    label,
    labels.map((axis) => numberField([axis, axis], { integer: integers }))
  )
const xyz = (label: Label) => vector(label)
const fractional = xyz(['Fractional x, y, z', '分数坐标 x、y、z'])
const hkl = vector(['Miller indices (h k l)', '米勒指数 (h k l)'], ['h', 'k', 'l'], true)
const repeats = vector(['Repeats along a, b, c', '沿 a、b、c 轴重复次数'], ['a', 'b', 'c'], true)
const matrix = (label: Label, integers = false) =>
  tuple(
    label,
    ['a', 'b', 'c'].map((axis) =>
      vector(['Column ' + axis, axis + ' 列向量'], ['x', 'y', 'z'], integers)
    )
  )
const cellMatrix = matrix(['Basis columns (Å)', '基矢列向量（Å）'])
const basis = [
  [4, 0, 0],
  [0, 4, 0],
  [0, 0, 4]
]
const identity = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1]
]
const cellPreset = { a: 4, b: 4, c: 4, alpha: 90, beta: 90, gamma: 90 }
const cellParameters = objectFields({
  a: number(['a (Å)', 'a（Å）']),
  b: number(['b (Å)', 'b（Å）']),
  c: number(['c (Å)', 'c（Å）']),
  alpha: number(['α (°)', 'α（°）']),
  beta: number(['β (°)', 'β（°）']),
  gamma: number(['γ (°)', 'γ（°）'])
})
const cell = variants(['Cell input', '晶胞输入'], {
  parameters: {
    label: ['Lengths and angles', '长度和角度'],
    matches: (value) => asRecord(value).a !== undefined,
    field: cellParameters,
    preset: cellPreset
  },
  basis: {
    label: ['Basis vectors', '基矢'],
    matches: (value) => asRecord(value).basis !== undefined,
    field: objectFields({ basis: cellMatrix }),
    preset: { basis }
  }
})
const symbols = ELEMENTS.map(({ symbol }) => [symbol, [symbol, symbol]] as const)
const element = (label: Label, optional = false) => choiceField(label, symbols, optional)
const elementField = element(['Element', '元素'])
const atomId = (label: Label, required = false) => textField(label, required)
const sourceAtomId = atomId(['Source atom ID', '源原子 ID'], true)
const axis = xyz(['Axis x, y, z', '旋转轴 x、y、z'])
const angle = (label: Label, optional = false) => number(label, optional)
const vacuum = number(['Vacuum (Å)', '真空厚度（Å）'])
const clearance = number(['Minimum distance (Å)', '最小距离（Å）'], true)
const seed = integer(['Seed (unsigned 32-bit)', '随机种子（32 位无符号）'])
const placement = (requiredDistance = false) => ({
  distance: number(['Bond length (Å)', '键长（Å）'], !requiredDistance),
  torsionDegrees: angle(['Torsion (°)', '扭转角（°）'], true),
  order: choiceField(
    ['Bond order', '键阶'],
    [
      ['single', ['Single', '单键']],
      ['double', ['Double', '双键']],
      ['triple', ['Triple', '三键']],
      ['aromatic', ['Aromatic', '芳香键']]
    ],
    true
  )
})
const tagged =
  (kind: string, fields: Readonly<Record<string, Field>>): Field =>
  (context, id, initial) => {
    const control = objectFields(fields)(context, id, initial)
    return { node: control.node, read: () => ({ kind, ...asRecord(control.read()) }) }
  }
const hasKind = (kind: string) => (value: unknown) => asRecord(value).kind === kind
const property = (key: string) => (value: unknown) => asRecord(value)[key] !== undefined
const distanceMode = variants(['Thickness mode', '厚度模式'], {
  repeats: {
    label: ['Cell repeats', '晶胞重复数'],
    matches: property('repeats'),
    field: objectFields({ repeats: integer(['Repeats', '重复次数']) }),
    preset: { repeats: 2 }
  },
  angstrom: {
    label: ['Thickness in Å', '厚度（Å）'],
    matches: property('angstrom'),
    field: objectFields({ angstrom: number(['Thickness (Å)', '厚度（Å）']) }),
    preset: { angstrom: 8 }
  }
})
const numericProperty = (label: Label) =>
  optionalGroup(
    label,
    variants(['Value type', '数值类型'], {
      known: {
        label: ['Numeric value', '数值'],
        matches: hasKind('known'),
        field: tagged('known', {
          value: number(['Value', '数值']),
          standardUncertainty: number(['Standard uncertainty', '标准不确定度'], true)
        }),
        preset: { kind: 'known', value: 1 }
      },
      unknown: {
        label: ['Unknown', '未知'],
        matches: hasKind('unknown'),
        field: tagged('unknown', {}),
        preset: { kind: 'unknown' }
      },
      'not-applicable': {
        label: ['Not applicable', '不适用'],
        matches: hasKind('not-applicable'),
        field: tagged('not-applicable', {}),
        preset: { kind: 'not-applicable' }
      }
    }),
    { kind: 'known', value: 1 }
  )
const crystalSite = combine(
  objectFields({
    id: sourceAtomId,
    element: elementField,
    fractional,
    label: textField(['Site label', '位点标签'])
  }),
  extras({
    occupancy: numericProperty(['Set occupancy', '设置占位率']),
    isotope: integer(['Isotope mass number', '同位素质量数'], true),
    formalCharge: integer(['Formal charge', '形式电荷'], true),
    oxidationState: numericProperty(['Set oxidation state', '设置氧化态']),
    displacementU: numericProperty(['Set displacement U (Å²)', '设置位移 U（Å²）']),
    movable: optionalGroup(
      ['Set Direct mobility', '设置 Direct 三轴移动标志'],
      tuple(
        ['Movable along each Direct axis', '是否允许沿各 Direct 轴移动'],
        ['a', 'b', 'c'].map((axis) => booleanField([axis, axis]))
      ),
      [true, true, true]
    )
  })
)
const operation = group(['Symmetry operation', '对称操作'], {
  id: textField(['Operation ID', '操作 ID'], true),
  rotation: matrix(['Rotation columns', '旋转矩阵列向量'], true),
  translation: tuple(
    ['Fractional translation', '分数平移'],
    ['x', 'y', 'z'].map((axis) =>
      group([axis, axis], {
        numerator: integer(['Numerator', '分子']),
        denominator: integer(['Denominator', '分母'])
      })
    )
  )
})
const identifier = optionalGroup(
  ['Specify space group', '指定空间群'],
  group(['Space group', '空间群'], {
    hallNumber: integer(['Hall number', 'Hall 编号'], true),
    itNumber: integer(['International Tables number', '国际晶体学表编号'], true),
    hallSymbol: textField(['Hall symbol', 'Hall 符号']),
    hermannMauguin: textField(['Hermann–Mauguin symbol', 'Hermann–Mauguin 符号']),
    choice: textField(['Setting choice', '设置选项'])
  }),
  { hallNumber: 1 }
)
const molecularFile = snapshotField(['Local MOL structure', '本地 MOL 结构'], 'molecular')
const portDirection = {
  atomId: atomId(['Anchor atom ID (blank uses selection)', '锚原子 ID（留空时使用选区）']),
  direction: xyz(['Direction x, y, z', '方向 x、y、z']),
  up: optionalGroup(
    ['Specify up direction', '指定上方向'],
    xyz(['Up x, y, z', '上方向 x、y、z']),
    [0, 0, 1]
  ),
  leavingAtomId: atomId(['Leaving atom ID', '离去原子 ID'])
}
const customFragment = objectFields({
  snapshot: molecularFile,
  ports: list(
    ['Connection points', '连接点'],
    group(['Port', '连接点'], {
      ...portDirection,
      atomId: atomId(['Anchor atom ID', '锚原子 ID'], true),
      name: textField(['Port name', '连接点名称'], true)
    }),
    { name: 'attach', direction: [1, 0, 0] }
  )
})
const fragmentNames = Object.keys(BUILT_IN_FRAGMENTS).map((name) => [name, [name, name]] as const)
const fragment = (fallback: string) =>
  variants(['Fragment source', '片段来源'], {
    builtin: {
      label: ['Built-in fragment', '内置片段'],
      matches: (value) => typeof value === 'string',
      field: choiceField(['Fragment', '片段'], fragmentNames),
      preset: fallback
    },
    custom: {
      label: ['Local structure and connection points', '本地结构和连接点'],
      matches: (value) => property('snapshot')(value),
      field: customFragment,
      preset: { ports: [{ name: 'attach', direction: [1, 0, 0] }] }
    }
  })
const unit = textField(
  ['Unit name (built-in or custom)', '单元名称（内置或自定义）'],
  true,
  fragmentNames.map(([name]) => name)
)
const unitCount = objectFields({ unit, count: integer(['Count', '数量']) })
const unitPreset = { unit: 'ethylene', count: 2 }
const polymerRecipe = variants(['Polymer recipe', '聚合物配方'], {
  homopolymer: {
    label: ['Homopolymer', '均聚物'],
    matches: hasKind('homopolymer'),
    field: tagged('homopolymer', { unit, count: integer(['Count', '数量']) }),
    preset: unitPreset
  },
  sequence: {
    label: ['Explicit sequence', '指定序列'],
    matches: hasKind('sequence'),
    field: tagged('sequence', { sequence: list(['Unit sequence', '单元序列'], unit, 'ethylene') }),
    preset: { sequence: ['ethylene', 'ethylene'] }
  },
  blocks: {
    label: ['Blocks', '嵌段'],
    matches: hasKind('blocks'),
    field: tagged('blocks', {
      blocks: list(['Blocks in order', '按顺序排列的嵌段'], unitCount, unitPreset)
    }),
    preset: { blocks: [unitPreset] }
  },
  random: {
    label: ['Seeded random quotas', '带种子的随机配额'],
    matches: hasKind('random'),
    field: tagged('random', {
      counts: list(['Unit quotas', '单元配额'], unitCount, unitPreset),
      seed
    }),
    preset: { counts: [unitPreset], seed: 1 }
  }
})
const counts = (label: Label, integrals: boolean) =>
  list(label, numberField(['Quota', '配额'], { integer: integrals }), 1)
const packingQuotas = variants(['Molecular quotas', '分子配额'], {
  counts: {
    label: ['Counts in file order', '按文件顺序填写数量'],
    matches: property('counts'),
    field: objectFields({ counts: counts(['Component counts', '组分数量'], true) }),
    preset: { counts: [1] }
  },
  ratios: {
    label: ['Ratios in file order', '按文件顺序填写比例'],
    matches: property('ratios'),
    field: objectFields({
      ratios: counts(['Component ratios', '组分比例'], false),
      totalMolecules: integer(['Total molecules', '分子总数'])
    }),
    preset: { ratios: [1], totalMolecules: 4 }
  },
  default: {
    label: ['One of each component', '每种组分一个'],
    matches: (value) => !property('counts')(value) && !property('ratios')(value),
    field: objectFields({}),
    preset: {}
  }
})

function combine(...fields: readonly Field[]): Field {
  return (context, id, initial) => {
    const node = document.createElement('div')
    const controls = fields.map((field) => field(context, id, initial))
    node.append(...controls.map(({ node: child }) => child))
    return {
      node,
      read: () => Object.assign({}, ...controls.map((control) => asRecord(control.read())))
    }
  }
}

const forms = {
  crystal: objectFields({
    title: textField(['Structure title', '结构标题']),
    cell,
    atoms: list(['Asymmetric-unit sites', '不对称单元位点'], crystalSite, {
      element: 'C',
      fractional: [0, 0, 0]
    }),
    symmetry: optionalGroup(
      ['Set symmetry', '设置对称性'],
      objectFields({
        spaceGroup: identifier,
        operations: optionalGroup(
          ['Specify symmetry operations', '指定对称操作'],
          list(['Symmetry operations', '对称操作'], operation, {
            rotation: identity,
            translation: Array.from({ length: 3 }, () => ({ numerator: 0, denominator: 1 }))
          }),
          [
            {
              id: 'identity',
              rotation: identity,
              translation: Array.from({ length: 3 }, () => ({ numerator: 0, denominator: 1 }))
            }
          ]
        )
      }),
      { spaceGroup: { hallNumber: 1 } }
    )
  }),
  symmetry: combine(
    objectFields({
      output: choiceField(
        ['Output', '输出'],
        [
          ['recognition', ['Identify space group', '识别空间群']],
          ['standard', ['Standard cell', '标准胞']],
          ['primitive', ['Primitive cell', '原胞']]
        ],
        true
      )
    }),
    extras({
      distance: number(['Distance tolerance (Å)', '距离容差（Å）'], true),
      angle: angle(['Angle tolerance (°; −1 auto)', '角度容差（°，−1 为自动）'], true),
      hallNumber: integer(['Hall number (0 auto)', 'Hall 编号（0 为自动）'], true)
    })
  ),
  supercell: variants(['Supercell input', '超胞输入'], {
    repeats: {
      label: ['Axis repeats', '沿各轴重复'],
      matches: (value) => Array.isArray(value) && !Array.isArray(value[0]),
      field: repeats,
      preset: [2, 1, 1]
    },
    matrix: {
      label: ['Integer matrix', '整数矩阵'],
      matches: (value) => Array.isArray(value) && Array.isArray(value[0]),
      field: matrix(['Integer transformation columns', '整数变换矩阵列向量'], true),
      preset: [
        [2, 0, 0],
        [1, 1, 0],
        [0, 0, 1]
      ]
    }
  }),
  terminations: hkl,
  slab: objectFields({
    hkl,
    termination: integer(['Termination index', '终止面索引'], true),
    thickness: distanceMode,
    vacuum
  }),
  interface: objectFields({
    search: group(['Match search', '匹配搜索'], {
      rotation: angle(['Rotation (°)', '旋转角（°）'], true),
      maxStrain: number(['Maximum strain (fraction)', '最大应变（分数）'], true),
      maxAreaMultiple: integer(['Maximum area multiple', '最大面积倍数'], true),
      maxAngleMismatch: angle(['Maximum angle mismatch (°)', '最大角度偏差（°）'], true),
      maxMatches: integer(['Maximum matches', '最多匹配数'], true)
    }),
    candidate: numberField(['Candidate index (blank searches)', '候选索引（留空搜索）'], {
      integer: true,
      optional: true,
      nullable: true
    }),
    options: group(['Interface geometry', '界面几何'], {
      gap: number(['Gap (Å)', '间距（Å）']),
      vacuum,
      translation: optionalGroup(
        ['Set in-plane translation', '设置面内位移'],
        vector(['In-plane translation (fractional)', '面内位移（分数坐标）'], ['a', 'b']),
        [0, 0]
      ),
      minimumDistance: clearance
    })
  }),
  adsorbate: combine(
    objectFields({
      anchorAtomId: atomId([
        'Adsorbate anchor ID (blank uses first atom)',
        '吸附物锚原子 ID（留空使用首个原子）'
      ]),
      target: xyz(['Cartesian target (Å)', '笛卡尔目标位置（Å）']),
      height: number(['Height along surface normal (Å)', '沿表面法向高度（Å）'])
    }),
    extras({
      rotation: optionalGroup(
        ['Rotate molecule', '旋转分子'],
        group(['Rotation', '旋转'], {
          axis,
          angle: angle(['Angle (°)', '角度（°）'])
        }),
        { axis: [0, 0, 1], angle: 0 }
      ),
      minimumDistance: clearance
    })
  ),
  interstitials: objectFields({
    grid: integer(['Grid samples per axis', '每轴网格采样数'], true),
    minimumDistance: clearance,
    limit: integer(['Candidate limit', '候选数上限'], true)
  }),
  defects: variants(['Defect type', '缺陷类型'], {
    substitution: {
      label: ['Substitution', '替位'],
      matches: hasKind('substitution'),
      field: tagged('substitution', {
        element: elementField,
        hostElement: element(['Filter by host element', '按基底元素筛选'], true),
        atomIds: optionalGroup(
          ['Filter by explicit source IDs', '按指定源 ID 筛选'],
          list(['Source IDs', '源原子 ID'], sourceAtomId, ''),
          []
        ),
        useSelection: booleanField(['Use current source selection', '使用当前源原子选区'], true),
        amount: variants(['Amount mode', '数量模式'], {
          count: {
            label: ['Count', '个数'],
            matches: hasKind('count'),
            field: tagged('count', { value: integer(['Count', '个数']) }),
            preset: { value: 1 }
          },
          fraction: {
            label: ['Fraction', '比例'],
            matches: hasKind('fraction'),
            field: tagged('fraction', { value: number(['Fraction', '比例']) }),
            preset: { value: 0.5 }
          }
        }),
        seed
      }),
      preset: { element: 'N', hostElement: 'C', amount: { kind: 'count', value: 1 }, seed: 1 }
    },
    interstitial: {
      label: ['Interstitial insertion', '间隙插入'],
      matches: hasKind('interstitial'),
      field: tagged('interstitial', { element: elementField, fractional }),
      preset: { element: 'H', fractional: [0.5, 0.5, 0.5] }
    },
    disorder: {
      label: ['Realize occupancies', '占位实体化'],
      matches: hasKind('disorder'),
      field: tagged('disorder', { seed }),
      preset: { seed: 1 }
    }
  }),
  fragment: objectFields({
    fragment: fragment('methyl'),
    target: group(['Target connection point', '目标连接点'], portDirection),
    port: textField(['Fragment port', '片段连接点'], true),
    ...placement(true)
  }),
  hydrogens: objectFields({
    scope: choiceField(
      ['Hydrogen placement scope', '补氢范围'],
      [
        ['all', ['All atoms', '全部原子']],
        ['selection', ['Current source selection', '当前源原子选区']],
        ['ids', ['Explicit source IDs', '指定源原子 ID']]
      ],
      true
    ),
    atomIds: optionalGroup(
      ['List source IDs', '列出源原子 ID'],
      list(['Source IDs', '源原子 ID'], sourceAtomId, ''),
      []
    )
  }),
  polymer: combine(
    objectFields({ recipe: polymerRecipe }),
    extras({
      units: optionalGroup(
        ['Define custom units', '定义自定义单元'],
        mapField(['Custom units', '自定义单元'], customFragment, { ports: [] }),
        {}
      ),
      ...placement(),
      branches: optionalGroup(
        ['Add branches', '添加支链'],
        list(
          ['Branches', '支链'],
          group(['Branch', '支链'], {
            unit,
            parent: integer(['Parent index (zero based)', '父单元索引（从零开始）']),
            parentPort: textField(['Parent port', '父单元连接点'], true),
            port: textField(['Branch port', '支链连接点'])
          }),
          { unit: 'ethylene', parent: 0, parentPort: 'tail' }
        ),
        []
      ),
      ends: optionalGroup(
        ['Add end caps', '添加端基'],
        list(
          ['End caps', '端基'],
          group(['End cap', '端基'], {
            unit: integer(['Unit index (zero based)', '单元索引（从零开始）']),
            port: textField(['Unit port', '单元连接点'], true),
            fragment: fragment('hydrogen'),
            fragmentPort: textField(['End-cap port', '端基连接点']),
            ...placement()
          }),
          { unit: 0, port: 'head', fragment: 'hydrogen', distance: 1.09 }
        ),
        []
      )
    })
  ),
  packing: combine(
    packingQuotas,
    objectFields({
      useSubstrate: booleanField(
        ['Use current crystal as substrate', '使用当前晶体作为基底'],
        true
      ),
      density: number(['Target density (g/cm³)', '目标密度（g/cm³）'], true),
      minimumDistance: number(['Minimum distance (Å)', '最小距离（Å）']),
      seed
    }),
    extras({
      substrate: optionalGroup(
        ['Load a separate substrate', '载入独立基底'],
        snapshotField(['Local periodic structure', '本地周期结构'], 'periodic'),
        undefined
      ),
      cell: optionalGroup(
        ['Specify fixed cell', '指定固定晶胞'],
        objectFields({ basis: cellMatrix }),
        { basis }
      ),
      shape: optionalGroup(
        ['Specify shape scaled to density', '指定按密度缩放的胞形'],
        objectFields({ basis: cellMatrix }),
        { basis }
      ),
      region: optionalGroup(
        ['Restrict fractional region', '限制分数坐标区域'],
        objectFields({
          minimum: xyz(['Fractional lower bounds', '分数坐标下界']),
          maximum: xyz(['Fractional upper bounds', '分数坐标上界'])
        }),
        { minimum: [0, 0, 0], maximum: [1, 1, 1] }
      ),
      maxAttempts: integer(['Maximum attempts per molecule', '每个分子的尝试上限'], true)
    })
  ),
  nanotube: combine(
    objectFields({
      walls: list(
        ['Walls, innermost first', '管壁，从内向外'],
        objectFields({
          n: integer(['Chirality n', '手性指数 n']),
          m: integer(['Chirality m', '手性指数 m'])
        }),
        { n: 5, m: 5 }
      ),
      boundary: variants(['Boundary', '边界'], {
        periodic: {
          label: ['Periodic', '周期'],
          matches: hasKind('periodic'),
          field: tagged('periodic', { repeats: integer(['Axial repeats', '轴向重复数']), vacuum }),
          preset: { repeats: 2, vacuum: 12 }
        },
        finite: {
          label: ['Finite', '有限'],
          matches: hasKind('finite'),
          field: tagged('finite', { length: number(['Length (Å)', '长度（Å）']) }),
          preset: { length: 10 }
        }
      })
    }),
    extras({
      latticeConstant: number(['Lattice constant (Å)', '晶格常数（Å）'], true),
      wallSpacing: optionalGroup(
        ['Set wall spacing', '设置壁间距'],
        objectFields({
          target: number(['Target spacing (Å)', '目标间距（Å）']),
          tolerance: number(['Spacing tolerance (Å)', '间距容差（Å）'])
        }),
        { target: 3.4, tolerance: 0.5 }
      )
    })
  ),
  cluster: objectFields({
    center: xyz(['Cartesian center (Å)', '笛卡尔中心（Å）']),
    shape: variants(['Crop shape', '裁切形状'], {
      sphere: {
        label: ['Sphere', '球形'],
        matches: hasKind('sphere'),
        field: tagged('sphere', { radius: number(['Radius (Å)', '半径（Å）']) }),
        preset: { radius: 6 }
      },
      box: {
        label: ['Box', '盒形'],
        matches: hasKind('box'),
        field: tagged('box', { halfLengths: xyz(['Half lengths (Å)', '各轴半长（Å）']) }),
        preset: { halfLengths: [6, 6, 6] }
      }
    })
  })
} satisfies Record<ModelKind, Field>

function sameRecipe(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (Array.isArray(left))
    return (
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => sameRecipe(value, right[index]))
    )
  if (
    !left ||
    typeof left !== 'object' ||
    !right ||
    typeof right !== 'object' ||
    Array.isArray(right)
  )
    return false
  const actual = asRecord(left)
  const expected = asRecord(right)
  const keys = Object.keys(actual)
  return (
    keys.length === Object.keys(expected).length &&
    keys.every((key) => Object.hasOwn(expected, key) && sameRecipe(actual[key], expected[key]))
  )
}

export function installModelForms(
  container: HTMLElement,
  options: {
    signal: AbortSignal
    onInput(): void
  }
) {
  const context = { signal: options.signal, changed: options.onInput } satisfies FormContext
  let kind: ModelKind = 'crystal'
  const build = (recipe: unknown) => forms[kind](context, 'model-form-' + kind, recipe)
  let current: ReturnType<Field> | undefined
  function mount(control: ReturnType<Field>) {
    current = control
    container.replaceChildren(control.node)
  }
  container.addEventListener('input', options.onInput, { signal: options.signal })
  return {
    reset(next: ModelKind, recipe: unknown) {
      kind = next
      mount(build(recipe))
    },
    read() {
      return current?.read()
    },
    apply(recipe: unknown) {
      const control = build(recipe)
      if (!sameRecipe(control.read(), recipe))
        throw new Error(
          getLocale() === 'zh'
            ? '此配方包含表单无法表达的字段。可在高级入口直接使用原配方。'
            : 'This recipe contains fields the form cannot represent. Use the original recipe in the advanced editor.'
        )
      mount(control)
    },
    localize() {
      localizeFields(container)
    }
  }
}
