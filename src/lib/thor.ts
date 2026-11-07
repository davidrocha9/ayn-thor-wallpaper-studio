/* ------------------------------------------------------------------ *
 * AYN Thor Wallpaper Studio — shared model + render helpers
 * Top    1920 x 1080  (16:9)
 * Bottom 1240 x 1080  (31:27)
 * All processing happens locally in the browser.
 * ------------------------------------------------------------------ */

export const SCREENS = {
  top: { key: 'top', label: 'Top', width: 1920, height: 1080, ratio: '16:9' },
  bottom: { key: 'bottom', label: 'Bottom', width: 1240, height: 1080, ratio: '31:27' },
} as const

export type ScreenKey = keyof typeof SCREENS

export const SCREEN_KEYS: ScreenKey[] = ['top', 'bottom']

/* ------------------------------------------------------------------ *
 * Span mode: one shared layout across both screens, split on export.
 * The bottom screen sits centered under the top, like the hardware:
 * combined canvas is 1920 x 2160, bottom region starts at x = 340.
 * ------------------------------------------------------------------ */

export const SPAN_CANVAS = {
  width: 1920,
  height: 2160,
  regions: {
    top: { x: 0, y: 0, width: 1920, height: 1080 },
    bottom: { x: 340, y: 1080, width: 1240, height: 1080 },
  },
} as const

export const MAX_MEDIA = 24

export const FITS = ['cover', 'contain', 'stretch'] as const
export type Fit = (typeof FITS)[number]

export type StillFormat = 'png' | 'jpeg' | 'webp'
export type VideoOutput = 'still' | 'clip'
export type MediaKind = 'image' | 'video'

export interface Layer {
  mediaId: string | null
  fit: Fit
  zoom: number
  offsetX: number
  offsetY: number
  rotation: number
  bg: string
}

export interface MediaItem {
  file: File
  id: string
  name: string
  url: string
  type: MediaKind
  el: HTMLImageElement | HTMLVideoElement
  width: number
  height: number
  duration: number
  thumbUrl: string
  animated: boolean
}

export const defaultLayer = (): Layer => ({
  mediaId: null,
  fit: 'cover',
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
  bg: '#000000',
})

export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value))

export function getMediaFrom(list: MediaItem[], id: string | null): MediaItem | null {
  if (!id) return null
  return list.find((item) => item.id === id) ?? null
}

export function formatTime(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0
  const minutes = Math.floor(safe / 60)
  const secs = Math.floor(safe % 60)
  return `${minutes}:${String(secs).padStart(2, '0')}`
}

/* ------------------------------------------------------------------ *
 * Canvas rendering
 * ------------------------------------------------------------------ */

/** Crop the same shared scene for a preview or a native-resolution export. */
export function drawSpanRegion(
  ctx: CanvasRenderingContext2D,
  scene: HTMLCanvasElement,
  key: ScreenKey,
) {
  const region = SPAN_CANVAS.regions[key]
  const scaleX = scene.width / SPAN_CANVAS.width
  const scaleY = scene.height / SPAN_CANVAS.height
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.drawImage(
    scene,
    region.x * scaleX,
    region.y * scaleY,
    region.width * scaleX,
    region.height * scaleY,
    0,
    0,
    ctx.canvas.width,
    ctx.canvas.height,
  )
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  item: MediaItem | null,
) {
  const W = ctx.canvas.width
  const H = ctx.canvas.height

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = 1
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.fillStyle = layer.bg || '#000000'
  ctx.fillRect(0, 0, W, H)

  if (!item) return

  let srcW = 0
  let srcH = 0
  if (item.type === 'video') {
    const video = item.el as HTMLVideoElement
    if (video.readyState < 2) return
    srcW = video.videoWidth
    srcH = video.videoHeight
  } else {
    const img = item.el as HTMLImageElement
    srcW = img.naturalWidth || img.width
    srcH = img.naturalHeight || img.height
  }
  if (!srcW || !srcH) return

  const rot = ((layer.rotation % 360) + 360) % 360
  const swap = rot === 90 || rot === 270

  let sx: number
  let sy: number

  if (layer.fit === 'stretch') {
    // Axes are inverted after a 90/270 rotation.
    if (swap) {
      sx = H / srcW
      sy = W / srcH
    } else {
      sx = W / srcW
      sy = H / srcH
    }
  } else {
    const boxW = swap ? srcH : srcW
    const boxH = swap ? srcW : srcH
    const scale =
      layer.fit === 'contain'
        ? Math.min(W / boxW, H / boxH)
        : Math.max(W / boxW, H / boxH)
    sx = scale
    sy = scale
  }

  sx *= layer.zoom
  sy *= layer.zoom

  ctx.save()
  ctx.translate(W / 2 + layer.offsetX * W, H / 2 + layer.offsetY * H)
  ctx.rotate((rot * Math.PI) / 180)
  ctx.scale(sx, sy)
  ctx.drawImage(item.el, -srcW / 2, -srcH / 2, srcW, srcH)
  ctx.restore()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
}

/* ------------------------------------------------------------------ *
 * Capabilities + export MIME handling
 * ------------------------------------------------------------------ */

export const caps = {
  clip:
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function',
  webp: (() => {
    try {
      const canvas = document.createElement('canvas')
      canvas.width = 1
      canvas.height = 1
      return canvas.toDataURL('image/webp').startsWith('data:image/webp')
    } catch {
      return false
    }
  })(),
}

const VIDEO_MIMES = [
  'video/mp4;codecs=avc1.42E01E',
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
]

export function pickVideoMime(): string | null {
  if (!caps.clip || typeof MediaRecorder === 'undefined') return null
  for (const mime of VIDEO_MIMES) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime
    } catch {
      /* ignore */
    }
  }
  return ''
}

export function videoLabel(): string {
  if (!caps.clip) return 'n/a'
  const mime = pickVideoMime()
  if (mime === null) return 'n/a'
  return mime.includes('mp4') ? 'MP4' : 'WebM'
}

export function stillFormatInfo(format: StillFormat) {
  if (format === 'jpeg') return { mime: 'image/jpeg', ext: 'jpg' }
  if (format === 'webp') return { mime: 'image/webp', ext: 'webp' }
  return { mime: 'image/png', ext: 'png' }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
