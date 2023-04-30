import { IDisposable } from './disposable'

export interface IDelegram<T, R> {
  addListener(listener: (e: T) => R): IDisposable
  removeListener(listener: (e: T) => R): void
  clearListeners(): void
  invoke(e: T): ReadonlyArray<R>
}

export class Delegram<T, R> implements IDelegram<T, R> {
  private listeners: Array<(e: T) => R> = []
  addListener(listener: (e: T) => R): IDisposable {
    this.listeners.push(listener)
    return {
      dispose: () => {
        this.removeListener(listener)
      }
    }
  }
  removeListener(listener: (e: T) => R): void {
    this.listeners = this.listeners.filter((x) => x !== listener)
  }
  clearListeners(): void {
    this.listeners = []
  }
  invoke(e: T): ReadonlyArray<R> {
    return this.listeners.map((x) => x(e))
  }
}

export type IEvent<T> = IDelegram<T, void>

export class AlchemionEvent<T> extends Delegram<T, void> implements IEvent<T> {}
