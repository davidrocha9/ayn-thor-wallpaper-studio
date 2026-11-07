import { useState } from 'react'
import { ChevronLeft, ChevronRight, ImageIcon, LoaderCircle, Trash2, Upload } from 'lucide-react'

import { useStudioContext } from '@/components/studio-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 6

export function Library() {
  const { media, layer, applyMedia, removeMedia, clearMedia, openPicker, importing, isRestoring } = useStudioContext()
  const busy = importing || isRestoring
  const selectedIndex = media.findIndex((item) => item.id === layer.mediaId)
  const [navigation, setNavigation] = useState(() => ({
    mediaId: layer.mediaId,
    page: Math.max(0, Math.floor(selectedIndex / PAGE_SIZE)),
  }))
  const pages = Math.ceil(media.length / PAGE_SIZE)
  const page = navigation.mediaId === layer.mediaId
    ? navigation.page
    : Math.max(0, Math.floor(selectedIndex / PAGE_SIZE))
  const currentPage = Math.min(page, Math.max(0, pages - 1))
  const goToPage = (next: number) => setNavigation({ mediaId: layer.mediaId, page: next })

  return (
    <section aria-label="Media library" className="floating-panel media-library">
      <div className="shrink-0 border-b px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold tracking-tight">Library</h2>
          <Badge variant="secondary" className="h-5 min-w-5 justify-center rounded px-1.5 text-[10px] tabular-nums">
            {media.length}
          </Badge>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Choose media to frame across both screens.
        </p>
        <div className="mt-2 flex gap-2">
          <Button type="button" variant="contrast" onClick={() => openPicker()} disabled={busy} aria-label="Import media" className="h-8 flex-1 gap-2 text-xs">
            {busy ? (
              <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Upload className="size-3.5" aria-hidden="true" />
            )}
            {isRestoring ? 'Loading library…' : importing ? 'Importing…' : 'Import media'}
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" onClick={clearMedia} disabled={busy || !media.length} aria-label="Clear library" title="Clear library" className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive">
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {media.length === 0 ? (
        <div className="library-empty grid flex-1 place-items-center p-6 text-center">
          <div>
            <ImageIcon className="mx-auto mb-3 size-7 text-muted-foreground/50" aria-hidden="true" />
            <p className="text-sm font-medium">{isRestoring ? 'Loading your library…' : 'No media yet'}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Import an image or video to get started.
            </p>
          </div>
        </div>
      ) : (
        <div key={currentPage} className="media-items grid grid-cols-2 content-start gap-3 p-4">
          {media.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map((item, index) => {
            const applied = layer.mediaId === item.id

            return (
              <div key={item.id} style={{ animationDelay: `${index * 45}ms` }} className={cn('media-tile relative min-h-0 min-w-0 overflow-hidden rounded-lg border', applied ? 'border-primary ring-1 ring-primary/20' : 'border-border hover:border-input')}>
                <button type="button" onClick={() => applyMedia(item.id)} title={item.name} aria-label={`Use ${item.name}`} aria-pressed={applied} className="flex h-full w-full flex-col text-left focus-visible:-outline-offset-2">
                  <div className="media-thumbnail relative w-full bg-muted">
                    {item.thumbUrl && <img src={item.thumbUrl} alt="" draggable={false} className="block size-full object-cover" />}
                    {item.type === 'video' && <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 text-[9px] text-white">Video</span>}
                  </div>
                  <div className="w-full shrink-0 truncate px-2 py-2 text-[11px]">{item.name}</div>
                </button>
                <Button type="button" variant="secondary" size="icon-xs" onClick={() => removeMedia(item.id)} aria-label={`Remove ${item.name} from library`} disabled={importing} className="absolute top-1 right-1 size-5 bg-card/95 text-destructive hover:bg-destructive/10 hover:text-destructive">
                  <Trash2 className="size-3" aria-hidden="true" />
                </Button>
              </div>
            )
          })}
        </div>
      )}

      {pages > 1 && (
        <div className="mt-auto flex shrink-0 items-center justify-between gap-2 border-t px-4 py-3">
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 0} aria-label="Previous media page">
            <ChevronLeft className="size-3.5" />
          </Button>
          <p aria-live="polite" className="text-xs text-muted-foreground tabular-nums">
            {currentPage + 1} / {pages}
          </p>
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => goToPage(currentPage + 1)} disabled={currentPage === pages - 1} aria-label="Next media page">
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      )}
    </section>
  )
}
