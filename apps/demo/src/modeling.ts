import { BUILT_IN_FRAGMENTS, constructionSnapshot, slabBottomAtomIds } from 'alchemion/core'
import type {
  BondOrder,
  EditCommand,
  Matrix3,
  MolecularFragment,
  MolecularStructureSnapshot,
  StructureSnapshot,
  Vec3
} from 'alchemion/core'
import { parseStructure } from 'alchemion/formats'
import { ComputationError, createModelingRuntime, createViewer } from 'alchemion/viewer'
import type { InteractionMode, ModelingPreview, ModelingTask, Viewer } from 'alchemion/viewer'
import { tr } from './i18n'

const exampleCell = { a: 4, b: 4, c: 4, alpha: 90, beta: 90, gamma: 90 }
const templates = {
  crystal: {
    cell: exampleCell,
    symmetry: { spaceGroup: { hallNumber: 1 } },
    atoms: [{ id: 'C1', element: 'C', fractional: [0, 0, 0] }]
  },
  symmetry: { output: 'recognition', distance: 0.001, angle: -1, hallNumber: 0 },
  supercell: [
    [2, 0, 0],
    [1, 1, 0],
    [0, 0, 1]
  ],
  terminations: [1, 0, 0],
  slab: { hkl: [1, 0, 0], termination: 0, thickness: { repeats: 2 }, vacuum: 12 },
  interface: {
    search: { rotation: 0, maxStrain: 0.05, maxAreaMultiple: 4 },
    candidate: null,
    options: { gap: 3, vacuum: 12 }
  },
  adsorbate: {
    anchorAtomId: '',
    target: [0, 0, 0],
    height: 3,
    rotation: { axis: [0, 0, 1], angle: 0 }
  },
  interstitials: { grid: 8, minimumDistance: 1, limit: 12 },
  defects: {
    kind: 'substitution',
    element: 'N',
    hostElement: 'C',
    amount: { kind: 'count', value: 1 },
    seed: 1
  },
  fragment: {
    fragment: 'methyl',
    target: { atomId: '', direction: [1, 0, 0] },
    port: 'attach',
    distance: 1.54,
    torsionDegrees: 0
  },
  hydrogens: {},
  polymer: { recipe: { kind: 'homopolymer', unit: 'ethylene', count: 3 } },
  packing: { counts: [4], density: 0.2, minimumDistance: 1.4, seed: 1 },
  nanotube: { walls: [{ n: 5, m: 5 }], boundary: { kind: 'periodic', repeats: 2, vacuum: 12 } },
  cluster: { center: [0, 0, 0], shape: { kind: 'sphere', radius: 6 } }
} satisfies Record<ModelingTask['kind'], unknown>
type ModelKind = keyof typeof templates
type Task<K extends ModelKind> = Extract<ModelingTask, { kind: K }>
const labels = {
  crystal: 'modelCrystal',
  symmetry: 'modelSymmetry',
  supercell: 'modelMatrix',
  terminations: 'modelTerminations',
  slab: 'modelSlab',
  interface: 'modelInterface',
  adsorbate: 'modelAdsorbate',
  interstitials: 'modelInterstitials',
  defects: 'modelDefects',
  fragment: 'modelFragment',
  hydrogens: 'modelHydrogens',
  polymer: 'modelPolymer',
  packing: 'modelPacking',
  nanotube: 'modelNanotube',
  cluster: 'modelCluster'
} as const
const modelElement = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T
const value = (id: string) =>
  modelElement<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(id).value
const setValue = (id: string, text: string) => {
  modelElement<HTMLInputElement | HTMLTextAreaElement>(id).value = text
}
const button = (id: string, label: Parameters<typeof tr>[0]) =>
  `<button id="${id}" type="button" data-i18n="${label}"></button>`

export function appendModelingTools(): void {
  document
    .querySelector('.tools nav')!
    .insertAdjacentHTML(
      'beforeend',
      '<button id="tab-model" type="button" data-panel="model" aria-pressed="false" data-i18n="modeling"></button>'
    )
  document.querySelector('.tools')!.insertAdjacentHTML(
    'beforeend',
    `<section id="panel-model" class="tool-panel" hidden>
    <h1 data-i18n="modeling"></h1><p class="hint" data-i18n="modelHelp"></p>
    <label for="model-kind" data-i18n="modeling"></label><select id="model-kind">${Object.entries(
      labels
    )
      .map(([kind, label]) => `<option value="${kind}" data-i18n="${label}"></option>`)
      .join('')}</select>
    <label for="model-options" data-i18n="modelOptions"></label><textarea id="model-options" rows="8" spellcheck="false"></textarea>
    <div id="model-file-field" hidden><label for="model-files" data-i18n="modelOther"></label><input id="model-files" type="file" accept=".mol,.cif,.poscar,.vasp,text/plain" multiple></div>
    <label class="check"><input id="model-new-document" type="checkbox"><span data-i18n="modelNewDocument"></span></label>
    <div class="button-row">${button('model-preview', 'preview')}${button('model-cancel', 'cancel')}</div>
    <output id="model-status" aria-live="polite"></output>
    <hr><h2 data-i18n="modelMobility"></h2>
    <label for="model-movable" data-i18n="modelMovableFlags"></label><input id="model-movable" value="F F F">
    <label for="model-bottom" data-i18n="modelBottomLayers"></label><input id="model-bottom" type="number" value="1" min="1" step="1">
    <div class="button-row">${button('model-fix-selection', 'modelFixSelection')}${button('model-fix-bottom', 'modelFixBottom')}</div>
    <hr><h2 data-i18n="modelSketch"></h2><div class="button-row">${button('model-empty-molecule', 'modelEmptyMolecule')}${button('model-pick', 'point')}</div>
    <label for="model-bond-atoms" data-i18n="modelBondAtoms"></label><input id="model-bond-atoms">
    <label for="model-bond-order" data-i18n="modelBondOrder"></label><select id="model-bond-order">${(['single', 'double', 'triple', 'aromatic'] as const).map((order) => `<option value="${order}" data-i18n="modelOrder${order}"></option>`).join('')}</select>
    <div class="button-row">${button('model-add-bond', 'modelAddBond')}${button('model-set-bond', 'modelSetBond')}${button('model-remove-bond', 'modelRemoveBond')}</div>
    </section>`
  )
  document.querySelector('#app')!.insertAdjacentHTML(
    'beforeend',
    `<dialog id="model-dialog" class="model-dialog" aria-labelledby="model-preview-title">
    <h2 id="model-preview-title" data-i18n="preview"></h2><div id="model-canvas" class="model-canvas" hidden></div><pre id="model-result"></pre>
    <label id="model-loss-field" class="check" hidden><input id="model-accept-loss" type="checkbox"><span data-i18n="acceptLoss"></span></label>
    <div class="button-row">${button('model-apply', 'modelApply')}${button('model-close', 'modelClose')}</div></dialog>`
  )
}

interface ModelingHost {
  readonly signal: AbortSignal
  viewer(): Viewer
  on(id: string, event: string, listener: (event: Event) => void): void
  action(id: string, callback: () => unknown | Promise<unknown>): void
  usePickedPoint(point: Vec3): void
}

function expectKind<T extends StructureSnapshot['kind']>(
  snapshot: StructureSnapshot | undefined,
  kind: T
): Extract<StructureSnapshot, { kind: T }> {
  if (snapshot?.kind !== kind)
    throw new Error(tr(kind === 'periodic' ? 'modelPeriodicRequired' : 'modelMolecularRequired'))
  return snapshot as Extract<StructureSnapshot, { kind: T }>
}

async function readModel(file: File): Promise<StructureSnapshot> {
  const name = file.name.toLowerCase()
  const format = name.endsWith('.cif') ? 'cif' : name.endsWith('.mol') ? 'mol' : 'poscar'
  const parsed = parseStructure(await file.text(), { format })
  if (!parsed.structure)
    throw new ComputationError('MODELING_INPUT_FORMAT', tr('fileReadFailed'), parsed.diagnostics)
  return parsed.structure
}

function modelingTask(
  kind: ModelKind,
  view: Viewer,
  input: unknown,
  files: readonly StructureSnapshot[]
): ModelingTask {
  const options = <T>() => input as T
  const source = view.getSnapshot()
  const periodic = () => expectKind(source, 'periodic')
  const molecule = () => expectKind(source, 'molecular')
  const other = () =>
    files[0] ??
    (() => {
      throw new Error(tr('modelOther'))
    })()
  const selection = view.getState().selectedSourceAtomIds
  switch (kind) {
    case 'crystal':
      return { kind, options: options<Task<'crystal'>['options']>() }
    case 'symmetry':
      return { kind, source: periodic(), options: options<Task<'symmetry'>['options']>() }
    case 'supercell':
      return { kind, source: periodic(), matrix: options<Matrix3 | Vec3>() }
    case 'terminations':
      return { kind, source: periodic(), hkl: options<Vec3>() }
    case 'slab':
      return { kind, source: periodic(), options: options<Task<'slab'>['options']>() }
    case 'interface': {
      const settings = options<
        Pick<Task<'interface'>, 'search' | 'options'> & { candidate?: number | null }
      >()
      return {
        kind,
        source: periodic(),
        other: expectKind(other(), 'periodic'),
        search: settings.search,
        options: settings.options,
        candidate: settings.candidate ?? undefined
      }
    }
    case 'adsorbate': {
      const adsorbate = expectKind(other(), 'molecular')
      const settings = options<Task<'adsorbate'>['options']>()
      return {
        kind,
        source: periodic(),
        other: adsorbate,
        options: { ...settings, anchorAtomId: settings.anchorAtomId || adsorbate.atoms[0]?.id }
      }
    }
    case 'interstitials':
      return { kind, source: periodic(), options: options<Task<'interstitials'>['options']>() }
    case 'defects': {
      const settings = options<Task<'defects'>['options'] & { useSelection?: boolean }>()
      return {
        kind,
        source: periodic(),
        options:
          settings.kind === 'substitution' &&
          (settings.useSelection ||
            (!settings.hostElement && !settings.atomIds && selection.length))
            ? { ...settings, atomIds: selection }
            : settings
      }
    }
    case 'fragment': {
      const { fragment, ...settings } = options<
        Task<'fragment'>['options'] & {
          fragment: keyof typeof BUILT_IN_FRAGMENTS | MolecularFragment
        }
      >()
      const unit = typeof fragment === 'string' ? BUILT_IN_FRAGMENTS[fragment] : fragment
      return {
        kind,
        source: molecule(),
        fragment: unit,
        options: {
          ...settings,
          target: { ...settings.target, atomId: settings.target.atomId || selection[0] || '' }
        }
      }
    }
    case 'hydrogens':
      return { kind, source: molecule(), atomIds: selection.length ? selection : undefined }
    case 'polymer': {
      type PolymerOptions = Task<'polymer'>['options']
      type End = NonNullable<PolymerOptions['ends']>[number]
      const { ends, ...settings } = options<
        Omit<PolymerOptions, 'ends'> & {
          ends?: readonly (Omit<End, 'fragment'> & {
            fragment: End['fragment'] | keyof typeof BUILT_IN_FRAGMENTS
          })[]
        }
      >()
      return {
        kind,
        options: {
          ...settings,
          units: { ...BUILT_IN_FRAGMENTS, ...settings.units },
          ends: ends?.map(({ fragment, ...end }) => ({
            ...end,
            fragment: typeof fragment === 'string' ? BUILT_IN_FRAGMENTS[fragment] : fragment
          }))
        }
      }
    }
    case 'packing': {
      const { counts, ratios, useSubstrate, ...settings } = options<
        Task<'packing'>['options'] & {
          counts?: number[]
          ratios?: number[]
          useSubstrate?: boolean
        }
      >()
      const structures: readonly MolecularStructureSnapshot[] = files.length
        ? files.map((file) => expectKind(file, 'molecular'))
        : [molecule()]
      if (
        (counts && ratios) ||
        (counts && (!Array.isArray(counts) || counts.length !== structures.length)) ||
        (ratios && (!Array.isArray(ratios) || ratios.length !== structures.length))
      )
        throw new Error(tr('modelPackingQuota'))
      return {
        kind,
        options: {
          ...settings,
          substrate: useSubstrate ? periodic() : settings.substrate,
          components: structures.map((model, i) =>
            ratios
              ? { molecule: model, ratio: ratios[i] }
              : { molecule: model, count: counts?.[i] ?? 1 }
          )
        }
      }
    }
    case 'nanotube':
      return { kind, options: options<Task<'nanotube'>['options']>() }
    case 'cluster':
      return { kind, source: periodic(), options: options<Task<'cluster'>['options']>() }
  }
}

function readOnly(task: ModelingTask): boolean {
  return (
    task.kind === 'terminations' ||
    task.kind === 'interstitials' ||
    (task.kind === 'symmetry' &&
      (!task.options?.output || task.options.output === 'recognition')) ||
    (task.kind === 'interface' && task.candidate === undefined)
  )
}

export function installModeling(host: ModelingHost): void {
  const runtime = createModelingRuntime()
  const dialog = modelElement<HTMLDialogElement>('model-dialog')
  const surface = modelElement('model-canvas')
  let generation = 0
  let previewView: Viewer | undefined
  let unsubscribe: (() => void) | undefined
  let current: ModelingPreview | undefined
  let previousContext = ''
  let pickMode: InteractionMode | undefined
  let previewReady = false
  let manualNewDocument = false
  let bondSequence = 0
  const newDocument = () => modelElement<HTMLInputElement>('model-new-document').checked
  const apply = modelElement<HTMLButtonElement>('model-apply')
  const loss = modelElement<HTMLInputElement>('model-accept-loss')
  function reset() {
    generation++
    runtime.invalidate()
    previewView?.dispose()
    previewView = undefined
    current = undefined
    previewReady = false
    if (dialog.open) dialog.close()
    modelElement('model-status').textContent = ''
  }
  const choose = () => {
    reset()
    manualNewDocument = false
    const kind = value('model-kind') as ModelKind
    setValue('model-options', JSON.stringify(templates[kind], null, 2))
    modelElement('model-file-field').hidden = !['interface', 'adsorbate', 'packing'].includes(kind)
    setValue('model-files', '')
    modelElement<HTMLInputElement>('model-new-document').checked = [
      'crystal',
      'polymer',
      'packing',
      'nanotube'
    ].includes(kind)
  }
  try {
    unsubscribe = host.viewer().subscribe((event) => {
      if (event.type === 'state') {
        const context = `${event.state.documentId ?? ''}:${event.state.revision}`
        if (context !== previousContext) {
          reset()
          pickMode = undefined
        }
        previousContext = context
      } else if (event.type === 'point' && pickMode !== undefined) {
        const mode = pickMode
        pickMode = undefined
        void host
          .viewer()
          .setOptions({ interactionMode: mode })
          .catch(() => {})
        host.usePickedPoint(event.point.cartesian)
      }
    })
  } catch {
    // The main workbench reports WebGL2 initialization errors.
  }
  host.signal.addEventListener(
    'abort',
    () => {
      unsubscribe?.()
      reset()
      runtime.dispose()
    },
    { once: true }
  )
  host.on('model-dialog', 'close', () => {
    if (!dialog.open && (current || previewView)) reset()
  })
  host.on('model-kind', 'change', choose)
  host.on('model-files', 'input', reset)
  host.on('model-new-document', 'input', () => {
    manualNewDocument = true
    reset()
  })
  host.on('model-options', 'input', () => {
    reset()
    if (value('model-kind') !== 'packing' || manualNewDocument) return
    try {
      modelElement<HTMLInputElement>('model-new-document').checked = !JSON.parse(
        value('model-options')
      ).useSubstrate
    } catch {
      // Wait for a complete recipe before choosing the default.
    }
  })
  host.on('model-accept-loss', 'change', () => {
    if (current) apply.disabled = !previewReady || !loss.checked
  })
  for (const id of ['model-cancel', 'model-close', 'cancel']) host.on(id, 'click', reset)
  choose()
  host.action('model-preview', async () => {
    reset()
    const token = generation
    const view = host.viewer()
    const state = view.getState()
    const context = { documentId: state.documentId ?? 'empty', revision: state.revision }
    const kind = value('model-kind') as ModelKind
    const files = [...(modelElement<HTMLInputElement>('model-files').files ?? [])]
    modelElement('model-status').textContent = tr('modelSearching')
    try {
      const sources = await Promise.all(files.map(readModel))
      if (generation !== token) return false
      const task = modelingTask(kind, view, JSON.parse(value('model-options')), sources)
      const result = await runtime.preview({ ...context, task })
      if (generation !== token) return false
      const editable = !readOnly(task)
      current = editable ? result : undefined
      const expanded =
        typeof result.parameters.expandedAtomCount === 'number'
          ? result.parameters.expandedAtomCount
          : result.stats.atomCount
      surface.hidden = !editable || expanded > 10_000 || !result.stats.atomCount
      modelElement('model-result').textContent = JSON.stringify(
        {
          ...result.stats,
          cell: result.snapshot.kind === 'periodic' ? result.snapshot.cell.basis : undefined,
          parameters: result.parameters,
          diagnostics: result.diagnostics
        },
        null,
        2
      )
      loss.checked = false
      const requiresLoss =
        editable && result.diagnostics.some(({ severity }) => severity === 'warning')
      modelElement('model-loss-field').hidden = !requiresLoss
      apply.hidden = !editable
      apply.disabled = true
      dialog.showModal()
      if (!surface.hidden) {
        previewView = createViewer(surface, {
          renderMode: 'ball-and-stick',
          inferBonds: !result.snapshot.bonds.length
        })
        await previewView.load(result.snapshot)
      }
      if (generation === token) {
        previewReady = true
        apply.disabled = requiresLoss && !loss.checked
      }
      return generation === token
    } finally {
      if (generation === token) modelElement('model-status').textContent = ''
    }
  })
  host.action('model-apply', async () => {
    const result = current
    if (!result || apply.disabled) return false
    const view = host.viewer()
    const state = view.getState()
    const create = newDocument() || !state.documentId
    reset()
    if ((state.documentId ?? 'empty') !== result.documentId || state.revision !== result.revision)
      throw new Error(tr('modelStale'))
    if (create) await view.load(constructionSnapshot(result))
    else
      await view.execute({
        type: 'apply-construction',
        documentId: result.documentId,
        revision: result.revision,
        construction: result
      })
  })
  function applyMobility(bottom: boolean) {
    const view = host.viewer()
    let atomIds = view.getState().selectedSourceAtomIds
    if (bottom) {
      const result = slabBottomAtomIds(
        expectKind(view.getSnapshot(), 'periodic'),
        Number(value('model-bottom'))
      )
      if (!result.ok)
        throw new ComputationError('MODELING_BOTTOM', tr('modelFixBottom'), result.diagnostics)
      atomIds = result.value
    }
    const flags = value('model-movable')
      .trim()
      .toUpperCase()
      .split(/[\s,]+/)
    if (flags.length !== 3 || flags.some((flag) => flag !== 'T' && flag !== 'F'))
      throw new Error(tr('modelMovableFlags'))
    if (!atomIds.length) throw new Error(tr('selectAtom'))
    const movable = [flags[0] === 'T', flags[1] === 'T', flags[2] === 'T'] as const
    return view.execute(atomIds.map((atomId) => ({ type: 'set-movable', atomId, movable })))
  }
  host.action('model-fix-selection', () => applyMobility(false))
  host.action('model-fix-bottom', () => applyMobility(true))
  host.action('model-empty-molecule', () =>
    host.viewer().load({ kind: 'molecular', atoms: [], bonds: [] })
  )
  host.action('model-pick', () => {
    const view = host.viewer()
    pickMode ??= view.getState().options.interactionMode
    return view.setOptions({ interactionMode: 'pick-point' })
  })
  const order = () => value('model-bond-order') as BondOrder
  host.action('model-add-bond', () => {
    const view = host.viewer()
    const entered = value('model-bond-atoms')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
    const atoms = entered.length ? entered : view.getState().selectedSourceAtomIds
    if (atoms.length !== 2) throw new Error(tr('modelBondAtoms'))
    return view.execute({
      type: 'add-bond',
      id: `sketch:bond:${++bondSequence}`,
      atoms: [atoms[0], atoms[1]],
      order: order()
    })
  })
  const editPickedBond = (change: (id: string) => EditCommand) => {
    const view = host.viewer()
    const selection = view.getState().selection
    const id = selection?.kind === 'bond' ? selection.bond.sourceBondId : undefined
    if (!id) throw new Error(tr('modelPickBond'))
    return view.execute(change(id))
  }
  host.action('model-set-bond', () =>
    editPickedBond((bondId) => ({ type: 'set-bond-order', bondId, order: order() }))
  )
  host.action('model-remove-bond', () =>
    editPickedBond((bondId) => ({ type: 'remove-bond', bondId }))
  )
}
