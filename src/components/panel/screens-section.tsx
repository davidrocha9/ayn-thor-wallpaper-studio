import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useStudioContext } from '@/components/studio-context'
import { FITS, type Fit } from '@/lib/thor'
import { BackdropField } from './backdrop-field'
import { DeviceColorField } from './device-color-field'
import { ScreenAlignmentField } from './screen-alignment-field'
import { Field, FieldTop, Section } from './section'

const segmentedClass =
  'w-full gap-1 rounded-lg bg-muted p-1'

const segmentItemClass =
  'h-8 flex-1 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-background/60 hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm'

export function ScreensSection() {
  const { layer, hasMedia, exporting, updateFraming } = useStudioContext()
  const disabled = !hasMedia || exporting

  return (
    <Section className="flex flex-1 flex-col justify-between gap-3 border-0 py-0 [&>*]:mt-0">
      <DeviceColorField />
      <ScreenAlignmentField />
      <Field>
        <FieldTop
          label="Fit"
          value={layer.fit.charAt(0).toUpperCase() + layer.fit.slice(1)}
        />
        <ToggleGroup
          type="single"
          value={layer.fit}
          disabled={disabled}
          onValueChange={(value) => {
            if (value) updateFraming({ fit: value as Fit })
          }}
          className={segmentedClass}
        >
          {FITS.map((fit) => (
            <ToggleGroupItem key={fit} value={fit} className={segmentItemClass}>
              {fit.charAt(0).toUpperCase() + fit.slice(1)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>

      <div className="mt-2.5 grid grid-cols-2 items-start gap-4">
        <Field className="mt-0">
          <FieldTop label="Zoom" value={`${Math.round(layer.zoom * 100)}%`} />
          <Slider
            min={50}
            max={400}
            step={1}
            value={[Math.round(layer.zoom * 100)]}
            aria-label="Zoom"
            className="h-8"
            disabled={disabled}
            onValueChange={([value]) => updateFraming({ zoom: value / 100 })}
          />
        </Field>
        <Field className="mt-0">
          <FieldTop label="Rotate" value={`${layer.rotation}\u00B0`} />
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => updateFraming({ rotation: (layer.rotation + 270) % 360 })}
              className="h-8 text-xs"
            >
              &#8634; 90&deg;
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => updateFraming({ rotation: (layer.rotation + 90) % 360 })}
              className="h-8 text-xs"
            >
              &#8635; 90&deg;
            </Button>
          </div>
        </Field>
      </div>

      <Field>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-foreground">Position</span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => updateFraming({ offsetX: 0, offsetY: 0 })}
            className="rounded-md px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            Center
          </button>
        </div>

        {(
          [
            ['X', layer.offsetX],
            ['Y', layer.offsetY],
          ] as const
        ).map(([axis, value]) => (
          <div key={axis} className="mt-1 grid grid-cols-[12px_1fr_30px] items-center gap-2">
            <span className="text-[11px] font-medium text-muted-foreground">{axis}</span>
            <Slider
              min={-100}
              max={100}
              step={1}
              value={[Math.round(value * 100)]}
              aria-label={`${axis} position`}
              disabled={disabled}
              onValueChange={([next]) =>
                updateFraming(axis === 'X' ? { offsetX: next / 100 } : { offsetY: next / 100 })
              }
            />
            <span className="text-right text-[11px] text-muted-foreground tabular-nums">
              {Math.round(value * 100)}
            </span>
          </div>
        ))}
      </Field>

      <BackdropField />
    </Section>
  )
}
