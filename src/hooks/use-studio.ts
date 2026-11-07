import { useEffect, useMemo, useRef, useState, type ChangeEvent, type RefObject } from 'react'
import { toast } from 'sonner'

import { useLocalWorkspace, type StorageStatus } from '@/hooks/use-local-workspace'
import { disposeMedia, isMediaFile, loadMedia, waitForVideoFrame } from '@/lib/media'
import { DEFAULT_DEVICE_COLOR, type DeviceColor } from '@/lib/device-colors'
import { createPreviewCrossfade } from '@/lib/preview-crossfade'
import {
  MAX_MEDIA,
  SCREENS,
  SCREEN_KEYS,
  SPAN_CANVAS,
  caps,
  clamp,
  defaultLayer,
  downloadBlob,
  drawScene,
  drawSpanRegion,
  getMediaFrom,
  pickVideoMime,
  stillFormatInfo,
  type Layer,
  type MediaItem,
  type ScreenKey,
  type StillFormat,
  type VideoOutput,
} from '@/lib/thor'

const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

export interface ProgressState {
  open: boolean
  key: ScreenKey
  pct: number
}

export interface TransportState {
  current: number
  duration: number
  paused: boolean
}

export interface Studio {
  deviceColor: DeviceColor
  setDeviceColor: (color: DeviceColor) => void
  layer: Layer
  media: MediaItem[]
  video: HTMLVideoElement | null
  hasMedia: boolean
  isRestoring: boolean
  importing: boolean
  storageStatus: StorageStatus

  stillFormat: StillFormat
  quality: number
  videoOutput: VideoOutput
  clipDuration: number
  clipFps: number
  loop: boolean
  exporting: boolean
  dragging: boolean
  progress: ProgressState
  transport: TransportState
  caps: typeof caps

  updateFraming: (patch: Partial<Layer>) => void
  resetFraming: () => void
  openPicker: () => void
  onFileInputChange: (event: ChangeEvent<HTMLInputElement>) => void
  applyMedia: (id: string) => void
  removeMedia: (id: string) => void
  clearMedia: () => void

  setStillFormat: (format: StillFormat) => void
  setQuality: (quality: number) => void
  setVideoOutput: (output: VideoOutput) => void
  setClipDuration: (seconds: number) => void
  setClipFps: (fps: number) => void
  setLoop: (loop: boolean) => void

  togglePlayback: () => void
  seekTo: (value: number) => void
  cancelExport: () => void
  exportBoth: () => void

  canvasRefs: Record<ScreenKey, RefObject<HTMLCanvasElement | null>>
  fileInputRef: RefObject<HTMLInputElement | null>
}

export function useStudio(): Studio {
  const [deviceColor, setDeviceColor] = useState<DeviceColor>(DEFAULT_DEVICE_COLOR)
  const [layer, setLayer] = useState<Layer>(() => defaultLayer())
  const [media, setMedia] = useState<MediaItem[]>([])
  const [stillFormat, setStillFormatState] = useState<StillFormat>('png')
  const [quality, setQualityState] = useState(0.92)
  const [videoOutput, setVideoOutputState] = useState<VideoOutput>('still')
  const [clipDuration, setClipDurationState] = useState(6)
  const [clipFps, setClipFpsState] = useState(30)
  const [loop, setLoopState] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState<ProgressState>({ open: false, key: 'top', pct: 0 })
  const [transport, setTransport] = useState<TransportState>({
    current: 0,
    duration: 0,
    paused: true,
  })

  const mediaRef = useRef(media)
  const layerRef = useRef(layer)
  const loopRef = useRef(loop)
  const stillFormatRef = useRef(stillFormat)
  const qualityRef = useRef(quality)
  const videoOutputRef = useRef(videoOutput)
  const clipFpsRef = useRef(clipFps)
  const clipDurationRef = useRef(clipDuration)

  const importingRef = useRef(false)
  const restoringRef = useRef(true)
  const aliveRef = useRef(true)
  const exportingRef = useRef(false)
  const cancelRef = useRef(false)
  const dirtyRef = useRef(true)
  const transportKeyRef = useRef('')
  const lastPctRef = useRef(-1)

  const canvasRefs = {
    top: useRef<HTMLCanvasElement | null>(null),
    bottom: useRef<HTMLCanvasElement | null>(null),
  }
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const getMedia = (id: string | null) => getMediaFrom(mediaRef.current, id)

  const commitMedia = (next: MediaItem[]) => {
    mediaRef.current = next
    setMedia(next)
    dirtyRef.current = true
  }

  const commitLayer = (next: Layer) => {
    layerRef.current = next
    setLayer(next)
    dirtyRef.current = true
  }

  const wallpaper = getMediaFrom(media, layer.mediaId)
  const video = wallpaper?.type === 'video' ? (wallpaper.el as HTMLVideoElement) : null
  const hasMedia = !!wallpaper

  /* ---------------------------------------------------------------- *
   * Shared framing
   * ---------------------------------------------------------------- */

  const updateFraming = (patch: Partial<Layer>) => {
    commitLayer({ ...layerRef.current, ...patch })
  }

  const resetFraming = () => {
    updateFraming({ fit: 'cover', zoom: 1, offsetX: 0, offsetY: 0, rotation: 0 })
  }

  /* ---------------------------------------------------------------- *
   * Media library
   * ---------------------------------------------------------------- */

  const applyMedia = (id: string) => {
    const item = getMedia(id)
    if (!item) return

    commitLayer({ ...layerRef.current, mediaId: id })
    for (const entry of mediaRef.current) {
      if (entry.type !== 'video') continue
      const player = entry.el as HTMLVideoElement
      if (entry.id === id) {
        player.muted = true
        player.loop = loopRef.current
        void player.play().catch(() => {})
      } else {
        player.pause()
      }
    }
  }

  const handleFiles = async (fileList: FileList | File[]) => {
    if (restoringRef.current || importingRef.current) {
      toast(restoringRef.current ? 'Restoring your saved library…' : 'An import is already in progress.')
      return
    }
    const files = Array.from(fileList).filter(isMediaFile)
    if (!files.length) {
      toast('Images and videos only.')
      return
    }
    if (mediaRef.current.length >= MAX_MEDIA) {
      toast(`Library is full (${MAX_MEDIA} files). Remove one first.`)
      return
    }

    const room = MAX_MEDIA - mediaRef.current.length
    const batch = files.slice(0, room)
    if (batch.length < files.length) toast(`Library limit is ${MAX_MEDIA} files.`)

    importingRef.current = true
    setImporting(true)
    const loaded: MediaItem[] = []
    try {
      for (const file of batch) {
        if (!aliveRef.current) break
        try {
          loaded.push(await loadMedia(file))
        } catch (error) {
          console.error(error)
          if (aliveRef.current) toast(`Could not load ${file.name}`)
        }
      }
      if (!aliveRef.current) {
        loaded.forEach(disposeMedia)
        return
      }
      if (!loaded.length) return
      commitMedia([...mediaRef.current, ...loaded])
      applyMedia(loaded[0].id)
      toast(loaded.length === 1 ? `Loaded ${loaded[0].name}` : `Added ${loaded.length} files`)
    } finally {
      importingRef.current = false
      if (aliveRef.current) setImporting(false)
    }
  }

  const removeMedia = (id: string) => {
    const item = getMedia(id)
    if (!item) return

    if (layerRef.current.mediaId === id) {
      commitLayer({ ...layerRef.current, mediaId: null })
    }

    disposeMedia(item)
    commitMedia(mediaRef.current.filter((entry) => entry.id !== id))
    toast('Removed from library')
  }

  const clearMedia = () => {
    if (!mediaRef.current.length) return
    mediaRef.current.forEach(disposeMedia)
    commitMedia([])
    commitLayer({ ...layerRef.current, mediaId: null })
    toast('Library cleared')
  }

  /* ---------------------------------------------------------------- *
   * Picker + drag & drop
   * ---------------------------------------------------------------- */

  const openPicker = () => {
    fileInputRef.current?.click()
  }

  const onFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    // Snapshot the files before resetting the input — clearing `.value`
    // empties the live FileList reference.
    const files = event.target.files ? Array.from(event.target.files) : []
    event.target.value = ''
    if (files.length) void handleFiles(files)
  }

  const handlerRef = useRef({ handleFiles })
  handlerRef.current = { handleFiles }

  useEffect(() => {
    let depth = 0
    const hasFiles = (event: DragEvent) =>
      Array.from(event.dataTransfer?.types ?? []).includes('Files')

    const onDragEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      depth += 1
      setDragging(true)
    }
    const onDragOver = (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    }
    const onDragLeave = () => {
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const onDragEnd = () => {
      depth = 0
      setDragging(false)
    }
    const onDrop = (event: DragEvent) => {
      event.preventDefault()
      depth = 0
      setDragging(false)
      if (event.dataTransfer?.files?.length) {
        void handlerRef.current.handleFiles(event.dataTransfer.files)
      }
    }

    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('dragend', onDragEnd)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('dragend', onDragEnd)
      window.removeEventListener('drop', onDrop)
    }
  }, [])

  /* ---------------------------------------------------------------- *
   * Playback
   * ---------------------------------------------------------------- */

  const getVideo = () => {
    const item = getMedia(layerRef.current.mediaId)
    return item?.type === 'video' ? (item.el as HTMLVideoElement) : null
  }

  const togglePlayback = () => {
    const player = getVideo()
    if (!player) return
    if (!player.paused && !player.ended) {
      player.pause()
    } else {
      player.loop = loopRef.current
      void player.play().catch(() => {})
    }
    dirtyRef.current = true
  }

  const seekTo = (value: number) => {
    const player = getVideo()
    if (!player || !Number.isFinite(player.duration) || player.duration <= 0) return
    try {
      player.currentTime = clamp(value / 1000, 0, 1) * player.duration
    } catch {
      /* ignore */
    }
    dirtyRef.current = true
  }

  const setLoop = (nextLoop: boolean) => {
    loopRef.current = nextLoop
    setLoopState(nextLoop)
    for (const item of mediaRef.current) {
      if (item.type === 'video') (item.el as HTMLVideoElement).loop = nextLoop
    }
    dirtyRef.current = true
  }

  /* ---------------------------------------------------------------- *
   * Settings
   * ---------------------------------------------------------------- */

  const setStillFormat = (format: StillFormat) => {
    if (format === 'webp' && !caps.webp) {
      toast('WebP export is not supported in this browser.')
      return
    }
    stillFormatRef.current = format
    setStillFormatState(format)
  }

  const setQuality = (nextQuality: number) => {
    qualityRef.current = nextQuality
    setQualityState(nextQuality)
  }

  const setVideoOutput = (output: VideoOutput) => {
    if (output === 'clip' && !caps.clip) {
      toast('Video recording is not supported in this browser.')
      return
    }
    videoOutputRef.current = output
    setVideoOutputState(output)
  }

  const setClipDuration = (seconds: number) => {
    clipDurationRef.current = seconds
    setClipDurationState(seconds)
  }

  const setClipFps = (fps: number) => {
    clipFpsRef.current = fps
    setClipFpsState(fps)
  }

  const workspaceSettings = useMemo(() => ({
    deviceColor, layer, stillFormat, quality, videoOutput, clipDuration, clipFps, loop,
  }), [deviceColor, layer, stillFormat, quality, videoOutput, clipDuration, clipFps, loop])

  const { isRestoring, storageStatus } = useLocalWorkspace({
    media,
    settings: workspaceSettings,
    onRestore: (restoredMedia, settings) => {
      setDeviceColor(settings.deviceColor)
      commitMedia(restoredMedia)
      const requested = settings.layer.mediaId
      const mediaId = restoredMedia.some((item) => item.id === requested)
        ? requested
        : requested ? restoredMedia[0]?.id ?? null : null
      commitLayer({ ...settings.layer, mediaId })
      setStillFormat(settings.stillFormat === 'webp' && !caps.webp ? 'png' : settings.stillFormat)
      setQuality(settings.quality)
      setVideoOutput(settings.videoOutput === 'clip' && !caps.clip ? 'still' : settings.videoOutput)
      setClipDuration(settings.clipDuration)
      setClipFps(settings.clipFps)
      setLoop(settings.loop)
      if (mediaId) applyMedia(mediaId)
    },
  })
  restoringRef.current = isRestoring

  /* ---------------------------------------------------------------- *
   * Export
   * ---------------------------------------------------------------- */

  const wantsClip = () => {
    const item = getMedia(layerRef.current.mediaId)
    return !!(
      item &&
      item.type === 'video' &&
      videoOutputRef.current === 'clip' &&
      caps.clip
    )
  }

  const ensureFrameReady = async (item: MediaItem | null) => {
    if (!item) return false
    if (item.type === 'video') {
      return waitForVideoFrame(item.el as HTMLVideoElement)
    }

    const image = item.el as HTMLImageElement
    if (image.complete && (image.naturalWidth || image.width)) return true
    try {
      await new Promise<void>((resolve, reject) => {
        if (image.complete) {
          resolve()
          return
        }
        image.addEventListener('load', () => resolve(), { once: true })
        image.addEventListener('error', () => reject(new Error('error')), { once: true })
      })
      return true
    } catch {
      return false
    }
  }

  const exportStill = async (key: ScreenKey) => {
    const item = getMedia(layerRef.current.mediaId)
    if (!item) {
      toast('Nothing to export yet.')
      return false
    }
    const ready = await ensureFrameReady(item)
    if (!ready) {
      toast('That file is not ready to render yet.')
      return false
    }

    const region = SPAN_CANVAS.regions[key]
    const scene = document.createElement('canvas')
    scene.width = SPAN_CANVAS.width
    scene.height = SPAN_CANVAS.height
    const sceneCtx = scene.getContext('2d', { alpha: false })
    if (!sceneCtx) return false
    drawScene(sceneCtx, layerRef.current, item)

    const canvas = document.createElement('canvas')
    canvas.width = region.width
    canvas.height = region.height
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return false
    drawSpanRegion(ctx, scene, key)

    const { mime, ext } = stillFormatInfo(stillFormatRef.current)
    let blob: Blob | null = null
    try {
      blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, mime, qualityRef.current),
      )
    } catch {
      blob = null
    }
    if (!blob) {
      toast('Could not render that frame.')
      return false
    }
    downloadBlob(blob, `ayn-thor-${key}-${region.width}x${region.height}.${ext}`)
    return true
  }

  const lastPct = (pct: number) => {
    if (pct === lastPctRef.current) return
    lastPctRef.current = pct
    setProgress((current) => ({ ...current, pct }))
  }

  const exportClip = async (key: ScreenKey) => {
    if (!caps.clip) {
      toast('Video recording is not supported in this browser.')
      return exportStill(key)
    }

    const item = getMedia(layerRef.current.mediaId)
    if (!item || item.type !== 'video') return exportStill(key)

    const def = SCREENS[key]
    const video = item.el as HTMLVideoElement
    const fps = clipFpsRef.current
    const duration = clipDurationRef.current

    const canvas = document.createElement('canvas')
    canvas.width = def.width
    canvas.height = def.height
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return false

    const scene = document.createElement('canvas')
    scene.width = SPAN_CANVAS.width
    scene.height = SPAN_CANVAS.height
    const sceneCtx = scene.getContext('2d', { alpha: false })
    if (!sceneCtx) return false

    const paintFrame = () => {
      drawScene(sceneCtx, layerRef.current, item)
      drawSpanRegion(ctx, scene, key)
    }

    const ready = await ensureFrameReady(item)
    if (!ready) {
      toast('That video is not ready to record yet.')
      return false
    }

    const wasPaused = video.paused
    const wasLoop = video.loop
    const startTime = Number.isFinite(video.currentTime) ? video.currentTime : 0

    let stream: MediaStream | null = null
    let recorder: MediaRecorder | null = null
    const chunks: Blob[] = []
    let stopped: Promise<void> | null = null

    const restorePlayer = () => {
      try {
        video.loop = wasLoop
      } catch {
        /* ignore */
      }
      if (wasPaused) {
        try {
          video.pause()
        } catch {
          /* ignore */
        }
      }
    }

    try {
      stream = canvas.captureStream(fps)
      const mime = pickVideoMime()
      const options: MediaRecorderOptions = {
        videoBitsPerSecond: fps >= 60 ? 24_000_000 : 16_000_000,
      }
      if (mime) options.mimeType = mime

      try {
        recorder = new MediaRecorder(stream, options)
      } catch {
        recorder = new MediaRecorder(stream)
      }
      if (!recorder) throw new Error('MediaRecorder unavailable')

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size) chunks.push(event.data)
      }
      stopped = new Promise<void>((resolve) => {
        if (!recorder) {
          resolve()
          return
        }
        recorder.onstop = () => resolve()
      })

      video.loop = true
      video.muted = true
      if (video.ended) {
        try {
          video.currentTime = 0
        } catch {
          /* ignore */
        }
      }
      void video.play().catch(() => {})

      paintFrame()
      recorder.start(120)
      lastPctRef.current = -1
      setProgress({ open: true, key, pct: 0 })
      cancelRef.current = false

      const started = performance.now()
      await new Promise<void>((resolve) => {
        const frame = (now: number) => {
          paintFrame()
          const elapsed = Math.min((now - started) / 1000, duration)
          lastPct(Math.round((duration > 0 ? elapsed / duration : 1) * 100))
          if (cancelRef.current || elapsed >= duration) {
            resolve()
            return
          }
          requestAnimationFrame(frame)
        }
        requestAnimationFrame(frame)
      })

      try {
        recorder.stop()
      } catch {
        /* ignore */
      }
      await stopped
      stream.getTracks().forEach((track) => track.stop())

      try {
        video.currentTime = startTime
      } catch {
        /* ignore */
      }
      restorePlayer()
      setProgress((current) => ({ ...current, open: false }))
      dirtyRef.current = true

      if (cancelRef.current) return false

      const actualType = (recorder.mimeType || pickVideoMime() || 'video/webm').split(';')[0]
      const ext = actualType.includes('mp4') ? 'mp4' : 'webm'
      const blob = new Blob(chunks, { type: actualType })
      if (!blob.size) {
        toast('Video recording produced no data.')
        return false
      }
      downloadBlob(blob, `ayn-thor-${key}-${def.width}x${def.height}.${ext}`)
      return true
    } catch (error) {
      console.error(error)
      stream?.getTracks().forEach((track) => track.stop())
      restorePlayer()
      setProgress((current) => ({ ...current, open: false }))
      toast('Could not record that screen.')
      return false
    }
  }

  const beginExport = () => {
    exportingRef.current = true
    setExporting(true)
    cancelRef.current = false
  }

  const endExport = () => {
    cancelRef.current = false
    exportingRef.current = false
    setExporting(false)
    setProgress((current) => ({ ...current, open: false }))
    dirtyRef.current = true
  }

  const exportBoth = async () => {
    if (exportingRef.current) return
    if (!getMedia(layerRef.current.mediaId)) {
      toast('Import a file first.')
      return
    }

    beginExport()
    let count = 0
    let canceled = false
    try {
      for (const key of SCREEN_KEYS) {
        if (cancelRef.current) {
          canceled = true
          break
        }
        const clip = wantsClip()
        const ok = clip ? await exportClip(key) : await exportStill(key)
        if (ok) count += 1
        if (!clip) await delay(650)
      }
      canceled = canceled || cancelRef.current
    } finally {
      endExport()
    }

    if (canceled) toast('Export canceled')
    else if (count === 1) toast('1 screen exported')
    else if (count > 1) toast('Both screens exported')
  }

  const cancelExport = () => {
    cancelRef.current = true
  }

  /* ---------------------------------------------------------------- *
   * Preview render loop + transport
   * ---------------------------------------------------------------- */

  const spanPreviewRef = useRef<HTMLCanvasElement | null>(null)
  const previewMediaIdRef = useRef<string | null>(null)
  const [previewCrossfade] = useState(createPreviewCrossfade)

  const getSpanPreview = () => {
    if (!spanPreviewRef.current) {
      const off = document.createElement('canvas')
      off.width = SPAN_CANVAS.width / 2
      off.height = SPAN_CANVAS.height / 2
      spanPreviewRef.current = off
    }
    return spanPreviewRef.current
  }

  const paintSpanPreviews = (now: number, allowMotion: boolean) => {
    const hadPreview = spanPreviewRef.current !== null
    const off = getSpanPreview()
    const sceneCtx = off.getContext('2d')
    const item = getMedia(layerRef.current.mediaId)
    if (!sceneCtx) return
    const mediaId = item?.id ?? null
    if (mediaId !== previewMediaIdRef.current) {
      if (hadPreview && allowMotion) previewCrossfade.capture(off, now)
      else previewCrossfade.cancel()
      previewMediaIdRef.current = mediaId
    }
    drawScene(sceneCtx, layerRef.current, item)
    previewCrossfade.paint(sceneCtx, now)
    for (const key of SCREEN_KEYS) {
      const canvas = canvasRefs[key].current
      const ctx = canvas?.getContext('2d')
      if (!canvas || !ctx) continue
      drawSpanRegion(ctx, off, key)
    }
  }

  useEffect(() => {
    let raf = 0
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onMotionChange = () => {
      if (!motion.matches) return
      previewCrossfade.cancel()
      dirtyRef.current = true
    }
    motion.addEventListener('change', onMotionChange)

    const paint = (now: number) => {
      const activeItem = getMedia(layerRef.current.mediaId)
      const player = activeItem?.type === 'video' ? (activeItem.el as HTMLVideoElement) : null
      const animate = activeItem?.animated || (player && !player.paused && !player.ended)

      if (dirtyRef.current || animate || previewCrossfade.active) {
        paintSpanPreviews(now, !motion.matches)
        dirtyRef.current = false
      }

      if (activeItem && activeItem.type === 'video') {
        const video = activeItem.el as HTMLVideoElement
        const current = Number.isFinite(video.currentTime) ? video.currentTime : 0
        const duration = Number.isFinite(video.duration) ? video.duration : 0
        const key = `${activeItem.id}|${Math.floor(current)}|${Math.floor(duration)}|${video.paused}`
        if (key !== transportKeyRef.current) {
          transportKeyRef.current = key
          setTransport({ current, duration, paused: video.paused })
        }
      } else if (transportKeyRef.current !== '') {
        transportKeyRef.current = ''
        setTransport({ current: 0, duration: 0, paused: true })
      }

      raf = requestAnimationFrame(paint)
    }

    raf = requestAnimationFrame(paint)
    return () => {
      cancelAnimationFrame(raf)
      motion.removeEventListener('change', onMotionChange)
      previewCrossfade.cancel()
    }
    // Refs are intentionally read directly; the loop lives for the app lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---------------------------------------------------------------- *
   * Keyboard shortcuts
   * ---------------------------------------------------------------- */

  const keyboardRef = useRef({ togglePlayback, hasVideo: !!video })
  keyboardRef.current = { togglePlayback, hasVideo: !!video }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const tag = target?.tagName ?? ''
      if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(tag)) return
      if (target?.isContentEditable) return
      if (event.metaKey || event.ctrlKey || event.altKey) return

      const key = event.key.toLowerCase()
      const handlers = keyboardRef.current
      if (key === ' ') {
        if (handlers.hasVideo) {
          event.preventDefault()
          handlers.togglePlayback()
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  /* ---------------------------------------------------------------- *
   * Cleanup object URLs on unmount
   * ---------------------------------------------------------------- */

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      mediaRef.current.forEach(disposeMedia)
    }
  }, [])

  return {
    deviceColor,
    setDeviceColor,
    layer,
    media,
    video,
    hasMedia,
    isRestoring,
    importing,
    storageStatus,

    stillFormat,
    quality,
    videoOutput,
    clipDuration,
    clipFps,
    loop,
    exporting,
    dragging,
    progress,
    transport,
    caps,

    updateFraming,
    resetFraming,
    openPicker,
    onFileInputChange,
    applyMedia,
    removeMedia,
    clearMedia,

    setStillFormat,
    setQuality,
    setVideoOutput,
    setClipDuration,
    setClipFps,
    setLoop,

    togglePlayback,
    seekTo,
    cancelExport,
    exportBoth: () => void exportBoth(),

    canvasRefs,
    fileInputRef,
  }
}
