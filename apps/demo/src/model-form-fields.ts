import type { Diagnostic } from 'alchemion/core'
import { parseStructure } from 'alchemion/formats'
import { ComputationError } from 'alchemion/viewer'
import { getLocale } from './i18n'

export type Label = readonly [english: string, chinese: string]
const labelText = (label: Label) => label[getLocale() === 'zh' ? 1 : 0]

type Control = { node: HTMLElement; read(): unknown }
export type Field = (context: FormContext, id: string, value: unknown) => Control

export interface FormContext {
  readonly signal: AbortSignal
  changed(): void
}

function translate(node: HTMLElement, label: Label) {
  node.dataset.formEn = label[0]
  node.dataset.formZh = label[1]
  node.textContent = labelText(label)
  return node
}

export function localizeFields(root: HTMLElement) {
  for (const node of root.querySelectorAll<HTMLElement>('[data-form-en]')) {
    node.textContent = getLocale() === 'zh' ? node.dataset.formZh! : node.dataset.formEn!
  }
}

export function asRecord(input: unknown): Readonly<Record<string, unknown>> {
  return input !== null && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {}
}

function error(label: Label, reason: Label) {
  return new Error(labelText(label) + ' · ' + labelText(reason))
}

const required: Label = ['Enter a value', '请输入值']
const invalidNumber: Label = ['Enter a finite number', '请输入有限数值']
const invalidInteger: Label = ['Enter an integer', '请输入整数']

function inputLabel(label: Label, control: HTMLElement, id: string) {
  const node = document.createElement('div')
  node.className = 'model-field'
  const caption = document.createElement('label')
  caption.htmlFor = id
  control.id = id
  node.append(translate(caption, label), control)
  return node
}

function group(label: Label) {
  const node = document.createElement('fieldset')
  node.className = 'model-fieldset'
  node.append(translate(document.createElement('legend'), label))
  return node
}

export function textField(
  label: Label,
  requiredText = false,
  suggestions: readonly string[] = []
): Field {
  return (_context, id, initial) => {
    const input = document.createElement('input')
    input.type = 'text'
    input.required = requiredText
    input.value = typeof initial === 'string' ? initial : ''
    const node = inputLabel(label, input, id)
    if (suggestions.length) {
      const list = document.createElement('datalist')
      list.id = id + '-choices'
      input.setAttribute('list', list.id)
      list.append(...suggestions.map((value) => new Option(value)))
      node.append(list)
    }
    return {
      node,
      read() {
        if (requiredText && !input.value.trim()) throw error(label, required)
        return input.value || (initial === '' ? '' : undefined)
      }
    }
  }
}

export function numberField(
  label: Label,
  { integer = false, optional = false, nullable = false } = {}
): Field {
  return (_context, id, initial) => {
    const input = document.createElement('input')
    input.type = 'number'
    input.required = !optional
    input.step = integer ? '1' : 'any'
    input.value = typeof initial === 'number' && Number.isFinite(initial) ? String(initial) : ''
    const node = inputLabel(label, input, id)
    return {
      node,
      read() {
        if (input.validity.badInput) throw error(label, integer ? invalidInteger : invalidNumber)
        if (input.value === '') {
          if (nullable && initial === null) return null
          if (optional) return undefined
          throw error(label, required)
        }
        const value = input.valueAsNumber
        if (!(integer ? Number.isSafeInteger(value) : Number.isFinite(value)))
          throw error(label, integer ? invalidInteger : invalidNumber)
        return value
      }
    }
  }
}

export type Choices = readonly (readonly [value: string, label: Label])[]
const unspecified: readonly [string, Label] = ['', ['Default', '默认']]

export function choiceField(label: Label, choices: Choices, optional = false): Field {
  return (_context, id, initial) => {
    const select = document.createElement('select')
    for (const [value, caption] of optional ? [unspecified, ...choices] : choices) {
      const option = document.createElement('option')
      option.value = value
      select.append(translate(option, caption))
    }
    if (typeof initial === 'string' && choices.some(([value]) => value === initial))
      select.value = initial
    return { node: inputLabel(label, select, id), read: () => select.value || undefined }
  }
}

export function booleanField(label: Label, optional = false): Field {
  const field = choiceField(
    label,
    [
      ['yes', ['Yes', '是']],
      ['no', ['No', '否']]
    ],
    optional
  )
  return (context, id, initial) => {
    const control = field(context, id, initial === undefined ? undefined : initial ? 'yes' : 'no')
    return {
      node: control.node,
      read() {
        const value = control.read()
        return value === undefined ? undefined : value === 'yes'
      }
    }
  }
}

export function objectFields(fields: Readonly<Record<string, Field>>, label?: Label): Field {
  return (context, id, initial) => {
    const data = asRecord(initial)
    const node = label ? group(label) : document.createElement('div')
    const controls = Object.entries(fields).map(([key, field]) => {
      const control = field(context, id + '-' + key, data[key])
      node.append(control.node)
      return [key, control] as const
    })
    return {
      node,
      read: () =>
        Object.fromEntries(
          controls
            .map(([key, control]) => [key, control.read()])
            .filter(([, value]) => value !== undefined)
        )
    }
  }
}

export function tuple(label: Label, fields: readonly Field[]): Field {
  return (context, id, initial) => {
    const node = group(label)
    const grid = document.createElement('div')
    grid.className = 'model-components'
    const values: readonly unknown[] = Array.isArray(initial) ? initial : []
    const controls = fields.map((field, index) => field(context, id + '-' + index, values[index]))
    grid.append(...controls.map(({ node }) => node))
    node.append(grid)
    return { node, read: () => controls.map(({ read }) => read()) }
  }
}

export function advanced(label: Label, field: Field): Field {
  return (context, id, initial) => {
    const node = document.createElement('details')
    node.className = 'model-advanced'
    const control = field(context, id, initial)
    node.append(translate(document.createElement('summary'), label), control.node)
    return { node, read: control.read }
  }
}

export function optionalGroup(label: Label, field: Field, preset: unknown): Field {
  return (context, id, initial) => {
    const node = document.createElement('div')
    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.checked = initial !== undefined
    const heading = inputLabel(label, checkbox, id + '-enabled')
    heading.classList.add('model-enable')
    const control = field(context, id, initial === undefined ? preset : initial)
    const update = () => {
      control.node.hidden = !checkbox.checked
    }
    checkbox.addEventListener('input', update)
    update()
    node.append(heading, control.node)
    return { node, read: () => (checkbox.checked ? control.read() : undefined) }
  }
}

type Variant = {
  readonly label: Label
  readonly matches: (value: unknown) => boolean
  readonly field: Field
  readonly preset: unknown
}

export function variants(label: Label, definitions: Readonly<Record<string, Variant>>): Field {
  return (context, id, initial) => {
    const node = document.createElement('div')
    const entries = Object.entries(definitions)
    const first = entries.find(([, option]) => option.matches(initial))?.[0] ?? entries[0][0]
    const selection = choiceField(
      label,
      entries.map(([key, option]) => [key, option.label])
    )(context, id + '-mode', first)
    const choices = new Map<string, Control>()
    node.append(selection.node)
    const update = () => {
      const key = selection.read() as string
      if (!choices.has(key)) {
        const option = definitions[key]
        const control = option.field(
          context,
          id,
          key === first && option.matches(initial) ? initial : option.preset
        )
        choices.set(key, control)
        node.append(control.node)
      }
      for (const [name, choice] of choices) {
        if (name !== key) choice.node.remove()
        else if (choice.node.parentElement !== node) {
          localizeFields(choice.node)
          node.append(choice.node)
        }
      }
    }
    selection.node.addEventListener('input', update)
    update()
    return { node, read: () => choices.get(selection.read() as string)!.read() }
  }
}

export function list(label: Label, field: Field, preset: unknown): Field {
  return (context, id, initial) => {
    const node = group(label)
    const rows = document.createElement('div')
    const add = document.createElement('button')
    add.type = 'button'
    add.id = id + '-add'
    translate(add, ['Add row', '添加一行'])
    const items = new Map<HTMLElement, Control>()
    let sequence = 0
    const append = (value: unknown) => {
      const row = document.createElement('div')
      row.className = 'model-row'
      const control = field(context, id + '-' + sequence++, value)
      const remove = document.createElement('button')
      remove.type = 'button'
      translate(remove, ['Remove row', '删除这一行'])
      remove.addEventListener('click', () => {
        row.remove()
        items.delete(row)
        add.focus()
        context.changed()
      })
      row.append(control.node, remove)
      rows.append(row)
      items.set(row, control)
      return control.node
    }
    for (const value of Array.isArray(initial) ? initial : []) append(value)
    add.addEventListener('click', () => {
      append(preset).querySelector<HTMLElement>('input, select, summary, button')?.focus()
      context.changed()
    })
    node.append(rows, add)
    return { node, read: () => [...items.values()].map(({ read }) => read()) }
  }
}

export function mapField(label: Label, field: Field, preset: unknown): Field {
  const rows = list(
    label,
    objectFields({ name: textField(['Name', '名称'], true), value: field }),
    {
      value: preset
    }
  )
  return (context, id, initial) => {
    const control = rows(
      context,
      id,
      Object.entries(asRecord(initial)).map(([name, value]) => ({ name, value }))
    )
    return {
      node: control.node,
      read() {
        const entries = control.read() as { name: string; value: unknown }[]
        if (new Set(entries.map(({ name }) => name)).size !== entries.length)
          throw error(label, ['Names must be unique', '名称必须唯一'])
        return Object.fromEntries(entries.map(({ name, value }) => [name, value]))
      }
    }
  }
}

export function snapshotField(label: Label, kind: 'molecular' | 'periodic'): Field {
  return (context, id, initial) => {
    const file = document.createElement('input')
    file.type = 'file'
    file.accept = kind === 'molecular' ? '.mol' : '.cif,.poscar,.vasp,text/plain'
    const node = inputLabel(label, file, id)
    const status = document.createElement('output')
    status.setAttribute('aria-live', 'polite')
    const caption = document.createElement('span')
    const codes = document.createElement('span')
    status.append(caption, codes)
    const blocks = document.createElement('select')
    const blockLabel = inputLabel(['CIF block', 'CIF 数据块'], blocks, id + '-block')
    blockLabel.hidden = true
    node.append(blockLabel, status)
    let value = initial
    let failure: Label | undefined
    let diagnostics: readonly Diagnostic[] = []
    let generation = 0
    let cifText = ''
    const ready = () =>
      translate(
        caption,
        value === undefined
          ? ['Choose a local structure', '请选择本地结构']
          : ['Structure loaded', '结构已加载']
      )
    const formatFailure = () => {
      failure = [
        'Select a compatible structure and check the format diagnostics',
        '请选择兼容的结构并检查格式诊断'
      ]
      translate(caption, failure)
    }
    const parse = (text: string, format: 'mol' | 'cif' | 'poscar', block?: number) => {
      const parsed = parseStructure(
        text,
        format === 'cif'
          ? { format, block: block === undefined ? undefined : { index: block } }
          : { format }
      )
      diagnostics = parsed.diagnostics
      codes.textContent = diagnostics.length
        ? ' · ' + diagnostics.map(({ code }) => code).join(', ')
        : ''
      if (parsed.candidates?.length && block === undefined) {
        cifText = text
        blocks.replaceChildren(new Option('—', ''))
        for (const candidate of parsed.candidates)
          blocks.add(new Option(candidate.name, String(candidate.index)))
        blockLabel.hidden = false
        failure = ['Choose a CIF block', '请选择 CIF 数据块']
        translate(caption, failure)
      } else if (parsed.structure?.kind !== kind) {
        formatFailure()
      } else {
        failure = undefined
        value = parsed.structure
        ready()
      }
    }
    blocks.addEventListener('input', () => {
      value = undefined
      if (blocks.value) parse(cifText, 'cif', Number(blocks.value))
      else {
        failure = ['Choose a CIF block', '请选择 CIF 数据块']
        translate(caption, failure)
      }
    })
    file.addEventListener('input', () => {
      const selected = file.files?.[0]
      if (!selected) return
      const token = ++generation
      value = undefined
      blockLabel.hidden = true
      blocks.replaceChildren()
      cifText = ''
      diagnostics = []
      codes.textContent = ''
      failure = ['Reading structure…', '正在读取结构…']
      translate(caption, failure)
      const current = () => token === generation && !context.signal.aborted
      void selected
        .text()
        .then((text) => {
          if (!current()) return
          const format =
            kind === 'molecular' ? 'mol' : /\.cif$/i.test(selected.name) ? 'cif' : 'poscar'
          parse(text, format)
          if (node.isConnected) context.changed()
        })
        .catch(() => {
          if (!current()) return
          formatFailure()
          if (node.isConnected) context.changed()
        })
    })
    ready()
    return {
      node,
      read() {
        if (failure && diagnostics.length)
          throw new ComputationError('MODELING_INPUT_FORMAT', labelText(failure), diagnostics)
        if (failure) throw error(label, failure)
        if (asRecord(value).kind !== kind) throw error(label, required)
        return value
      }
    }
  }
}
