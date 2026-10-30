import type { PointerModifiers, ScreenRectangle } from '../internal-contracts'

interface PointerActions {
  readonly active: () => boolean
  readonly boxSelecting: () => boolean
  readonly rotate: (azimuth: number, elevation: number) => void
  readonly zoom: (factor: number) => void
  readonly click: (x: number, y: number, modifiers: PointerModifiers) => void
  readonly boxSelect: (rectangle: ScreenRectangle, modifiers: PointerModifiers) => void
  readonly error: (error: Error) => void
}

/** Owns only its canvas listeners and capture; a drag never also becomes a click. */
export function attachPointerInteraction(
  canvas: HTMLCanvasElement,
  actions: PointerActions
): { readonly clear: () => void; readonly dispose: () => void } {
  let pointer:
    | {
        id: number
        startX: number
        startY: number
        x: number
        y: number
        dragging: boolean
        boxSelecting: boolean
      }
    | undefined
  let rectangle: HTMLDivElement | undefined
  let disposed = false
  const previousTouchAction = canvas.style.touchAction
  canvas.style.touchAction = 'none'
  const modifiers = (event: PointerEvent): PointerModifiers => ({
    shiftKey: event.shiftKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    altKey: event.altKey
  })
  function bounds(startX: number, startY: number, endX: number, endY: number): ScreenRectangle {
    const rect = canvas.getBoundingClientRect()
    const left = Math.max(0, Math.min(rect.width, Math.min(startX, endX) - rect.left))
    const top = Math.max(0, Math.min(rect.height, Math.min(startY, endY) - rect.top))
    const right = Math.max(0, Math.min(rect.width, Math.max(startX, endX) - rect.left))
    const bottom = Math.max(0, Math.min(rect.height, Math.max(startY, endY) - rect.top))
    return { x: left, y: top, width: right - left, height: bottom - top }
  }
  function showRectangle() {
    if (!pointer) return
    if (!rectangle) {
      rectangle = document.createElement('div')
      rectangle.dataset.alchemionSelectionBox = ''
      rectangle.style.cssText =
        'position:absolute;pointer-events:none;border:1px solid #d59b0e;background:#efb83d22;box-sizing:border-box;z-index:1'
      canvas.parentElement?.appendChild(rectangle)
    }
    const box = bounds(pointer.startX, pointer.startY, pointer.x, pointer.y)
    Object.assign(rectangle.style, {
      left: `${canvas.offsetLeft + box.x}px`,
      top: `${canvas.offsetTop + box.y}px`,
      width: `${box.width}px`,
      height: `${box.height}px`
    })
  }
  function safely(action: () => void) {
    try {
      action()
    } catch (error) {
      actions.error(error instanceof Error ? error : new Error(String(error)))
    }
  }
  function down(event: PointerEvent) {
    if (disposed || !actions.active() || pointer || event.button !== 0 || !event.isPrimary) return
    pointer = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      dragging: false,
      boxSelecting: actions.boxSelecting()
    }
    canvas.setPointerCapture(event.pointerId)
    event.preventDefault()
  }
  function move(event: PointerEvent) {
    if (!pointer || pointer.id !== event.pointerId || !actions.active()) return
    const dx = event.clientX - pointer.x
    const dy = event.clientY - pointer.y
    pointer.x = event.clientX
    pointer.y = event.clientY
    pointer.dragging ||=
      Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) > 4
    if (pointer.dragging) {
      if (pointer.boxSelecting) showRectangle()
      else safely(() => actions.rotate(-dx * 0.35, -dy * 0.35))
    }
    event.preventDefault()
  }
  function release() {
    const previous = pointer
    pointer = undefined
    rectangle?.remove()
    rectangle = undefined
    if (previous && canvas.hasPointerCapture(previous.id)) canvas.releasePointerCapture(previous.id)
  }
  function up(event: PointerEvent) {
    if (!pointer || pointer.id !== event.pointerId) return
    const previous = pointer
    const click = !previous.dragging && actions.active()
    const box =
      previous.dragging && previous.boxSelecting && actions.active()
        ? bounds(previous.startX, previous.startY, event.clientX, event.clientY)
        : undefined
    release()
    if (box) safely(() => actions.boxSelect(box, modifiers(event)))
    if (click) {
      const rect = canvas.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top
      if (x >= 0 && y >= 0 && x <= rect.width && y <= rect.height)
        safely(() => actions.click(x, y, modifiers(event)))
    }
  }
  function cancel(event: PointerEvent) {
    if (pointer?.id === event.pointerId) release()
  }
  function wheel(event: WheelEvent) {
    if (!actions.active()) return
    const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1
    const delta = Math.max(-600, Math.min(600, event.deltaY * units))
    safely(() => actions.zoom(Math.exp(delta * 0.001)))
    event.preventDefault()
  }
  canvas.addEventListener('pointerdown', down)
  canvas.addEventListener('pointermove', move)
  canvas.addEventListener('pointerup', up)
  canvas.addEventListener('pointercancel', cancel)
  canvas.addEventListener('lostpointercapture', cancel)
  canvas.addEventListener('wheel', wheel, { passive: false })
  return {
    clear: release,
    dispose() {
      if (disposed) return
      disposed = true
      release()
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', cancel)
      canvas.removeEventListener('lostpointercapture', cancel)
      canvas.removeEventListener('wheel', wheel)
      canvas.style.touchAction = previousTouchAction
    }
  }
}
