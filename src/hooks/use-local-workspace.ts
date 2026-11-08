import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { toast } from 'sonner'

import { disposeMedia, loadMedia } from '@/lib/media'
import { readWorkspace, saveWorkspace, type WorkspaceSettings } from '@/lib/studio-storage'
import { MAX_MEDIA, type MediaItem } from '@/lib/thor'

export type StorageStatus = 'restoring' | 'saving' | 'saved' | 'unavailable'

interface LocalWorkspaceOptions {
  media: MediaItem[]
  settings: WorkspaceSettings
  onRestore: (media: MediaItem[], settings: WorkspaceSettings) => void
}

export function useLocalWorkspace({ media, settings, onRestore }: LocalWorkspaceOptions) {
  const [ready, setReady] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [saved, setSaved] = useState<{ media: MediaItem[]; settings: WorkspaceSettings } | null>(null)
  const previousMedia = useRef<MediaItem[] | null>(null)
  const canSave = useRef(false)
  const unrestoredIds = useRef(new Set<string>())
  const restore = useEffectEvent(onRestore)

  useEffect(() => {
    let active = true
    const loaded: MediaItem[] = []
    let handedOff = false

    const hydrate = async () => {
      try {
        const workspace = await readWorkspace()
        const failed = new Set(workspace.media.slice(MAX_MEDIA).map((item) => item.id))
        for (const item of workspace.media.slice(0, MAX_MEDIA)) {
          if (!active) return
          try {
            const file = new File([item.blob], item.name, { type: item.type, lastModified: item.lastModified })
            loaded.push(await loadMedia(file, item.id, item.sourceCrop, item.cropAspectLocked))
          } catch {
            failed.add(item.id)
          }
        }
        if (!active) return
        unrestoredIds.current = failed
        restore(loaded, workspace.settings)
        handedOff = true
        canSave.current = true
        if (failed.size) toast(`${failed.size} saved file${failed.size === 1 ? '' : 's'} could not be opened. Originals are still saved on this device.`)
      } catch (error) {
        if (!active) return
        console.warn('Local workspace could not be restored', error)
        setUnavailable(true)
        toast('Local storage is unavailable. Files will only last for this session.')
      } finally {
        if (!handedOff) loaded.forEach(disposeMedia)
        if (active) setReady(true)
      }
    }

    void hydrate()
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!ready || !canSave.current) return
    let active = true
    // Save file changes immediately; coalesce frequent slider/pan updates.
    const delay = previousMedia.current === media ? 180 : 0
    // An explicit emptying of the library also clears any unreadable saved files.
    if (previousMedia.current?.length && !media.length) unrestoredIds.current.clear()
    previousMedia.current = media
    const timer = window.setTimeout(() => {
      void saveWorkspace(media, settings, unrestoredIds.current).then(() => {
        if (!active) return
        setSaved({ media, settings })
        setUnavailable(false)
      }).catch((error: unknown) => {
        if (!active) return
        console.warn('Local workspace could not be saved', error)
        setUnavailable(true)
        toast('Could not save on this device. Storage may be full or disabled.', { id: 'storage-error' })
      })
    }, delay)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [ready, media, settings])

  const flush = useEffectEvent(() => {
    if (ready && canSave.current) void saveWorkspace(media, settings, unrestoredIds.current).catch(() => {})
  })
  useEffect(() => {
    window.addEventListener('pagehide', flush)
    return () => window.removeEventListener('pagehide', flush)
  }, [])

  const storageStatus: StorageStatus = !ready ? 'restoring'
    : unavailable ? 'unavailable'
    : saved?.media === media && saved.settings === settings ? 'saved'
    : 'saving'

  return { isRestoring: !ready, storageStatus }
}
