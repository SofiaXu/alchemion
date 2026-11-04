import type { ScreenRectangle } from '../internal-contracts'

/** Text positions are computed by the same projection used for screen labels. */
export interface CaptureText {
  readonly text: string
  readonly color: string
  readonly x: number
  readonly y: number
  readonly scale: number
  readonly clip: ScreenRectangle
  readonly title?: boolean
  readonly swatch?: readonly [string, string]
}

function aborted(): DOMException {
  return new DOMException('The image export was cancelled or superseded.', 'AbortError')
}

/** The buffer is WebGL's bottom-up, premultiplied RGBA representation. */
export async function encodePng(
  pixels: Uint8Array,
  width: number,
  height: number,
  transparent: boolean,
  texts: readonly CaptureText[],
  signal: AbortSignal
): Promise<Blob> {
  if (signal.aborted) throw aborted()
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  try {
    const context = canvas.getContext('2d')
    if (!context) throw new Error('PNG_CANVAS_UNAVAILABLE: A 2D canvas is required for PNG export.')
    const image = context.createImageData(width, height)
    for (let y = 0; y < height; y++) {
      const source = (height - 1 - y) * width * 4
      const destination = y * width * 4
      image.data.set(pixels.subarray(source, source + width * 4), destination)
      if (transparent)
        for (let x = 0; x < width; x++) {
          const index = destination + x * 4
          const alpha = image.data[index + 3]
          if (alpha === 255) continue
          for (let channel = 0; channel < 3; channel++)
            image.data[index + channel] = alpha
              ? Math.round((image.data[index + channel] * 255) / alpha)
              : 0
        }
    }
    context.putImageData(image, 0, 0)
    for (const item of texts) {
      const scale = item.scale
      context.save()
      context.beginPath()
      context.rect(item.clip.x, item.clip.y, item.clip.width, item.clip.height)
      context.clip()
      context.font = `${(item.title ? 11 : 12) * scale}px system-ui, sans-serif`
      context.textBaseline = 'middle'
      const paddingX = (item.title ? 6 : 4) * scale
      const paddingY = (item.title ? 4 : 2) * scale
      const height = (item.title ? 11 : 12) * scale + paddingY * 2
      const width = item.title
        ? item.clip.width
        : context.measureText(item.text).width + paddingX * 2
      const left = item.title ? item.x : item.x - width / 2
      const top = item.title ? item.y : item.y - height / 2
      context.fillStyle = item.title ? '#eef1faed' : '#ffffffdf'
      context.fillRect(left, top, width, height)
      if (item.title) {
        context.fillStyle = '#c6cddd'
        context.fillRect(left, top, width, scale)
      }
      context.fillStyle = item.color
      if (item.swatch) {
        const ramp = context.createLinearGradient(left, top, left + 14 * scale, top)
        ramp.addColorStop(0, item.swatch[0])
        ramp.addColorStop(1, item.swatch[1])
        context.fillStyle = ramp
        context.fillRect(left, top, 14 * scale, height)
        context.fillStyle = item.color
      }
      context.fillText(
        item.text,
        left + paddingX + (item.swatch ? 14 * scale : 0),
        top + height / 2
      )
      context.restore()
    }
    if (signal.aborted) throw aborted()
    return await new Promise<Blob>((resolve, reject) => {
      let settled = false
      const finish = (blob?: Blob | null, error?: unknown) => {
        if (settled) return
        settled = true
        signal.removeEventListener('abort', cancel)
        if (error) reject(error)
        else if (blob) resolve(blob)
        else reject(new Error('PNG_ENCODING_FAILED: The browser could not encode the PNG.'))
      }
      const cancel = () => finish(undefined, aborted())
      signal.addEventListener('abort', cancel, { once: true })
      if (signal.aborted) {
        cancel()
        return
      }
      try {
        canvas.toBlob((blob) => finish(blob), 'image/png')
      } catch (error) {
        finish(undefined, error)
      }
    })
  } finally {
    canvas.width = 0
    canvas.height = 0
  }
}
