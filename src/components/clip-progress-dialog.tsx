import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { useStudioContext } from '@/components/studio-context'
import { SCREENS } from '@/lib/thor'

export function ClipProgressDialog() {
  const { progress, clipFps, cancelExport } = useStudioContext()
  const def = SCREENS[progress.key]

  return (
    <Dialog open={progress.open} onOpenChange={() => {}}>
      <DialogContent
        showCloseButton={false}
        className="w-[min(92vw,380px)] max-w-[380px] gap-0 rounded-2xl border border-border bg-card p-5 pb-[15px] ring-0 sm:max-w-[380px]"
      >
        <div className="mb-[7px] flex items-center justify-between gap-3">
          <span className="text-[11px] font-medium tracking-wide text-brand uppercase">
            Rendering live clip
          </span>
          <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
            {progress.pct}%
          </span>
        </div>

        <DialogTitle className="m-0 text-base font-semibold tracking-tight">
          {def.label} screen
        </DialogTitle>
        <DialogDescription className="mt-1 text-xs text-muted-foreground">
          {clipFps} fps &middot; {def.width}&times;{def.height}
        </DialogDescription>

        <Progress
          value={progress.pct}
          aria-label="Clip render progress"
          className="mt-4 h-1.5 bg-muted"
        />

        <div className="mt-3 flex items-center justify-between gap-2.5 text-xs text-muted-foreground">
          <span>Keep this tab visible</span>
          <button
            type="button"
            onClick={cancelExport}
            className="rounded-md px-2 py-1 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
