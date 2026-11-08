import { useEffect, useRef } from 'react'

import { useCropSelection } from '@/hooks/use-crop-selection'
import type { CropCorner, CropRect } from '@/lib/crop'
import type { MediaItem } from '@/lib/thor'

interface CropPreviewProps {
  item: MediaItem
  selection: CropRect
  ratio?: number
  disabled: boolean
  onChange: (selection: CropRect) => void
}

const corners: { key: CropCorner; label: string; className: string }[] = [
  { key: 'nw', label: 'top left', className: 'top-0 left-0 cursor-nwse-resize' },
  { key: 'ne', label: 'top right', className: 'top-0 right-0 cursor-nesw-resize' },
  { key: 'sw', label: 'bottom left', className: 'bottom-0 left-0 cursor-nesw-resize' },
  { key: 'se', label: 'bottom right', className: 'bottom-0 right-0 cursor-nwse-resize' },
]

export function CropPreview({ item, selection, ratio, disabled, onChange }: CropPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const gestures = useCropSelection({ selection, width: item.width, height: item.height, ratio, disabled, onChange })

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const scale = Math.min(1, 1200 / Math.max(item.width, item.height))
    canvas.width = Math.max(1, Math.round(item.width * scale))
    canvas.height = Math.max(1, Math.round(item.height * scale))
    const source = item.sourceCrop ?? { x: 0, y: 0, width: item.width, height: item.height }
    const player = item.type === 'video' ? item.el as HTMLVideoElement : null
    let raf = 0
    let lastTime = -1
    const paint = () => {
      if (!player || (player.readyState >= 2 && player.currentTime !== lastTime)) {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(item.el, source.x, source.y, source.width, source.height, 0, 0, canvas.width, canvas.height)
        lastTime = player?.currentTime ?? 0
      }
      if (player || item.animated) raf = requestAnimationFrame(paint)
    }
    paint()
    return () => cancelAnimationFrame(raf)
  }, [item])

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center justify-center rounded-lg border bg-muted/60 p-4">
        <div
          {...gestures.surface}
          className="crop-surface relative overflow-hidden rounded-sm bg-black"
          style={{ aspectRatio: `${item.width} / ${item.height}`, width: `min(100%, ${48 * item.width / item.height}dvh)` }}
        >
          <canvas ref={canvasRef} className="block h-full w-full" aria-label="Original media crop preview" />
          <div
            data-crop-selection
            role="group"
            aria-label="Crop selection"
            tabIndex={disabled ? -1 : 0}
            className="absolute cursor-move border-2 border-white outline-primary focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              left: `${selection.x / item.width * 100}%`, top: `${selection.y / item.height * 100}%`,
              width: `${selection.width / item.width * 100}%`, height: `${selection.height / item.height * 100}%`,
              boxShadow: '0 0 0 9999px rgb(0 0 0 / 0.6)',
            }}
            onKeyDown={(event) => gestures.onKeyDown(event)}
          >
            <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3" aria-hidden="true">
              {Array.from({ length: 9 }, (_, i) => <span key={i} className="border border-white/20" />)}
            </div>
            {corners.map(({ key, label, className }) => (
              <button
                key={key}
                type="button"
                data-crop-corner={key}
                aria-label={`Resize crop from ${label}`}
                disabled={disabled}
                className={`absolute z-10 grid size-6 place-items-center rounded-sm focus-visible:outline-2 focus-visible:outline-primary ${className}`}
                onKeyDown={(event) => gestures.onKeyDown(event, key)}
              >
                <span className="size-3 rounded-xs border border-primary bg-white shadow-sm" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
