interface PointerActions {
  readonly active: () => boolean
  readonly rotate: (azimuth: number, elevation: number) => void
  readonly zoom: (factor: number) => void
  readonly click: (x: number, y: number) => void
  readonly error: (error: Error) => void
}

/** Owns only its canvas listeners and capture; a drag never also becomes a click. */
export function attachPointerInteraction(
  canvas: HTMLCanvasElement,
  actions: PointerActions
): () => void {
  let pointer:
    | { id: number; startX: number; startY: number; x: number; y: number; dragging: boolean }
    | undefined
  let disposed = false
  const previousTouchAction = canvas.style.touchAction
  canvas.style.touchAction = 'none'
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
      dragging: false
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
    if (pointer.dragging) safely(() => actions.rotate(-dx * 0.35, -dy * 0.35))
    event.preventDefault()
  }
  function release() {
    if (pointer && canvas.hasPointerCapture(pointer.id)) canvas.releasePointerCapture(pointer.id)
    pointer = undefined
  }
  function up(event: PointerEvent) {
    if (!pointer || pointer.id !== event.pointerId) return
    const click = !pointer.dragging && actions.active()
    release()
    if (click) {
      const rect = canvas.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top
      if (x >= 0 && y >= 0 && x <= rect.width && y <= rect.height) safely(() => actions.click(x, y))
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
  return () => {
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
