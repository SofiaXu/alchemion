import { ELEMENTS, cartesianToFractional } from 'alchemion/core'
import type { CoordinationRule, EditCommand, StructureSnapshot, Vec3 } from 'alchemion/core'
import type { Viewer, ViewerState, ViewerResultViewState, ViewerViewState } from 'alchemion/viewer'
import { validatePortableViewState } from 'alchemion/viewer'
import { tr } from './i18n'
import type { Message } from './i18n'
import { NamedViews } from './views'

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const value = (id: string) => el<HTMLInputElement>(id).value
const put = (id: string, text: string) => {
  el<HTMLInputElement>(id).value = text
}
const word = (key: Message) => `<span data-i18n="${key}"></span>`
const button = (id: string, key: Message, type = 'button') =>
  `<button id="${id}" type="${type}" data-i18n="${key}"></button>`
const field = (id: string, key: Message, input: string) =>
  `<label for="${id}">${word(key)}</label>${input}`
const input = (id: string, initial: string, type = 'text') =>
  `<input id="${id}" type="${type}" value="${initial}">`
const slots = new NamedViews()

export function appendFeatureTools() {
  el('panel-edit')
    .querySelector('h1')!
    .insertAdjacentHTML(
      'afterend',
      `<h2 data-i18n="batch"></h2><p class="hint" data-i18n="batchHelp"></p>
    <p>${word('selectedCount')}: <output id="selected-count">0</output></p>
    ${field('batch-element', 'element', '<select id="batch-element"></select>')}
    <div class="button-row">${button('select-element', 'selectElement')}${button('select-all', 'selectAll')}${button('clear-selection', 'clearSelection')}</div>
    ${field('batch-frame', 'coordinateFrame', '<select id="batch-frame"><option value="cartesian" data-i18n="cartesian"></option><option value="fractional" data-i18n="fractional"></option></select>')}
    ${field('batch-translation', 'translation', input('batch-translation', '0 0 0'))}
    <div class="button-row">${button('translate-selected', 'translateSelected')}${button('replace-selected', 'replaceSelected')}${button('delete-selected', 'deleteSelected')}</div>
    <hr><h2 data-i18n="supercell"></h2><p class="hint" data-i18n="supercellHelp"></p>
    <form id="supercell-form">${field('supercell-repetitions', 'repetitions', input('supercell-repetitions', '2 2 2'))}${button('build-supercell', 'buildSupercell', 'submit')}</form><hr>`
    )
  el('interaction-mode').insertAdjacentHTML(
    'beforeend',
    '<option value="box-select" data-i18n="boxSelect"></option>'
  )
  el('panel-measure').insertAdjacentHTML(
    'beforeend',
    `<hr><h2 data-i18n="coordination"></h2><p class="hint" data-i18n="coordinationHelp"></p>
    <form id="coordination-form">${field('coordination-rules', 'coordinationRules', '<textarea id="coordination-rules" rows="4" spellcheck="false"></textarea>')}
    <label class="check"><input id="show-polyhedra" type="checkbox">${word('showPolyhedra')}</label>${button('analyze-coordination', 'analyze', 'submit')}</form>`
  )
  el('panel-display').insertAdjacentHTML(
    'beforeend',
    `<hr><h2 data-i18n="views"></h2><p class="hint" data-i18n="viewHelp"></p>
    ${field('view-slot', 'viewSlot', '<select id="view-slot"></select>')}${field('view-name', 'viewName', input('view-name', 'View 1'))}
    <div class="button-row">${button('save-view', 'saveView')}${button('restore-view', 'restoreView')}${button('rename-view', 'renameView')}${button('delete-view', 'deleteView')}</div>
    <p id="view-storage-notice" class="hint"></p>${button('download-view', 'downloadView')}
    ${field('import-view', 'importView', '<input id="import-view" type="file" accept=".json,application/json">')}`
  )
  el('panel-export').insertAdjacentHTML(
    'beforeend',
    `<hr><h2 data-i18n="image"></h2><form id="image-form"><div class="grid2">
    ${field('image-width', 'imageWidth', input('image-width', '3840', 'number'))}${field('image-height', 'imageHeight', input('image-height', '2160', 'number'))}</div>
    <label class="check"><input id="image-transparent" type="checkbox">${word('transparent')}</label>${button('download-png', 'exportPng', 'submit')}</form>`
  )
  el('measurement-details').insertAdjacentHTML(
    'afterend',
    '<h3 data-i18n="coordination"></h3><pre id="coordination-details"></pre>'
  )
  const elements = el<HTMLSelectElement>('batch-element')
  for (const element of ELEMENTS) elements.add(new Option(element.symbol, element.symbol))
  elements.value = 'C'
  refreshSlots()
}
function refreshSlots(selected = value('view-slot')) {
  const select = el<HTMLSelectElement>('view-slot')
  select.replaceChildren(...[...slots.slots.keys()].map((name) => new Option(name, name)))
  if (slots.slots.has(selected)) select.value = selected
  el('view-storage-notice').textContent = tr(slots.notice)
}
export function renderFeatures(state: ViewerState | undefined) {
  el('selected-count').textContent = String(state?.selectedSourceAtomIds.length ?? 0)
  el('coordination-details').textContent = state?.coordination
    ? JSON.stringify(state.coordination, null, 2)
    : tr('noCoordination')
  el('view-storage-notice').textContent = tr(slots.notice)
  const ready = state?.status === 'ready'
  for (const id of [
    'translate-selected',
    'replace-selected',
    'delete-selected',
    'analyze-coordination'
  ])
    el<HTMLButtonElement>(id).disabled = !ready || !state?.selectedSourceAtomIds.length
  el<HTMLButtonElement>('download-png').disabled = !ready
  for (const button of document.querySelectorAll<HTMLButtonElement>('button[data-source-id]'))
    button.setAttribute(
      'aria-pressed',
      String(state?.selectedSourceAtomIds.includes(button.dataset.sourceId!))
    )
}
interface FeatureHost {
  readonly signal: AbortSignal
  viewer(): Viewer
  source(): StructureSnapshot
  action(id: string, action: () => unknown | Promise<unknown>): void
  form(id: string, action: () => unknown | Promise<unknown>): void
  on(id: string, event: string, listener: (event: Event) => void): void
  run(action: () => unknown | Promise<unknown>): Promise<void>
  vector(text: string): Vec3
  download(blob: Blob, name: string): void
  inspect(): void
}
export function installFeatures(host: FeatureHost) {
  let viewGeneration = 0
  const supersedeView = () => {
    viewGeneration++
  }
  host.signal.addEventListener('abort', supersedeView, { once: true })
  for (const id of [
    'clear',
    'cancel',
    'undo',
    'redo',
    'center',
    'rotate',
    'zoom-in',
    'zoom-out',
    'import-button',
    'load-sample',
    'reset-style',
    'result-open',
    'result-bind',
    'result-remove',
    'result-preview-frame',
    'result-exit-preview',
    'result-apply-layer',
    'result-toggle-layer',
    'result-remove-layer'
  ])
    host.on(id, 'click', supersedeView)
  for (const id of ['display-form', 'style-form', 'result-layer-form'])
    host.on(id, 'submit', supersedeView)
  host.on('file-input', 'change', supersedeView)
  host.on('result-frame', 'change', supersedeView)
  host.on('result-frame-slider', 'input', supersedeView)
  host.on('viewer', 'pointerdown', supersedeView)
  host.on('viewer', 'wheel', supersedeView)
  const selected = () => {
    const ids = new Set(host.viewer().getState().selectedSourceAtomIds)
    if (!ids.size) throw new Error(tr('selectAtom'))
    return host.source().atoms.filter((atom) => ids.has(atom.id))
  }
  host.action('select-element', () =>
    host.viewer().setSelectedSourceAtomIds(
      host
        .source()
        .atoms.filter((atom) => atom.element === value('batch-element'))
        .map((atom) => atom.id)
    )
  )
  host.action('select-all', () =>
    host.viewer().setSelectedSourceAtomIds(host.source().atoms.map((atom) => atom.id))
  )
  host.action('clear-selection', () => host.viewer().setSelectedSourceAtomIds([]))
  host.action('replace-selected', () =>
    host.viewer().execute(
      selected().map((atom) => ({
        type: 'set-element',
        atomId: atom.id,
        element: value('batch-element')
      }))
    )
  )
  host.action('delete-selected', () =>
    host.viewer().execute(selected().map((atom) => ({ type: 'remove-atom', atomId: atom.id })))
  )
  host.action('translate-selected', () => {
    const source = host.source()
    let delta = host.vector(value('batch-translation'))
    if (source.kind === 'periodic' && value('batch-frame') === 'cartesian') {
      const converted = cartesianToFractional(source.cell, delta)
      if (!converted.ok) throw new Error(converted.diagnostics[0].message)
      delta = converted.value
    } else if (source.kind === 'molecular' && value('batch-frame') !== 'cartesian')
      throw new Error(tr('cellOnly'))
    const commands: EditCommand[] = selected().map((atom) => ({
      type: 'set-position',
      atomId: atom.id,
      position: {
        frame: source.kind === 'periodic' ? 'fractional' : 'cartesian',
        value: ('fractional' in atom ? atom.fractional : atom.cartesian).map(
          (v, index) => v + delta[index]
        ) as unknown as Vec3
      }
    }))
    return host.viewer().execute(commands)
  })
  host.form('supercell-form', () =>
    host.viewer().execute({
      type: 'build-supercell',
      repetitions: host.vector(value('supercell-repetitions'))
    })
  )
  host.form('coordination-form', () => {
    const rules: CoordinationRule[] = value('coordination-rules')
      .trim()
      .split(/\n|;/)
      .filter((line) => line.trim())
      .map((line) => {
        const fields = line.trim().split(/\s+/)
        if (fields.length !== 3 && fields.length !== 4) throw new Error(tr('coordinationHelp'))
        return {
          elements: [fields[0], fields[1]],
          ...(fields.length === 4 ? { minDistance: Number(fields[2]) } : {}),
          maxDistance: Number(fields.at(-1))
        }
      })
    return host.viewer().setOptions({
      coordination: { rules, showPolyhedra: el<HTMLInputElement>('show-polyhedra').checked }
    })
  })
  const restore = async (state: ViewerViewState | ViewerResultViewState, generation: number) => {
    if (host.signal.aborted || generation !== viewGeneration) return false
    await host.viewer().restoreViewState(state)
    if (host.signal.aborted || generation !== viewGeneration) return false
    const options = host.viewer().getState().options
    for (const [id, content] of Object.entries({
      'render-mode': options.renderMode,
      'atom-scale': options.atomScale,
      'ball-radius': options.ballRadius,
      'bond-radius': options.bondRadius,
      'missing-radius': options.missingRadius,
      'neighbor-cells': options.neighborCells.map((cell) => cell.join(' ')).join('\n'),
      cutoff: options.cutoff.kind,
      'fraction-margin':
        options.cutoff.kind === 'fraction' ? options.cutoff.width.join(' ') : '0 0 0',
      'interaction-mode': options.interactionMode,
      'coordination-rules': options.coordination.rules
        .map((rule) => `${rule.elements.join(' ')} ${rule.minDistance ?? 0} ${rule.maxDistance}`)
        .join('\n')
    }))
      put(id, String(content))
    for (const [id, content] of Object.entries({
      'show-lattice': options.showLattice,
      'show-symmetry': options.showSymmetryMates,
      'show-reciprocal': options.showReciprocalLattice,
      'show-bz': options.showBrillouinZone,
      'infer-bonds': options.inferBonds,
      'show-performance': options.showPerformance,
      'show-polyhedra': options.coordination.showPolyhedra
    }))
      el<HTMLInputElement>(id).checked = content
    host.inspect()
  }
  const name = () => {
    const result = value('view-name').trim()
    if (!result) throw new Error(tr('viewName'))
    return result
  }
  const currentView = () => {
    const viewer = host.viewer()
    return viewer.results.getState().layers.length
      ? viewer.getViewState({ includeResults: true })
      : viewer.getViewState()
  }
  host.action('save-view', () => {
    const key = name()
    slots.slots.set(key, currentView())
    slots.persist()
    refreshSlots(key)
  })
  host.action('restore-view', () => {
    const saved = slots.slots.get(value('view-slot'))
    if (!saved) throw new Error(tr('viewSlot'))
    return restore(saved, ++viewGeneration)
  })
  host.action('rename-view', () => {
    const previous = value('view-slot'),
      next = name(),
      saved = slots.slots.get(previous)
    if (!saved || (previous !== next && slots.slots.has(next))) throw new Error(tr('viewName'))
    slots.slots.delete(previous)
    slots.slots.set(next, saved)
    slots.persist()
    refreshSlots(next)
  })
  host.action('delete-view', () => {
    slots.slots.delete(value('view-slot'))
    slots.persist()
    refreshSlots()
  })
  host.action('download-view', () =>
    host.download(
      new Blob([JSON.stringify(currentView(), null, 2)], {
        type: 'application/json'
      }),
      'alchemion-view.json'
    )
  )
  host.on('import-view', 'change', () => {
    const generation = ++viewGeneration
    const file = el<HTMLInputElement>('import-view').files?.[0]
    if (file)
      void host.run(async () => {
        const text = await file.text()
        if (host.signal.aborted || generation !== viewGeneration) return false
        return restore(validatePortableViewState(JSON.parse(text)), generation)
      })
  })
  host.form('image-form', async () =>
    host.download(
      await host.viewer().exportPng({
        width: Number(value('image-width')),
        height: Number(value('image-height')),
        transparent: el<HTMLInputElement>('image-transparent').checked
      }),
      'alchemion.png'
    )
  )
}
