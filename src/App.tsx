import { ClipProgressDialog } from '@/components/clip-progress-dialog'
import { ControlPanel } from '@/components/control-panel'
import { DevicePreview } from '@/components/device-preview'
import { DropOverlay } from '@/components/drop-overlay'
import { Library } from '@/components/library'
import { StudioContext } from '@/components/studio-context'
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
        <div className="studio-shell">
          <div className="studio-layout">
            <main ref={workspaceRef} className="studio-workspace" aria-label="Thor wallpaper editor">
              <Library />
              <section aria-label="Device preview" className="preview-workspace">
                <DevicePreview />
              </section>
              <ControlPanel />
            </main>
          </div>

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
