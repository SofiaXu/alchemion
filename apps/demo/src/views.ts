import { validateViewState, type ViewerViewState } from 'alchemion/viewer'
import type { Message } from './i18n'

const KEY = 'alchemion.demo.views.v1'
/** Browser persistence belongs to the demo, not to an SDK viewer. */
export class NamedViews {
  readonly slots = new Map<string, ViewerViewState>()
  notice: Message = 'persistentViews'
  private writable = true
  constructor() {
    try {
      const raw = localStorage.getItem(KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (parsed?.version !== 1 || !Array.isArray(parsed.views)) throw new Error('VIEW_STORAGE')
      for (const entry of parsed.views) {
        if (
          typeof entry?.name !== 'string' ||
          !entry.name.trim() ||
          entry.name !== entry.name.trim() ||
          this.slots.has(entry.name) ||
          entry.view?.version !== 1 ||
          !entry.view.camera ||
          !entry.view.options
        )
          throw new Error('VIEW_STORAGE')
        try {
          this.slots.set(entry.name, validateViewState(entry.view))
        } catch {
          throw new Error('VIEW_STORAGE')
        }
      }
    } catch (error) {
      this.slots.clear()
      this.writable = false
      this.notice =
        error instanceof SyntaxError || (error instanceof Error && error.message === 'VIEW_STORAGE')
          ? 'damagedViews'
          : 'sessionViews'
    }
  }
  persist() {
    if (!this.writable) return
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({
          version: 1,
          views: [...this.slots].map(([name, view]) => ({ name, view }))
        })
      )
    } catch {
      this.writable = false
      this.notice = 'sessionViews'
    }
  }
}
