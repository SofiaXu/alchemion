import { AlchemionEditor } from './editor'
import { CifParser } from './parsers'
import './test.scss'
import Modal from 'bootstrap/js/dist/modal'

const openLatticeSettings = () => {
  const modalElement = document.querySelector('.modal')
  if (!modalElement) return
  const modal = new Modal(modalElement)
  modal.show()
}

const openAtomSettings = () => {
  const modalElement = document.querySelector('.modal')
  if (!modalElement) return
  const modal = new Modal(modalElement)
  modal.show()
}

;(async () => {
  const file = await fetch('/9002807.cif').then((x) => x.text())
  const parser = new CifParser()
  const structure = parser.parse(file)
  const editor = new AlchemionEditor('.editor')
  editor.loadStructure(structure)
  editor.distance.subscribe((distance) => alert(`Distance: ${distance} Å`))
  editor.angle.subscribe((angle) => alert(`Angle: ${angle} °`))
  editor.point.subscribe((point) => alert(`Fraction Point: ${point[0]}, ${point[1]}, ${point[2]}`))
  const toolBox = document.querySelector('.leftPanel')
  const tools: {
    title: string
    direction: 'row' | 'column'
    actions: {
      name: string
      type: 'button' | 'input-text' | 'input-number' | 'text'
      action?: (e: Event) => void
      defaultValue?: string
    }[]
  }[] = [
    {
      title: 'Tool Box',
      direction: 'row',
      actions: [
        { name: '🗑️', type: 'button', action: () => editor.clearStructures() },
        { name: '🆕', type: 'button', action: () => editor.loadStructure(structure) }
      ]
    },
    {
      title: 'Camera Control',
      direction: 'row',
      actions: [
        { name: 'Ⓜ️', type: 'button', action: () => editor.centerStructure() },
        { name: '⬅️', type: 'button', action: () => editor.left() },
        { name: '➡️', type: 'button', action: () => editor.right() },
        { name: '⬆️', type: 'button', action: () => editor.up() },
        { name: '⬇️', type: 'button', action: () => editor.down() },
        { name: '➕', type: 'button', action: () => editor.zoomIn() },
        { name: '➖', type: 'button', action: () => editor.zoomOut() }
      ]
    },
    {
      title: 'Display Settings',
      direction: 'row',
      actions: [
        {
          name: 'Show Lattice',
          type: 'button',
          action: () => (editor.options = { showLattice: !editor.options.showLattice })
        },
        {
          name: 'Show Neighbor Cells',
          type: 'button',
          action: () => (editor.options = { showNeighborCells: !editor.options.showNeighborCells })
        },
        {
          name: 'Show Symmetry Mates',
          type: 'button',
          action: () => (editor.options = { showSymmetryMates: !editor.options.showSymmetryMates })
        },
        {
          name: 'Show Reciprocal Lattice',
          type: 'button',
          action: () =>
            (editor.options = { showReciprocalLattice: !editor.options.showReciprocalLattice })
        }
      ]
    },
    {
      title: 'Click Mode',
      direction: 'row',
      actions: [
        {
          name: 'Select',
          type: 'button',
          action: () => (editor.options = { clickMode: 'select' })
        },
        {
          name: 'Distance',
          type: 'button',
          action: () => (editor.options = { clickMode: 'measure-distance' })
        },
        {
          name: 'Angle',
          type: 'button',
          action: () => (editor.options = { clickMode: 'measure-angle' })
        },
        {
          name: 'Pick Point',
          type: 'button',
          action: () => (editor.options = { clickMode: 'pick-point' })
        },
        {
          name: 'None',
          type: 'button',
          action: () => (editor.options = { clickMode: 'none' })
        }
      ]
    },
    {
      title: 'Camera Settings',
      direction: 'column',
      actions: [
        {
          name: 'Rotate Step',
          type: 'input-number',
          defaultValue: editor.rotateStep.toString(),
          action: (e: Event) => (editor.rotateStep = Number((e.target as HTMLInputElement).value))
        },
        {
          name: 'Zoom Step',
          type: 'input-number',
          defaultValue: editor.zoomStep.toString(),
          action: (e: Event) => (editor.zoomStep = Number((e.target as HTMLInputElement).value))
        }
      ]
    },
    {
      title: 'Latice Settings',
      direction: 'column',
      actions: [
        { name: 'Open Lattice Settings', type: 'button', action: () => openLatticeSettings() }
      ]
    },
    {
      title: 'Atom Settings',
      direction: 'column',
      actions: [{ name: 'Open Atom Settings', type: 'button', action: () => openAtomSettings() }]
    }
  ]
  for (const tool of tools) {
    const div = document.createElement('div')
    const h2 = document.createElement('h2')
    h2.textContent = tool.title
    div.classList.add('row')
    div.appendChild(h2)
    toolBox?.appendChild(div)
    const container = document.createElement('div')
    if (tool.actions.every((x) => x.type === 'button')) {
      container.classList.add('btn-group')
      container.role = 'group'
    }
    toolBox?.appendChild(container)
    for (const action of tool.actions) {
      if (action.type === 'button') {
        const button = document.createElement('button')
        button.textContent = action.name
        button.classList.add('btn')
        button.classList.add('btn-outline-primary')
        if (action.action) button.onclick = action.action
        container.appendChild(button)
      } else if (action.type === 'input-text') {
        const inputBox = document.createElement('div')
        inputBox.classList.add('inputBox')
        const label = document.createElement('label')
        label.textContent = action.name
        const input = document.createElement('input')
        input.value = action.defaultValue || ''
        input.type = 'text'
        if (action.action) input.onchange = action.action
        inputBox.appendChild(label)
        inputBox.appendChild(input)
        container.appendChild(inputBox)
      } else if (action.type === 'input-number') {
        const inputBox = document.createElement('div')
        inputBox.classList.add('inputBox')
        const label = document.createElement('label')
        label.textContent = action.name
        const input = document.createElement('input')
        input.classList.add('form-control')
        input.value = action.defaultValue || '0'
        input.type = 'number'
        if (action.action) input.onchange = action.action
        inputBox.appendChild(label)
        inputBox.appendChild(input)
        container.appendChild(inputBox)
      }
    }
  }
})()
