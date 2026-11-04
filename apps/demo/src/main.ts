import {
  ELEMENTS,
  cellParameters,
  createCell,
  fractionalToCartesian,
  cartesianToFractional
} from 'alchemion/core'
import type {
  AtomInstance,
  BondEndpoint,
  Diagnostic,
  EditCommand,
  StructureSnapshot,
  Vec3
} from 'alchemion/core'
import { parseCifDocument, parseStructure, writeStructure } from 'alchemion/formats'
import type { WriteOptions, WriteResult } from 'alchemion/formats'
import { createViewer } from 'alchemion/viewer'
import type {
  InteractionMode,
  Viewer,
  ViewerPoint,
  ViewerSelection,
  ViewerState
} from 'alchemion/viewer'
import { getLocale, setLocale, tr, type Locale, type Message } from './i18n'
import {
  calculationSample,
  calculationSampleName,
  crystalSample,
  molecularSample,
  orthogonalCrystalSample
} from './samples'
import { installGuides } from './guides'
import { markup } from './ui'
import { appendFeatureTools, installFeatures, renderFeatures } from './features'
import { appendModelingTools, installModeling } from './modeling'
import { appendResultTools, installResultTools } from './results'
import './main.css'

document.querySelector<HTMLElement>('#app')!.innerHTML = markup
appendFeatureTools()
appendModelingTools()
appendResultTools()
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const value = (id: string) =>
  el<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(id).value
const put = (id: string, text: string) => {
  el<HTMLInputElement | HTMLTextAreaElement>(id).value = text
}
const checked = (id: string) => el<HTMLInputElement>(id).checked
const disable = (id: string, disabled: boolean) => {
  el<HTMLButtonElement>(id).disabled = disabled
}
const json = (item: unknown) => JSON.stringify(item, null, 2)
const lifetime = new AbortController()
const downloads = new Map<string, number>()
let viewer: Viewer | undefined
let state: ViewerState | undefined
let unsubscribe: (() => void) | undefined
let disposed = false
let reading = false
let importGeneration = 0
let actionGeneration = 0
let note: Message = 'idle'
let importDiagnostics: readonly Diagnostic[] = []
let operationDiagnostics: readonly Diagnostic[] = []
let exportDiagnostics: readonly Diagnostic[] = []
let sourceKey = ''
let selectedAtomId = ''
let selectedInstance: { instance: AtomInstance; documentId: string; revision: number } | undefined
let selection: ViewerSelection | undefined
let point: ViewerPoint | undefined
let atomPage = 0
let nextAtom = 1
let usedAtomIds = new Set<string>()
let collected: BondEndpoint[] = []
let lastExport: { fingerprint: string; options: WriteOptions; result: WriteResult } | undefined
let candidateSignature = ''
let renderResults = () => {}
let resultsPending = false
let modelingPending = false
let localizeModeling = () => {}
let localizeGuides = () => {}

class InputError extends Error {
  constructor(readonly key: Message) {
    super(key)
  }
}
function requireViewer(): Viewer {
  if (!viewer) throw new InputError('unavailable')
  return viewer
}
function requireSource(): StructureSnapshot {
  const source = requireViewer().getSnapshot()
  if (!source) throw new InputError('emptyDocument')
  return source
}
function vector(text: string): Vec3 {
  const parts = text.trim().split(/[\s,]+/)
  const numbers = parts.map(Number)
  if (parts.length !== 3 || parts.some((v) => !v) || !numbers.every(Number.isFinite))
    throw new InputError('invalidVector')
  return numbers as unknown as Vec3
}
function number(id: string): number {
  const text = value(id)
  const n = Number(text)
  if (!text.trim() || !Number.isFinite(n)) throw new InputError('invalidNumber')
  return n
}
function diagnostics(id: string, items: readonly Diagnostic[]) {
  el(id).textContent = items.length
    ? items
        .map(
          (d) =>
            `${d.severity} ${d.code}: ${d.message}${d.sourceLocation ? `\n${json(d.sourceLocation)}` : ''}${d.context ? `\n${json(d.context)}` : ''}`
        )
        .join('\n\n')
    : tr('noDiagnostics')
  el(id).dataset.severity = items.some((d) => d.severity === 'error')
    ? 'error'
    : items.some((d) => d.severity === 'warning')
      ? 'warning'
      : ''
}
function showDiagnostics() {
  diagnostics('import-diagnostics', importDiagnostics)
  diagnostics('runtime-diagnostics', [...(state?.diagnostics ?? []), ...operationDiagnostics])
  diagnostics('export-diagnostics', exportDiagnostics)
}
function status() {
  const output = el('demo-status')
  output.dataset.state = !viewer ? 'unavailable' : reading ? 'reading' : (state?.status ?? 'empty')
  output.textContent = tr(
    !viewer ? 'unavailable' : reading ? 'reading' : (state?.status ?? 'empty')
  )
  el('operation-note').textContent = tr(note)
  const source = viewer?.getSnapshot()
  const summary = el('document-summary')
  summary.dataset.documentId = state?.documentId ?? ''
  summary.dataset.revision = String(state?.revision ?? 0)
  summary.dataset.kind = source?.kind ?? ''
  summary.dataset.atomCount = String(source?.atoms.length ?? 0)
  summary.textContent = source
    ? `${tr(source.kind)} · ${source.atoms.length} ${tr('atoms')} · ${tr('revision')} ${state?.revision}`
    : ''
  const busy = reading || state?.status === 'computing'
  disable('cancel', !busy && !resultsPending && !modelingPending)
  disable('undo', !state?.canUndo || busy)
  disable('redo', !state?.canRedo || busy)
  disable('recompute', !source || busy)
  for (const id of ['apply-atom', 'add-atom', 'delete-atom', 'apply-cell'])
    disable(id, !source || busy)
  disable('build-supercell', source?.kind !== 'periodic' || busy)
  disable('move-instance', !selectedInstance || busy)
  disable('collect-instance', !selectedInstance || busy)
  el<HTMLFieldSetElement>('cell-fields').disabled = source?.kind !== 'periodic' || busy
  el('cell-unavailable').hidden = source?.kind === 'periodic'
  disable('clear', !source && !busy)
  el('finite-fields').hidden = source?.kind !== 'periodic' || value('export-format') !== 'mol'
}
function inspect() {
  renderFeatures(state)
  el('selection-details').textContent = selection ? json(selection) : tr('noSelection')
  el('point-details').textContent = point ? json(point) : tr('noPoint')
  const measurement = state?.measurement
  el('measurement-result').textContent = measurement
    ? `${measurement.value.toFixed(4)} ${measurement.unit === 'angstrom' ? 'Å' : '°'}`
    : tr('noMeasurement')
  el('measurement-details').textContent = measurement ? json(measurement) : ''
  if (viewer) el('camera-details').textContent = json(viewer.getCamera())
}
function invalidateExport() {
  lastExport = undefined
  exportDiagnostics = []
  put('export-output', '')
  el('export-mapping').textContent = ''
  disable('accept-loss', true)
  disable('download-export', true)
  disable('download-poscar-receipt', true)
  disable('reimport-export', true)
  showDiagnostics()
}
function updateAtomFields() {
  const source = viewer?.getSnapshot()
  const atom = source?.atoms.find((a) => a.id === selectedAtomId)
  put('atom-id', atom?.id ?? '')
  if (!source || !atom) return
  put('atom-element', atom.element)
  const frame = value('coordinate-frame')
  let position: Vec3
  if (source.kind === 'periodic' && 'fractional' in atom) {
    const result =
      frame === 'cartesian' ? fractionalToCartesian(source.cell, atom.fractional) : undefined
    position = result?.ok ? result.value : atom.fractional
  } else position = 'cartesian' in atom ? atom.cartesian : [0, 0, 0]
  put('atom-position', position.map((n) => Number(n.toPrecision(10))).join(' '))
}
function sourceRows() {
  const source = viewer?.getSnapshot()
  const rows = el('atom-rows')
  rows.replaceChildren()
  const count = source?.atoms.length ?? 0
  atomPage = Math.min(atomPage, Math.max(0, Math.ceil(count / 50) - 1))
  for (const atom of source?.atoms.slice(atomPage * 50, atomPage * 50 + 50) ?? []) {
    const row = document.createElement('tr')
    const position = 'fractional' in atom ? atom.fractional : atom.cartesian
    row.dataset.atomId = atom.id
    row.dataset.element = atom.element
    row.dataset.position = json(position)
    const idCell = document.createElement('td'),
      pick = document.createElement('button')
    pick.type = 'button'
    pick.textContent = atom.id
    pick.dataset.sourceId = atom.id
    idCell.append(pick)
    row.append(idCell)
    for (const text of [atom.element, position.map((n) => Number(n.toPrecision(6))).join(' / ')]) {
      const cell = document.createElement('td')
      cell.textContent = text
      row.append(cell)
    }
    rows.append(row)
  }
  el('atom-page').textContent = `${count ? atomPage + 1 : 0} / ${Math.ceil(count / 50)}`
  disable('atoms-previous', atomPage === 0)
  disable('atoms-next', (atomPage + 1) * 50 >= count)
}
function sourceChanged() {
  const source = viewer?.getSnapshot()
  const key = `${state?.documentId ?? ''}:${state?.revision ?? 0}`
  if (key === sourceKey) return
  const previousDocument = sourceKey.split(':').slice(0, -1).join(':')
  sourceKey = key
  if (previousDocument !== state?.documentId) {
    usedAtomIds = new Set()
    nextAtom = 1
    atomPage = 0
  }
  for (const atom of source?.atoms ?? []) usedAtomIds.add(atom.id)
  selectedAtomId = source?.atoms.some((a) => a.id === selectedAtomId)
    ? selectedAtomId
    : (source?.atoms[0]?.id ?? '')
  selectedInstance = undefined
  selection = undefined
  point = undefined
  collected = []
  el('instance-count').textContent = '0'
  put('finite-source-ids', '')
  if (source?.kind === 'periodic') {
    const parameters = cellParameters(source.cell)
    if (parameters.ok)
      for (const [id, n] of Object.entries(parameters.value))
        put(`cell-${id}`, String(Number(n.toPrecision(10))))
  }
  el<HTMLOptionElement>('coordinate-frame').querySelector<HTMLOptionElement>(
    'option[value=fractional]'
  )!.disabled = source?.kind !== 'periodic'
  put('coordinate-frame', source?.kind === 'periodic' ? 'fractional' : 'cartesian')
  put('batch-frame', source?.kind === 'periodic' ? 'fractional' : 'cartesian')
  el<HTMLSelectElement>('batch-frame').querySelector<HTMLOptionElement>(
    'option[value=fractional]'
  )!.disabled = source?.kind !== 'periodic'
  sourceRows()
  updateAtomFields()
  invalidateExport()
}
function language() {
  setLocale(value('language-select') as Locale)
  status()
  showDiagnostics()
  inspect()
  renderResults()
  localizeModeling()
  localizeGuides()
  const placeholder = el<HTMLSelectElement>('block-select').options[0]
  if (placeholder?.value === '') placeholder.textContent = tr('chooseBlock')
}
async function run(action: () => unknown | Promise<unknown>) {
  const token = ++actionGeneration
  operationDiagnostics = []
  showDiagnostics()
  try {
    const result = await action()
    if (token === actionGeneration && result !== false) {
      note = 'completed'
      status()
    }
  } catch (error) {
    if (disposed || token !== actionGeneration) return
    if (error instanceof Error && error.name === 'AbortError') {
      note = 'cancelledNote'
    } else if (error instanceof InputError) {
      note = error.key
    } else {
      operationDiagnostics =
        error && typeof error === 'object' && 'diagnostics' in error
          ? (error.diagnostics as readonly Diagnostic[])
          : [
              {
                severity: 'error',
                code: 'DEMO_OPERATION',
                message: error instanceof Error ? error.message : String(error)
              }
            ]
    }
    status()
    showDiagnostics()
  }
}
function on(id: string, event: string, listener: (event: Event) => void) {
  el(id).addEventListener(event, listener, { signal: lifetime.signal })
}
function action(id: string, callback: () => unknown | Promise<unknown>) {
  on(id, 'click', () => {
    void run(callback)
  })
}
function form(id: string, callback: () => unknown | Promise<unknown>) {
  on(id, 'submit', (event) => {
    event.preventDefault()
    void run(callback)
  })
}
function tab(id: string) {
  document.querySelectorAll<HTMLElement>('.tool-panel').forEach((panel) => {
    panel.hidden = panel.id !== `panel-${id}`
  })
  document
    .querySelectorAll<HTMLButtonElement>('[data-panel]')
    .forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.panel === id)))
}
function resetCandidates() {
  candidateSignature = ''
  el('block-field').hidden = true
  el('block-select').replaceChildren()
  el('import-version').textContent = '—'
}
async function importText(token = ++importGeneration) {
  const text = value('import-text'),
    format = value('import-format') as 'cif' | 'mol' | 'poscar'
  const signature = `${format}:${text}`
  const block =
    candidateSignature === signature && value('block-select') !== ''
      ? Number(value('block-select'))
      : undefined
  const parsed = parseStructure(
    text,
    format === 'cif'
      ? { format, ...(block !== undefined ? { block: { index: block } } : {}) }
      : { format }
  )
  if (token !== importGeneration) return false
  importDiagnostics = parsed.diagnostics
  if (parsed.candidates?.length) {
    const select = el<HTMLSelectElement>('block-select')
    if (candidateSignature !== signature) {
      select.replaceChildren(new Option(tr('chooseBlock'), ''))
      for (const candidate of parsed.candidates)
        select.add(new Option(candidate.name, String(candidate.index)))
    }
    candidateSignature = signature
    el('block-field').hidden = false
  } else if (candidateSignature !== signature) resetCandidates()
  // Resetting candidate UI must not erase the detected version.
  if (format === 'cif')
    el('import-version').textContent = parseCifDocument(text).document?.version ?? '—'
  else
    el('import-version').textContent =
      format === 'poscar' ? 'VASP5' : (text.match(/\bV(?:2000|3000)\b/)?.[0] ?? '—')
  showDiagnostics()
  if (!parsed.structure) return false
  await requireViewer().load(parsed.structure)
  return true
}
const structureExamples = {
  orthogonal: { format: 'cif', text: orthogonalCrystalSample },
  crystal: { format: 'cif', text: crystalSample },
  molecule: { format: 'mol', text: molecularSample }
}
function sample(id: keyof typeof structureExamples) {
  if ((state?.canUndo || state?.canRedo) && !window.confirm(tr('kitReplaceExample'))) return false
  const { format, text } = structureExamples[id]
  ++importGeneration
  reading = false
  resetCandidates()
  put('sample-select', id)
  put('import-format', format)
  put('import-text', text)
  return importText()
}
function selectedAtom() {
  const source = requireSource()
  const atom = source.atoms.find((a) => a.id === selectedAtomId)
  if (!atom) throw new InputError('selectAtom')
  return atom
}
function fingerprint(options: WriteOptions) {
  return json({ documentId: state?.documentId, revision: state?.revision, options })
}
function exportOptions(allowLoss = false): WriteOptions {
  const format = value('export-format')
  if (format === 'cif') return { format, version: value('export-version') as '1' | '2', allowLoss }
  if (format === 'poscar') return { format, allowLoss }
  const finite = value('finite-kind')
  return {
    format: 'mol',
    version: value('export-version') as 'V2000' | 'V3000',
    allowLoss,
    ...(finite === 'source'
      ? {
          finite: {
            kind: 'source' as const,
            atomIds: value('finite-source-ids')
              .trim()
              .split(/[\s,]+/)
              .filter(Boolean)
          }
        }
      : finite === 'instances'
        ? {
            finite: {
              kind: 'instances' as const,
              endpoints: collected.map((endpoint) => ({ ...endpoint }))
            }
          }
        : {})
  }
}
const lossExceptions = new Set([
  'CIF_UNCERTAINTY_STALE',
  'CIF_UNMAPPED_SCIENCE',
  'CIF_UNMAPPED_FRAME'
])
function onlyLossErrors(items: readonly Diagnostic[]): boolean {
  const blocking = items.filter((d) => d.severity === 'error')
  return (
    blocking.length > 0 &&
    blocking.every((d) => d.code.endsWith('_LOSS') || lossExceptions.has(d.code))
  )
}
function checkExport(accept = false) {
  const options = exportOptions(accept)
  if (accept && (!lastExport || lastExport.fingerprint !== fingerprint(exportOptions(false))))
    throw new InputError('exportChanged')
  const source = requireSource()
  let result = writeStructure(source, options)
  if (!accept && !result.text && onlyLossErrors(result.diagnostics)) {
    // A codec may stop at an early scientific-loss gate. Enumerate deeper
    // diagnostics in a pure dry run; its generated text is never exposed or
    // retained. The user must see the full list before accepting this export.
    const dryRun = writeStructure(source, { ...options, allowLoss: true })
    const complete = new Map<string, Diagnostic>()
    for (const entry of [...result.diagnostics, ...dryRun.diagnostics]) {
      const key = JSON.stringify([entry.code, entry.message, entry.context, entry.sourceLocation])
      if (!complete.has(key)) complete.set(key, entry)
    }
    result = { diagnostics: [...complete.values()] }
  }
  lastExport = { fingerprint: fingerprint(exportOptions(false)), options, result }
  exportDiagnostics = result.diagnostics
  put('export-output', result.text ?? '')
  el('export-mapping').textContent = result.atomMapping ? json(result.atomMapping) : ''
  // Stable diagnostic codes distinguish an explicitly acceptable scientific loss
  // from hard format requirements. A hard error must never offer an override.
  disable('accept-loss', !!result.text || !onlyLossErrors(result.diagnostics) || accept)
  disable('download-export', !result.text)
  disable('download-poscar-receipt', !result.poscarReceipt)
  disable('reimport-export', !result.text)
  showDiagnostics()
  return !!result.text
}
function currentExport() {
  if (!lastExport?.result.text || lastExport.fingerprint !== fingerprint(exportOptions(false)))
    throw new InputError('exportChanged')
  return lastExport
}
function updateExportFormat() {
  const format = value('export-format'),
    versions = el<HTMLSelectElement>('export-version')
  versions.replaceChildren(
    ...(format === 'cif'
      ? [new Option('CIF 2.0', '2'), new Option('CIF 1.1', '1')]
      : format === 'mol'
        ? [new Option('V3000', 'V3000'), new Option('V2000', 'V2000')]
        : [])
  )
  versions.disabled = format === 'poscar'
  invalidateExport()
  status()
}

for (const id of ['style-element', 'atom-element']) {
  const select = el<HTMLSelectElement>(id)
  for (const element of ELEMENTS) select.add(new Option(element.symbol, element.symbol))
  select.value = 'C'
}
el<HTMLInputElement>('atom-id').readOnly = true
put('language-select', getLocale())
setLocale(getLocale())
const cameraSection = document.createElement('details'),
  cameraTitle = document.createElement('summary'),
  cameraDetails = document.createElement('pre')
cameraTitle.dataset.i18n = 'camera'
cameraTitle.textContent = tr('camera')
cameraDetails.id = 'camera-details'
cameraSection.append(cameraTitle, cameraDetails)
el('panel-display').append(cameraSection)
try {
  viewer = createViewer(el('viewer'), { interactionMode: 'select', showLattice: true })
  el<HTMLInputElement>('show-lattice').checked = true
  // An oblique initial direction keeps the teaching molecule's z-directed bond
  // away from the viewing ray. Subsequent loads still use the SDK's automatic fit.
  viewer.setCamera({
    position: [12, 10, 28],
    target: [0, 1.5, 1.5],
    up: [0, 1, 0],
    fovYDegrees: 45,
    near: 0.1,
    far: 1000
  })
  unsubscribe = viewer.subscribe((event) => {
    if (event.type === 'state') {
      state = event.state
      sourceChanged()
      status()
      showDiagnostics()
      inspect()
      renderResults()
    } else if (event.type === 'selection') {
      selection = event.selection
      selectedInstance =
        event.selection?.kind === 'atom' && event.documentId
          ? {
              instance: event.selection.instance,
              documentId: event.documentId,
              revision: event.revision
            }
          : undefined
      if (selectedInstance) {
        selectedAtomId = selectedInstance.instance.sourceAtomId
        updateAtomFields()
        put('instance-position', selectedInstance.instance.cartesian.join(' '))
      }
      status()
      inspect()
    } else if (event.type === 'point') {
      point = event.point
      inspect()
    } else if (event.type === 'measurement') {
      if (event.diagnostics.length) operationDiagnostics = event.diagnostics
      // The matching state event carries the updated measurement.
      if (!event.measurement) {
        el('measurement-result').textContent = tr('noMeasurement')
        el('measurement-details').textContent = ''
      }
      showDiagnostics()
    }
  })
} catch (error) {
  el('webgl-unavailable').hidden = false
  el('webgl-details').textContent = error instanceof Error ? error.message : String(error)
}
document
  .querySelectorAll<HTMLButtonElement>('[data-panel]')
  .forEach((button) =>
    button.addEventListener('click', () => tab(button.dataset.panel!), { signal: lifetime.signal })
  )
on('language-select', 'change', language)
action('load-sample', () => sample(value('sample-select') as keyof typeof structureExamples))
const compactInspector = window.matchMedia('(max-width: 1100px)')
function resizeInspector() {
  el<HTMLDetailsElement>('kit-inspector').open = !compactInspector.matches
}
resizeInspector()
compactInspector.addEventListener('change', resizeInspector, { signal: lifetime.signal })
action('import-button', () => importText())
for (const id of ['import-text', 'import-format'])
  on(id, id === 'import-text' ? 'input' : 'change', () => {
    ++importGeneration
    reading = false
    resetCandidates()
    importDiagnostics = []
    status()
    showDiagnostics()
  })
on('file-input', 'change', () => {
  const file = el<HTMLInputElement>('file-input').files?.[0]
  if (!file) return
  const token = ++importGeneration
  reading = true
  status()
  resetCandidates()
  void file
    .text()
    .then(async (text) => {
      if (disposed || token !== importGeneration) return
      reading = false
      put('import-text', text)
      const cif = /\.cif$/i.test(file.name) || /^\s*(?:#.*\n\s*)*data_/i.test(text)
      const poscar = /(?:^|[.])(POSCAR|CONTCAR|vasp)$/i.test(file.name)
      put('import-format', cif ? 'cif' : poscar ? 'poscar' : 'mol')
      status()
      await run(() => importText(token))
    })
    .catch(() => {
      if (!disposed && token === importGeneration) {
        reading = false
        note = 'fileReadFailed'
        status()
      }
    })
})
action('undo', () => requireViewer().undo())
action('redo', () => requireViewer().redo())
action('recompute', () => requireViewer().recompute())
on('cancel', 'click', () => {
  ++importGeneration
  ++actionGeneration
  reading = false
  viewer?.cancel()
  note = 'cancelledNote'
  status()
})
action('clear', () => {
  ++importGeneration
  reading = false
  requireViewer().clear()
})
form('display-form', () => {
  const neighbors = value('neighbor-cells').trim()
    ? value('neighbor-cells').trim().split(/\n|;/).map(vector)
    : []
  if (neighbors.some((offset) => !offset.every(Number.isInteger)))
    throw new InputError('invalidNeighbors')
  const cutoff = value('cutoff')
  return requireViewer().setOptions({
    renderMode: value('render-mode') as 'space-filling' | 'ball-and-stick',
    atomScale: number('atom-scale'),
    ballRadius: number('ball-radius'),
    bondRadius: number('bond-radius'),
    missingRadius: number('missing-radius'),
    showLattice: checked('show-lattice'),
    showSymmetryMates: checked('show-symmetry'),
    showReciprocalLattice: checked('show-reciprocal'),
    showBrillouinZone: checked('show-bz'),
    inferBonds: checked('infer-bonds'),
    showPerformance: checked('show-performance'),
    neighborCells: neighbors,
    cutoff:
      cutoff === 'fraction'
        ? { kind: 'fraction', width: vector(value('fraction-margin')) }
        : cutoff === 'bond'
          ? { kind: 'bond' }
          : { kind: 'none' }
  })
})
form('style-form', () => {
  const view = requireViewer()
  return view.setOptions({
    elementStyles: {
      ...view.getState().options.elementStyles,
      [value('style-element')]: {
        color: value('element-color'),
        spaceFillingRadius: number('style-space-radius'),
        ballRadius: number('style-ball-radius')
      }
    }
  })
})
action('reset-style', () => {
  const view = requireViewer()
  const styles = { ...view.getState().options.elementStyles }
  delete styles[value('style-element')]
  return view.setOptions({ elementStyles: styles })
})
for (const [id, callback] of [
  ['center', () => requireViewer().center()],
  ['rotate', () => requireViewer().rotate(15, 0)],
  ['zoom-in', () => requireViewer().zoom(1 / 1.2)],
  ['zoom-out', () => requireViewer().zoom(1.2)]
] as const)
  action(id, () => {
    callback()
    inspect()
  })
form('tool-form', () =>
  requireViewer().setOptions({ interactionMode: value('interaction-mode') as InteractionMode })
)
on('atom-rows', 'click', (event) => {
  const id = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-source-id]')
    ?.dataset.sourceId
  if (id) {
    selectedAtomId = id
    requireViewer().setSelectedSourceAtomIds([id])
    updateAtomFields()
  }
})
on('coordinate-frame', 'change', updateAtomFields)
form('atom-form', () => {
  const atom = selectedAtom()
  const commands: EditCommand[] = [
    { type: 'set-element', atomId: atom.id, element: value('atom-element') },
    {
      type: 'set-position',
      atomId: atom.id,
      position: {
        frame: value('coordinate-frame') as 'fractional' | 'cartesian',
        value: vector(value('atom-position'))
      }
    }
  ]
  return requireViewer().execute(commands)
})
action('add-atom', () => {
  const source = requireSource()
  let position = vector(value('atom-position'))
  if (source.kind === 'periodic' && value('coordinate-frame') === 'cartesian') {
    const converted = cartesianToFractional(source.cell, position)
    if (!converted.ok) {
      operationDiagnostics = converted.diagnostics
      showDiagnostics()
      return false
    }
    position = converted.value
  }
  let id: string
  do {
    id = `demo-atom-${nextAtom++}`
  } while (usedAtomIds.has(id))
  usedAtomIds.add(id)
  selectedAtomId = id
  return requireViewer().execute({
    type: 'add-atom',
    atom:
      source.kind === 'periodic'
        ? { id, element: value('atom-element'), fractional: position }
        : { id, element: value('atom-element'), cartesian: position }
  })
})
action('delete-atom', () =>
  requireViewer().execute({ type: 'remove-atom', atomId: selectedAtom().id })
)
action('move-instance', () => {
  if (!selectedInstance) throw new InputError('selectInstance')
  return requireViewer().execute({
    type: 'set-instance-position',
    ...selectedInstance,
    cartesian: vector(value('instance-position'))
  })
})
form('cell-form', () => {
  const created = createCell({
    a: number('cell-a'),
    b: number('cell-b'),
    c: number('cell-c'),
    alpha: number('cell-alpha'),
    beta: number('cell-beta'),
    gamma: number('cell-gamma')
  })
  if (!created.ok) {
    operationDiagnostics = created.diagnostics
    showDiagnostics()
    return false
  }
  const commands: EditCommand[] = [{ type: 'set-cell', cell: created.value }]
  if (checked('reset-p1'))
    commands.push({ type: 'set-symmetry', symmetry: { spaceGroup: { hallNumber: 1 } } })
  return requireViewer().execute(commands)
})
action('atoms-previous', () => {
  atomPage--
  sourceRows()
})
action('atoms-next', () => {
  atomPage++
  sourceRows()
})
on('export-format', 'change', updateExportFormat)
for (const id of ['export-version', 'finite-kind', 'finite-source-ids'])
  on(id, id === 'finite-source-ids' ? 'input' : 'change', invalidateExport)
action('finite-all', () => {
  put(
    'finite-source-ids',
    requireSource()
      .atoms.map((a) => a.id)
      .join(', ')
  )
  put('finite-kind', 'source')
  invalidateExport()
})
action('collect-instance', () => {
  if (!selectedInstance) throw new InputError('selectInstance')
  const { sourceAtomId, symmetryOperationId, integerCellOffset } = selectedInstance.instance
  const endpoint = { sourceAtomId, symmetryOperationId, integerCellOffset }
  if (!collected.some((item) => json(item) === json(endpoint))) collected.push(endpoint)
  put('finite-kind', 'instances')
  el('instance-count').textContent = String(collected.length)
  invalidateExport()
})
action('clear-instances', () => {
  collected = []
  el('instance-count').textContent = '0'
  invalidateExport()
})
form('export-form', () => checkExport())
action('accept-loss', () => checkExport(true))
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  downloads.set(
    url,
    window.setTimeout(() => {
      URL.revokeObjectURL(url)
      downloads.delete(url)
    }, 1000)
  )
}
action('download-export', () => {
  const current = currentExport()
  download(
    new Blob([current.result.text!], { type: 'text/plain;charset=utf-8' }),
    current.options.format === 'poscar' ? 'POSCAR' : `alchemion.${current.options.format}`
  )
})
action('download-poscar-receipt', () => {
  const receipt = currentExport().result.poscarReceipt
  if (!receipt) throw new InputError('exportChanged')
  download(new Blob([json(receipt)], { type: 'application/json' }), 'POSCAR.alchemion.json')
})
action('reimport-export', () => {
  const current = currentExport()
  resetCandidates()
  put('import-format', current.options.format)
  put('import-text', current.result.text!)
  tab('import')
  return importText()
})
window.addEventListener(
  'pagehide',
  (event) => {
    if (disposed || event.persisted) return
    disposed = true
    ++importGeneration
    ++actionGeneration
    lifetime.abort()
    unsubscribe?.()
    viewer?.dispose()
    for (const [url, timer] of downloads) {
      window.clearTimeout(timer)
      URL.revokeObjectURL(url)
    }
    downloads.clear()
  },
  { signal: lifetime.signal }
)
installFeatures({
  signal: lifetime.signal,
  viewer: requireViewer,
  source: requireSource,
  action,
  form,
  on,
  run,
  vector,
  download,
  inspect
})
const modeling = installModeling({
  signal: lifetime.signal,
  viewer: requireViewer,
  action,
  on,
  pending(next) {
    if (next === modelingPending) return
    modelingPending = next
    status()
  },
  usePickedPoint(pickedPoint) {
    put('coordinate-frame', 'cartesian')
    put('atom-position', pickedPoint.join(' '))
    tab('edit')
  }
})
localizeModeling = modeling.localize
localizeModeling()
const results = installResultTools({
  signal: lifetime.signal,
  viewer: () => viewer,
  action,
  form,
  on,
  run,
  vector,
  pending(next) {
    if (next === resultsPending) return
    resultsPending = next
    status()
  }
})
renderResults = results.render
localizeGuides = installGuides({
  signal: lifetime.signal,
  locale: getLocale,
  available: () => Boolean(viewer),
  openTool(panel, kind, recipe) {
    tab(panel)
    if (kind && (kind !== value('model-kind') || recipe !== undefined))
      modeling.choose(kind, recipe)
    el(`tab-${panel}`).focus()
  },
  loadExample(id) {
    void run(() => {
      if (id === 'results') {
        tab('results')
        return results.importExample(
          new File([calculationSample], calculationSampleName, { type: 'application/json' })
        )
      }
      tab('import')
      return sample(id)
    })
  }
})
status()
inspect()
showDiagnostics()
invalidateExport()
if (viewer) void run(() => sample('orthogonal'))
