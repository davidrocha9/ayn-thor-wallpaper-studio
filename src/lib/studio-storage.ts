import {
  clamp,
  defaultLayer,
  normalizeGapMm,
  type Layer,
  type MediaItem,
  type StillFormat,
  type VideoOutput,
} from './thor.ts'

import type { CropRect } from './crop.ts'
import { DEFAULT_DEVICE_COLOR, isDeviceColor, type DeviceColor } from './device-colors.ts'

const DATABASE = 'thor-wallpaper-studio'
const VERSION = 1

export interface WorkspaceSettings {
  deviceColor: DeviceColor
  layer: Layer
  stillFormat: StillFormat
  quality: number
  videoOutput: VideoOutput
  clipDuration: number
  clipFps: number
  loop: boolean
}

export interface StoredMedia {
  id: string
  name: string
  type: string
  lastModified: number
  blob: Blob
  sourceCrop?: CropRect
  cropAspectLocked?: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function numberInRange(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback
}

export function normalizeWorkspaceSettings(value: unknown): WorkspaceSettings {
  const settings = isRecord(value) ? value : {}
  const layer = isRecord(settings.layer) ? settings.layer : {}
  const defaults = defaultLayer()
  // A saved pre-feature layer must keep its original split and framing.
  const layoutMode = isRecord(settings.layer) && layer.layout !== 'physical'
    ? 'continuous' : defaults.layout

  return {
    deviceColor: isDeviceColor(settings.deviceColor) ? settings.deviceColor : DEFAULT_DEVICE_COLOR,
    layer: {
      layout: layoutMode,
      gapMm: typeof layer.gapMm === 'number' ? normalizeGapMm(layer.gapMm) : defaults.gapMm,
      mediaId: typeof layer.mediaId === 'string' ? layer.mediaId : null,
      fit: layer.fit === 'contain' || layer.fit === 'stretch' ? layer.fit : 'cover',
      zoom: numberInRange(layer.zoom, defaults.zoom, 0.5, 4),
      offsetX: numberInRange(layer.offsetX, defaults.offsetX, -1, 1),
      offsetY: numberInRange(layer.offsetY, defaults.offsetY, -1, 1),
      rotation: layer.rotation === 90 || layer.rotation === 180 || layer.rotation === 270 ? layer.rotation : 0,
      bg: typeof layer.bg === 'string' && /^#[0-9a-f]{6}$/i.test(layer.bg) ? layer.bg : defaults.bg,
    },
    stillFormat: settings.stillFormat === 'jpeg' || settings.stillFormat === 'webp' ? settings.stillFormat : 'png',
    quality: numberInRange(settings.quality, 0.92, 0.5, 1),
    videoOutput: settings.videoOutput === 'clip' ? 'clip' : 'still',
    clipDuration: numberInRange(settings.clipDuration, 6, 2, 15),
    clipFps: settings.clipFps === 60 ? 60 : 30,
    loop: typeof settings.loop === 'boolean' ? settings.loop : true,
  }
}

let database: Promise<IDBDatabase> | null = null

function openDatabase(): Promise<IDBDatabase> {
  if (database) return database

  database = new Promise<IDBDatabase>((resolve, reject) => {
    let blocked = false
    const request = indexedDB.open(DATABASE, VERSION)
    request.onupgradeneeded = () => {
      request.result.createObjectStore('media', { keyPath: 'id' })
      request.result.createObjectStore('settings')
    }
    request.onsuccess = () => {
      const db = request.result
      if (blocked) {
        db.close()
        return
      }
      db.onclose = () => { database = null }
      db.onversionchange = () => {
        db.close()
        database = null
      }
      resolve(db)
    }
    request.onerror = () => reject(request.error ?? new Error('Could not open local storage'))
    request.onblocked = () => {
      blocked = true
      reject(new Error('Local storage is blocked by another tab'))
    }
  }).catch((error: unknown) => {
    database = null
    throw error
  })

  return database
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error ?? new Error('Local storage transaction was canceled'))
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not save locally'))
  })
}

export async function readWorkspace(): Promise<{ media: StoredMedia[]; settings: WorkspaceSettings }> {
  const db = await openDatabase()
  const transaction = db.transaction(['media', 'settings'], 'readonly')
  const done = transactionDone(transaction)
  const media = transaction.objectStore('media').getAll()
  const settings = transaction.objectStore('settings').get('workspace')
  await done

  const order: unknown[] = isRecord(settings.result) && Array.isArray(settings.result.mediaOrder)
    ? settings.result.mediaOrder
    : []
  const position = new Map(order.map((id, index) => [id, index]))
  return {
    media: (media.result as unknown[]).filter((item): item is StoredMedia =>
      isRecord(item) && typeof item.id === 'string' && typeof item.name === 'string' &&
      typeof item.type === 'string' && typeof item.lastModified === 'number' && item.blob instanceof Blob,
    ).sort((a, b) => (position.get(a.id) ?? Infinity) - (position.get(b.id) ?? Infinity)),
    settings: normalizeWorkspaceSettings(settings.result),
  }
}

/** One atomic snapshot; existing blobs aren't rewritten while the framing changes. */
export async function saveWorkspace(media: MediaItem[], settings: WorkspaceSettings, preserveIds: ReadonlySet<string> = new Set()): Promise<void> {
  const preserved = new Set(preserveIds)
  const db = await openDatabase()
  const transaction = db.transaction(['media', 'settings'], 'readwrite')
  const done = transactionDone(transaction)
  const store = transaction.objectStore('media')
  const keys = store.getAllKeys()
  const ids = new Set(media.map((item) => item.id))

  keys.onsuccess = () => {
    try {
      const existing = new Set(keys.result)
      for (const key of existing) {
        if (!ids.has(String(key)) && !preserved.has(String(key))) store.delete(key)
      }
      for (const item of media) {
        if (existing.has(item.id)) {
          const request = store.get(item.id)
          request.onsuccess = () => {
            try {
              const saved = request.result as StoredMedia
              const crop = { sourceCrop: item.sourceCrop, cropAspectLocked: item.cropAspectLocked }
              const previous = { sourceCrop: saved.sourceCrop, cropAspectLocked: saved.cropAspectLocked }
              if (JSON.stringify(crop) !== JSON.stringify(previous)) store.put({ ...saved, ...crop })
            } catch {
              transaction.abort()
            }
          }
          continue
        }
        store.put({
          id: item.id,
          name: item.file.name,
          type: item.file.type,
          lastModified: item.file.lastModified,
          blob: item.file,
          sourceCrop: item.sourceCrop,
          cropAspectLocked: item.cropAspectLocked,
        } satisfies StoredMedia)
      }
    } catch {
      // Synchronous quota/serialization failures must roll back the whole snapshot.
      transaction.abort()
    }
  }
  // Keep insertion order independently of IndexedDB's primary-key ordering.
  transaction.objectStore('settings').put({ ...settings, mediaOrder: [...new Set([...ids, ...preserved])] }, 'workspace')
  await done
}
