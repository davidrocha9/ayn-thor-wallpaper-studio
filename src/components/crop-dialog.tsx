import { useEffect, useMemo, useState } from 'react'
import { Crop } from 'lucide-react'

import { CropPreview } from '@/components/crop-preview'
import { useStudioContext } from '@/components/studio-context'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { centeredCrop } from '@/lib/crop'
import { getSourceMedia } from '@/lib/media'
import { getSpanLayout, type MediaItem } from '@/lib/thor'

interface CropEditorProps {
  item: MediaItem
  ratio: number
  onClose: () => void
}

function CropPlayback({ video, disabled }: { video: HTMLVideoElement; disabled: boolean }) {
  const [paused, setPaused] = useState(() => video.paused)

  useEffect(() => {
    const initiallyPaused = video.paused
    const sync = () => setPaused(video.paused)
    video.addEventListener('play', sync)
    video.addEventListener('pause', sync)
    return () => {
      video.removeEventListener('play', sync)
      video.removeEventListener('pause', sync)
      if (initiallyPaused) video.pause()
    }
  }, [video])

  return (
    <Button type="button" variant="outline" size="sm" className="justify-self-start text-xs" disabled={disabled} onClick={() => {
      if (video.paused) void video.play().catch(() => {})
      else video.pause()
    }}>
      {paused ? 'Play video' : 'Pause video'}
    </Button>
  )
}

function CropEditor({ item, ratio, onClose }: CropEditorProps) {
  const { importing, applyCrop } = useStudioContext()
  const source = useMemo(() => getSourceMedia(item), [item])
  const [locked, setLocked] = useState(item.cropAspectLocked ?? true)
  const [selection, setSelection] = useState(() => item.sourceCrop ?? (locked ? centeredCrop(source.width, source.height, ratio) : { x: 0, y: 0, width: source.width, height: source.height }))
  const apply = () => {
    if (applyCrop(item.id, selection, locked)) onClose()
  }

  return (
    <>
      <CropPreview item={source} selection={selection} ratio={locked ? ratio : undefined} disabled={importing} onChange={setSelection} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex min-h-8 items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={locked}
            disabled={importing}
            className="size-4 accent-primary"
            onChange={(event) => {
              setLocked(event.target.checked)
              if (event.target.checked) setSelection(centeredCrop(source.width, source.height, ratio))
            }}
          />
          Keep Thor aspect ratio
        </label>
        <Button type="button" variant="outline" size="sm" disabled={importing} className="text-xs" onClick={() => {
          setSelection({ x: 0, y: 0, width: source.width, height: source.height })
          setLocked(false)
        }}>
          Restore original
        </Button>
      </div>
      {item.type === 'video' && <CropPlayback video={item.el as HTMLVideoElement} disabled={importing} />}
      <DialogFooter className="sticky -bottom-4 z-20 flex-row justify-end bg-popover">
        <Button type="button" variant="outline" onClick={onClose} disabled={importing}>Cancel</Button>
        <Button type="button" variant="contrast" onClick={apply} disabled={importing}>
          {importing ? 'Applying crop…' : 'Apply crop'}
        </Button>
      </DialogFooter>
    </>
  )
}

export function CropDialog({ item }: { item: MediaItem }) {
  const { layer, exporting, isRestoring, importing } = useStudioContext()
  const [open, setOpen] = useState(false)
  const layout = getSpanLayout(layer)

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!importing) setOpen(next) }}>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary" size="icon-xs" aria-label={`Crop ${item.name}`} title="Crop" disabled={exporting || isRestoring || importing} className="size-6 bg-card/95 hover:bg-card">
          <Crop className="size-3" aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl" showCloseButton={!importing} aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{item.type === 'video' ? 'Crop Video' : 'Crop Image'}</DialogTitle>
        </DialogHeader>
        <CropEditor key={item.id} item={item} ratio={layout.width / layout.height} onClose={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}
