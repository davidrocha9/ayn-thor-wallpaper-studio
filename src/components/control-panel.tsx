import { RotateCcw } from 'lucide-react'

import { ExportSection } from '@/components/panel/export-section'
import { ScreensSection } from '@/components/panel/screens-section'
import { useStudioContext } from '@/components/studio-context'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export function ControlPanel() {
  const { resetFraming, hasMedia, isRestoring, storageStatus } = useStudioContext()

  return (
    <aside aria-label="Wallpaper tools" className="floating-panel control-panel" data-storage-status={storageStatus} aria-busy={isRestoring}>
      <div className="shrink-0 border-b px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-sm font-semibold tracking-tight">Thor Wallpaper Studio</h1>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon-xs" onClick={resetFraming} disabled={!hasMedia} aria-label="Reset framing" className="text-muted-foreground">
                <RotateCcw className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reset framing</TooltipContent>
          </Tooltip>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Turn an image or video into wallpapers for both AYN Thor screens.
        </p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 py-4">
        <div className="framing-controls thin-scroll flex min-h-0 flex-1 flex-col">
          <ScreensSection />
        </div>
        <ExportSection />
      </div>
    </aside>
  )
}
