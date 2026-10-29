import { createViewer, type InteractionMode } from 'alchemion/viewer'
import { demoStructure } from './demo-structure'
import './main.scss'

const container = document.querySelector<HTMLElement>('.editor')!
const viewer = createViewer(container)
const panel = document.querySelector<HTMLElement>('.leftPanel')!
const status = document.createElement('output')
status.id = 'demo-status'
const details = document.createElement('pre')
panel.append(status, details)
viewer.subscribe((event) => {
  if (event.type === 'state') {
    status.textContent = event.state.status
    if (event.state.diagnostics.length)
      details.textContent = event.state.diagnostics.map((d) => `${d.code}: ${d.message}`).join('\n')
  } else if (event.type === 'point') details.textContent = JSON.stringify(event.point, null, 2)
  else if (event.type === 'measurement')
    details.textContent = event.measurement
      ? `${event.measurement.value.toFixed(4)} ${event.measurement.unit}`
      : event.diagnostics.map((d) => d.message).join('\n')
  else if (event.type === 'selection')
    details.textContent = event.selection ? JSON.stringify(event.selection, null, 2) : ''
})
function run(action: () => void | Promise<void>) {
  try {
    Promise.resolve(action()).catch((error: Error) => {
      if (error.name !== 'AbortError') details.textContent = error.message
    })
  } catch (error) {
    details.textContent = error instanceof Error ? error.message : String(error)
  }
}
function button(label: string, action: () => void | Promise<void>) {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = 'btn btn-outline-primary m-1'
  element.textContent = label
  element.addEventListener('click', () => run(action))
  panel.append(element)
}
button('Load', () => viewer.load(demoStructure()))
button('Clear', () => viewer.clear())
button('Center', () => viewer.center())
button('Rotate', () => viewer.rotate(15, 0))
button('Zoom in', () => viewer.zoom(1 / 1.2))
button('Zoom out', () => viewer.zoom(1.2))
button('Space filling', () => viewer.setOptions({ renderMode: 'space-filling' }))
button('Ball and stick', () => viewer.setOptions({ renderMode: 'ball-and-stick' }))
for (const [label, key] of [
  ['Cell', 'showLattice'],
  ['Symmetry', 'showSymmetryMates'],
  ['Reciprocal', 'showReciprocalLattice'],
  ['First BZ', 'showBrillouinZone']
] as const)
  button(label, () => viewer.setOptions({ [key]: !viewer.getState().options[key] }))
button('Neighbors', () =>
  viewer.setOptions({
    neighborCells: viewer.getState().options.neighborCells.length ? [] : [[1, 0, 0]]
  })
)
for (const mode of [
  'none',
  'select',
  'pick-point',
  'measure-distance',
  'measure-angle',
  'measure-torsion'
] satisfies InteractionMode[])
  button(mode, () => viewer.setOptions({ interactionMode: mode }))
window.addEventListener('pagehide', () => viewer.dispose(), { once: true })
run(() => viewer.load(demoStructure()))
