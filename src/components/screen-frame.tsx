import { useStudioContext } from '@/components/studio-context'
import { useFramingGesture } from '@/hooks/use-framing-gesture'
import { SCREENS, getSpanLayout, getScreenFraming, type ScreenKey } from '@/lib/thor'
import { cn } from '@/lib/utils'

interface ScreenFrameProps {
  screenKey: ScreenKey
  className?: string
}

export function ScreenFrame({ screenKey, className }: ScreenFrameProps) {
  const { layer, activeScreen, setActiveScreen, hasMedia, exporting, canvasRefs, updateFraming } = useStudioContext()
  const layout = getSpanLayout(layer)
  const region = layout.regions[screenKey]
  const gestures = useFramingGesture({
    layer: getScreenFraming(layer, screenKey),
    disabled: !hasMedia || exporting,
    updateFraming: (patch) => updateFraming(patch, screenKey),
    scaleX: region.width / layout.width,
    scaleY: region.height / layout.height,
  })

  return (
    <div
      {...gestures}
      data-screen={screenKey}
      onPointerDown={(event) => {
        if (!layer.linked && hasMedia && !exporting) setActiveScreen(screenKey)
        gestures.onPointerDown(event)
      }}
      className={cn(
        'screen-frame',
        hasMedia && !exporting && 'has-media',
        hasMedia && !layer.linked && activeScreen === screenKey && 'outline-2 outline-offset-2 outline-primary',
        screenKey === 'top' ? 'aspect-[16/9]' : 'aspect-[1240/1080] w-full',
        className,
      )}
    >
      <canvas
        ref={canvasRefs[screenKey]}
        width={screenKey === 'top' ? 960 : 620}
        height={540}
        aria-label={`${SCREENS[screenKey].label} screen preview`}
      />
      <div className="screen-glass" />
    </div>
  )
}
