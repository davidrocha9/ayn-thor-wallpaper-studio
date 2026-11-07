import { Download, SlidersHorizontal } from 'lucide-react'

import { useStudioContext } from '@/components/studio-context'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { ExportOptions } from './export-options'

export function ExportSection() {
  const {
    hasMedia,
    isRestoring,
    exporting,
    exportBoth,
  } = useStudioContext()

  return (
    <div className="shrink-0 border-t pt-4">
      <div className="flex gap-2">
        <Button
          id="export-wallpapers"
          type="button"
          variant="contrast"
          onClick={exportBoth}
          disabled={!hasMedia || exporting}
          className="h-9 min-w-0 flex-1 gap-2 text-xs"
        >
          <Download className="size-3.5" aria-hidden="true" />
          {exporting ? 'Exporting…' : 'Export both screens'}
        </Button>
        <Dialog>
          <DialogTrigger asChild>
            <Button type="button" variant="outline" size="icon-lg" aria-label="Export settings" title="Export settings" disabled={isRestoring || exporting}>
              <SlidersHorizontal className="size-3.5" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[calc(100dvh-3rem)] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Export settings</DialogTitle>
              <DialogDescription className="text-xs">
                Choose the output for both screens at native resolution.
              </DialogDescription>
            </DialogHeader>
            <ExportOptions />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">Done</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
