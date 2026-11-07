import { Upload } from 'lucide-react'

import { useStudioContext } from '@/components/studio-context'
import { cn } from '@/lib/utils'

export function DropOverlay() {
  const { dragging } = useStudioContext()

  return (
    <div
      aria-hidden={!dragging}
      className={cn(
        'pointer-events-none fixed inset-0 z-[90] grid place-items-center bg-background/85 backdrop-blur-sm transition-opacity duration-150',
        dragging ? 'opacity-100' : 'opacity-0',
      )}
    >
      <div className="flex flex-col items-center gap-[7px] rounded-[20px] border-2 border-dashed border-primary/80 bg-card px-16 py-[42px] text-center shadow-xl max-[560px]:px-[30px] max-[560px]:py-8">
        <div className="mb-1 grid size-12 place-items-center rounded-[13px] bg-primary/[0.13] text-brand">
          <Upload className="size-[23px]" />
        </div>
        <strong className="text-[15px] font-semibold">Drop to import</strong>
        <span className="text-xs text-muted-foreground">
          Images &amp; video &middot; one wallpaper across both screens
        </span>
      </div>
    </div>
  )
}
