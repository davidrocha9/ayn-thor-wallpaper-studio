import { ClipProgressDialog } from '@/components/clip-progress-dialog'
import { ControlPanel } from '@/components/control-panel'
import { DevicePreview } from '@/components/device-preview'
import { DropOverlay } from '@/components/drop-overlay'
import { Library } from '@/components/library'
import { StudioContext } from '@/components/studio-context'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useStudio } from '@/hooks/use-studio'
import { useWorkspaceMotion } from '@/hooks/use-workspace-motion'

function App() {
  const studio = useStudio()
  const workspaceRef = useWorkspaceMotion(!!studio.video)

  return (
    <StudioContext.Provider value={studio}>
      <TooltipProvider delayDuration={250}>
        <div className="studio-shell relative">
          <div className="studio-layout">
            <main ref={workspaceRef} className="studio-workspace" aria-label="Thor wallpaper editor">
              <Library />
              <section aria-label="Device preview" className="preview-workspace">
                <DevicePreview />
              </section>
              <ControlPanel />
            </main>
          </div>

          <footer className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-4 pb-[max(12px,env(safe-area-inset-bottom))]">
            <Button asChild variant="ghost" className="pointer-events-auto min-h-11 gap-2 text-xs text-muted-foreground">
              <a href="https://github.com/davidrocha9/ayn-thor-wallpaper-studio" target="_blank" rel="noopener noreferrer">
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="size-4">
                  <path d="M12 .75a11.25 11.25 0 0 0-3.558 21.923c.563.104.769-.244.769-.542 0-.267-.01-.975-.015-1.913-3.13.68-3.791-1.508-3.791-1.508-.512-1.3-1.25-1.646-1.25-1.646-1.022-.699.077-.685.077-.685 1.13.08 1.725 1.16 1.725 1.16 1.005 1.722 2.637 1.225 3.279.937.102-.728.393-1.225.715-1.507-2.499-.284-5.126-1.25-5.126-5.563 0-1.229.44-2.232 1.16-3.019-.116-.284-.503-1.429.11-2.978 0 0 .945-.303 3.095 1.154a10.79 10.79 0 0 1 5.625 0c2.148-1.457 3.091-1.154 3.091-1.154.615 1.55.228 2.694.112 2.978.722.787 1.158 1.79 1.158 3.019 0 4.324-2.631 5.276-5.138 5.555.404.348.765 1.034.765 2.084 0 1.504-.014 2.718-.014 3.087 0 .3.203.65.774.54A11.252 11.252 0 0 0 12 .75Z" />
                </svg>
                View on GitHub
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </Button>
          </footer>

          <input
            ref={studio.fileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            hidden
            onChange={studio.onFileInputChange}
          />

          <DropOverlay />
          <ClipProgressDialog />
          <Toaster
            theme="light"
            position="bottom-center"
            offset={{ bottom: 26 }}
            toastOptions={{ className: 'text-xs' }}
          />
        </div>
      </TooltipProvider>
    </StudioContext.Provider>
  )
}

export default App
