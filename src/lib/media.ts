import type { MediaItem } from './thor'
import { normalizeCropRect, type CropRect } from './crop.ts'

export function isMediaFile(file: File): boolean {
  return file.type.startsWith('image/') || file.type.startsWith('video/')
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Image failed to load'))
    image.src = url
  })
}

function waitForEvent(target: EventTarget, event: string, timeout = 15_000): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer = 0
    const done = (fn: () => void) => {
      window.clearTimeout(timer)
      target.removeEventListener(event, onEvent)
      target.removeEventListener('error', onError)
      fn()
    }
    const onEvent = () => done(resolve)
    const onError = () => done(() => reject(new Error('Media failed to load')))
    timer = window.setTimeout(() => done(() => reject(new Error('Media timed out'))), timeout)
    target.addEventListener(event, onEvent, { once: true })
    target.addEventListener('error', onError, { once: true })
  })
}

export function waitForVideoFrame(video: HTMLVideoElement, timeout = 12_000): Promise<boolean> {
  if (video.readyState >= 2 && !video.seeking) return Promise.resolve(true)

  return new Promise((resolve) => {
    const events = ['loadeddata', 'seeked', 'canplay']
    const finish = (ready: boolean) => {
      clearTimeout(timer)
      for (const event of events) video.removeEventListener(event, onReady)
      video.removeEventListener('error', onError)
      resolve(ready)
    }
    const onReady = () => {
      if (video.readyState >= 2 && !video.seeking) finish(true)
    }
    const onError = () => finish(false)
    const timer = setTimeout(() => finish(false), timeout)

    // Restoring the playhead between paired exports triggers a seek,
    // not another loadeddata event.
    for (const event of events) video.addEventListener(event, onReady)
    video.addEventListener('error', onError)
    onReady()
  })
}

function mediaThumb(element: CanvasImageSource, source: CropRect): string {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 208
    canvas.height = 117
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''
    const vw = source.width
    const vh = source.height
    const scale = Math.max(canvas.width / vw, canvas.height / vh)
    const w = vw * scale
    const h = vh * scale
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(element, source.x, source.y, source.width, source.height, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h)
    return canvas.toDataURL('image/jpeg', 0.75)
  } catch {
    return ''
  }
}

export function disposeMedia(item: MediaItem) {
  if (item.type === 'video') {
    const video = item.el as HTMLVideoElement
    video.pause()
    video.removeAttribute('src')
    video.load()
  }
  URL.revokeObjectURL(item.url)
}

/** The decoded element always retains the original source, even after cropping. */
export function getSourceMedia(item: MediaItem): MediaItem {
  const width = item.type === 'video'
    ? (item.el as HTMLVideoElement).videoWidth
    : (item.el as HTMLImageElement).naturalWidth
  const height = item.type === 'video'
    ? (item.el as HTMLVideoElement).videoHeight
    : (item.el as HTMLImageElement).naturalHeight
  return { ...item, width: width || item.width, height: height || item.height, sourceCrop: undefined }
}

export function withSourceCrop(item: MediaItem, value?: CropRect, aspectLocked = true): MediaItem {
  const original = getSourceMedia(item)
  const full = { x: 0, y: 0, width: original.width, height: original.height }
  const rect = value ? normalizeCropRect(value, original.width, original.height) : full
  const sourceCrop = rect.x === 0 && rect.y === 0 && rect.width === full.width && rect.height === full.height ? undefined : rect
  return {
    ...original, sourceCrop, cropAspectLocked: typeof aspectLocked === 'boolean' ? aspectLocked : true,
    width: rect.width, height: rect.height,
    thumbUrl: !sourceCrop && item.type === 'image' ? item.url : mediaThumb(item.el, rect),
  }
}

export async function loadMedia(file: File, id: string = crypto.randomUUID(), sourceCrop?: CropRect, cropAspectLocked = true): Promise<MediaItem> {
  const url = URL.createObjectURL(file)
  const base = {
    file,
    id,
    name: file.name || 'Untitled',
    url,
    width: 0,
    height: 0,
    duration: 0,
    thumbUrl: '',
    animated: false,
  }

  let player: HTMLVideoElement | null = null
  try {
    if (file.type.startsWith('image/')) {
      const image = await loadImage(url)
      return withSourceCrop({
        ...base,
        type: 'image',
        el: image,
        width: image.naturalWidth || image.width || 1,
        height: image.naturalHeight || image.height || 1,
        thumbUrl: url,
        animated: file.type === 'image/gif',
      }, sourceCrop, cropAspectLocked)
    }

    if (file.type.startsWith('video/')) {
      const video = document.createElement('video')
      player = video
      video.src = url
      video.muted = true
      video.loop = true
      video.playsInline = true
      video.preload = 'auto'
      video.crossOrigin = 'anonymous'

      await new Promise<void>((resolve, reject) => {
        let done = false
        const finish = (error?: Error) => {
          if (done) return
          done = true
          window.clearTimeout(timer)
          video.removeEventListener('loadeddata', ok)
          video.removeEventListener('error', fail)
          if (error) reject(error)
          else resolve()
        }
        const ok = () => finish()
        const fail = () => finish(new Error('Video failed to load'))
        const timer = window.setTimeout(() => finish(new Error('Video timed out')), 20_000)
        video.addEventListener('loadeddata', ok, { once: true })
        video.addEventListener('error', fail, { once: true })
      })

      // Best-effort thumbnail from an early frame.
      const seekTo = Math.min(0.12, Math.max(0, (video.duration || 1) / 2))
      try {
        if (seekTo > 0 && video.readyState < 2) {
          video.currentTime = seekTo
          await waitForEvent(video, 'seeked', 5_000)
        }
      } catch {
        /* thumbnail is optional */
      }

      const item: MediaItem = {
        ...base,
        type: 'video',
        el: video,
        width: video.videoWidth || 1,
        height: video.videoHeight || 1,
        duration: Number.isFinite(video.duration) ? video.duration : 0,
        thumbUrl: mediaThumb(video, { x: 0, y: 0, width: video.videoWidth || 16, height: video.videoHeight || 9 }),
      }
      try {
        video.currentTime = 0
      } catch {
        /* ignore */
      }
      return withSourceCrop(item, sourceCrop, cropAspectLocked)
    }

    throw new Error('Unsupported file type')
  } catch (error) {
    if (player) {
      player.pause()
      player.removeAttribute('src')
      player.load()
    }
    URL.revokeObjectURL(url)
    throw error
  }
}
