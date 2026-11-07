import { Slider } from '@/components/ui/slider'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useStudioContext } from '@/components/studio-context'
import { videoLabel, type StillFormat } from '@/lib/thor'
import { Field, FieldTop, hintClass } from './section'

const segmentedClass = 'w-full gap-1 rounded-lg bg-muted p-1'
const segmentItemClass =
  'h-8 flex-1 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-background/60 hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm'

export function ExportOptions() {
  const {
    caps,
    stillFormat,
    quality,
    videoOutput,
    clipDuration,
    clipFps,
    video,
    setStillFormat,
    setQuality,
    setVideoOutput,
    setClipDuration,
    setClipFps,
  } = useStudioContext()
  const label = videoLabel()
  const clipMode = !!video && videoOutput === 'clip' && caps.clip

  return (
    <div>
      <Field>
        <FieldTop label="Still format" />
        <ToggleGroup
          type="single"
          value={stillFormat}
          onValueChange={(value) => {
            if (value) setStillFormat(value as StillFormat)
          }}
          className={segmentedClass}
        >
          <ToggleGroupItem value="png" className={segmentItemClass}>
            PNG
          </ToggleGroupItem>
          <ToggleGroupItem value="jpeg" className={segmentItemClass}>
            JPEG
          </ToggleGroupItem>
          <ToggleGroupItem
            value="webp"
            disabled={!caps.webp}
            title={caps.webp ? undefined : 'WebP export is not supported in this browser'}
            className={segmentItemClass}
          >
            WebP
          </ToggleGroupItem>
        </ToggleGroup>
      </Field>

      {stillFormat !== 'png' && (
        <Field className="motion-reveal">
          <FieldTop label="Quality" value={`${Math.round(quality * 100)}%`} />
          <Slider
            min={50}
            max={100}
            step={1}
            value={[Math.round(quality * 100)]}
            aria-label="Export quality"
            onValueChange={([value]) => setQuality(value / 100)}
          />
        </Field>
      )}

      {video && (
        <Field>
          <FieldTop label="Video output" value={label} />
          <ToggleGroup
            type="single"
            value={videoOutput}
            onValueChange={(value) => {
              if (value) setVideoOutput(value as 'still' | 'clip')
            }}
            className={segmentedClass}
          >
            <ToggleGroupItem value="still" className={segmentItemClass}>
              Still frame
            </ToggleGroupItem>
            <ToggleGroupItem
              value="clip"
              disabled={!caps.clip}
              title={caps.clip ? undefined : 'This browser cannot record canvas video'}
              className={segmentItemClass}
            >
              Live clip
            </ToggleGroupItem>
          </ToggleGroup>
        </Field>
      )}

      {clipMode && (
        <Field className="motion-reveal">
          <FieldTop label="Clip length" value={`${clipDuration}s`} />
          <Slider
            min={2}
            max={15}
            step={1}
            value={[clipDuration]}
            aria-label="Clip length"
            onValueChange={([value]) => setClipDuration(value)}
          />

          <div className="mt-2.5">
            <FieldTop label="Frame rate" value={`${clipFps} fps`} />
            <ToggleGroup
              type="single"
              value={String(clipFps)}
              onValueChange={(value) => {
                if (value) setClipFps(Number(value))
              }}
              className={segmentedClass}
            >
              <ToggleGroupItem value="30" className={segmentItemClass}>
                30 fps
              </ToggleGroupItem>
              <ToggleGroupItem value="60" className={segmentItemClass}>
                60 fps
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <p className={hintClass}>
            Records in real time &mdash; keep this tab visible.
          </p>
        </Field>
      )}
    </div>
  )
}
