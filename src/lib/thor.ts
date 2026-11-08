/* ------------------------------------------------------------------ *
 * AYN Thor Wallpaper Studio — shared model + render helpers
 * Top    1920 x 1080  (16:9)
 * Bottom 1240 x 1080  (31:27)
 * All processing happens locally in the browser.
 * ------------------------------------------------------------------ */

import type { CropRect } from './crop.ts'

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

export type LayoutMode = 'physical' | 'continuous'

export interface SpanLayout {
  width: number
  height: number
  regions: Record<ScreenKey, { x: number; y: number; width: number; height: number }>
}

export const DEFAULT_GAP_MM = 16
export const MAX_GAP_MM = 50

// AYN's advertised diagonals. The gap is user-measured, not an official spec.
const topPixelsPerMm = Math.hypot(1920, 1080) / (6 * 25.4)
const bottomPixelsPerMm = Math.hypot(1240, 1080) / (3.92 * 25.4)
const bottomScale = topPixelsPerMm / bottomPixelsPerMm

export function normalizeGapMm(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(MAX_GAP_MM, value)) : DEFAULT_GAP_MM
}

/** One coordinate system for the crop editor, previews, and both export paths. */
export function getSpanLayout(layer: Pick<Layer, 'layout' | 'gapMm'>): SpanLayout {
  if (layer.layout === 'continuous') return SPAN_CANVAS
  const width = SCREENS.bottom.width * bottomScale
  const height = SCREENS.bottom.height * bottomScale
  const y = SCREENS.top.height + normalizeGapMm(layer.gapMm) * topPixelsPerMm
  return {
    width: SCREENS.top.width,
    height: y + height,
    regions: {
      top: SPAN_CANVAS.regions.top,
      bottom: { x: (SCREENS.top.width - width) / 2, y, width, height },
    },
  }
}

/** Rasterize at the denser display's scale so its export doesn't lose source detail. */
export function getExportSceneSize(layout: SpanLayout) {
  const scale = Math.max(...SCREEN_KEYS.map((key) => SCREENS[key].width / layout.regions[key].width))
  return { width: Math.ceil(layout.width * scale), height: Math.ceil(layout.height * scale) }
}

export const MAX_MEDIA = 24

export const FITS = ['cover', 'contain', 'stretch'] as const
export type Fit = (typeof FITS)[number]

export type StillFormat = 'png' | 'jpeg' | 'webp'
export type VideoOutput = 'still' | 'clip'
export type MediaKind = 'image' | 'video'

export interface Framing {
  fit: Fit
  zoom: number
  offsetX: number
  offsetY: number
  rotation: number
  bg: string
  /** Scene-space translation keeping independent zoom centered on its screen. */
  zoomOffsetX?: number
  zoomOffsetY?: number
}

export interface Layer extends Framing {
  layout: LayoutMode
  gapMm: number
  mediaId: string | null
  linked: boolean
  screenFraming: Record<ScreenKey, Framing> | null
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
  sourceCrop?: CropRect
  cropAspectLocked?: boolean
}

export const defaultLayer = (): Layer => ({
  layout: 'physical',
  gapMm: DEFAULT_GAP_MM,
  mediaId: null,
  linked: true,
  screenFraming: null,
  fit: 'cover',
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
  bg: '#000000',
})

/** Linking controls edits only; both screens keep their current scene-space crop. */
export function setScreensLinked(layer: Layer, linked: boolean): Layer {
  if (linked || layer.screenFraming) return { ...layer, linked }
  const { fit, zoom, offsetX, offsetY, rotation, bg } = layer
  const framing = { fit, zoom, offsetX, offsetY, rotation, bg }
  return { ...layer, linked, screenFraming: { top: { ...framing }, bottom: { ...framing } } }
}

export function getScreenFraming(layer: Layer, key: ScreenKey): Framing {
  return layer.screenFraming ? layer.screenFraming[key] : layer
}

export function patchScreenFraming(layer: Layer, patch: Partial<Framing>, key: ScreenKey): Layer {
  if (layer.linked && !layer.screenFraming) return { ...layer, ...patch }
  const initialized = layer.screenFraming ? layer : setScreensLinked(layer, false)
  const origin = getScreenFraming(initialized, key)
  const apply = (screen: ScreenKey): Framing => {
    const current = getScreenFraming(initialized, screen)
    if (screen === key) {
      if (layer.linked || patch.zoom === undefined || patch.zoom === current.zoom) return { ...current, ...patch }
      const layout = getSpanLayout(layer)
      const region = layout.regions[screen]
      const pivotX = (region.x + region.width / 2) / layout.width - 0.5
      const pivotY = (region.y + region.height / 2) / layout.height - 0.5
      const ratio = patch.zoom / current.zoom
      const centerX = current.offsetX + (current.zoomOffsetX ?? 0)
      const centerY = current.offsetY + (current.zoomOffsetY ?? 0)
      return {
        ...current, ...patch,
        zoomOffsetX: pivotX + (centerX - pivotX) * ratio - current.offsetX,
        zoomOffsetY: pivotY + (centerY - pivotY) * ratio - current.offsetY,
      }
    }
    if (!layer.linked) return current
    // Apply the same motion to both crops, retaining any independent adjustment.
    return {
      ...current,
      ...patch,
      zoom: patch.zoom === undefined || current.zoom === origin.zoom
        ? patch.zoom ?? current.zoom
        : clamp(current.zoom * (patch.zoom / origin.zoom), 0.5, 4),
      offsetX: patch.offsetX === undefined || current.offsetX === origin.offsetX
        ? patch.offsetX ?? current.offsetX
        : clamp(current.offsetX + (patch.offsetX - origin.offsetX), -1, 1),
      offsetY: patch.offsetY === undefined || current.offsetY === origin.offsetY
        ? patch.offsetY ?? current.offsetY
        : clamp(current.offsetY + (patch.offsetY - origin.offsetY), -1, 1),
      rotation: patch.rotation === undefined ? current.rotation : (current.rotation + patch.rotation - origin.rotation + 360) % 360,
    }
  }
  return {
    ...initialized,
    ...(layer.linked ? patch : {}),
    screenFraming: { top: apply('top'), bottom: apply('bottom') },
  }
}

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
  layout: SpanLayout = SPAN_CANVAS,
) {
  const region = layout.regions[key]
  const scaleX = scene.width / layout.width
  const scaleY = scene.height / layout.height
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
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
  layer: Framing,
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
  const source = item.sourceCrop ?? { x: 0, y: 0, width: srcW, height: srcH }
  srcW = source.width
  srcH = source.height

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
  ctx.translate(W / 2 + (layer.offsetX + (layer.zoomOffsetX ?? 0)) * W,
    H / 2 + (layer.offsetY + (layer.zoomOffsetY ?? 0)) * H)
  ctx.rotate((rot * Math.PI) / 180)
  ctx.scale(sx, sy)
  ctx.drawImage(item.el, source.x, source.y, srcW, srcH, -srcW / 2, -srcH / 2, srcW, srcH)
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
