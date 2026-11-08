import { useStudioContext } from '@/components/studio-context'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Field, FieldTop } from './section'

const itemClass = 'h-8 flex-1 rounded-md text-xs data-[state=on]:bg-background data-[state=on]:shadow-sm'

export function ScreenAlignmentField() {
  const { layer, hasMedia, exporting, isRestoring, updateFraming } = useStudioContext()

  return (
    <Field>
      <FieldTop label="Screen alignment" />
      <ToggleGroup
        type="single"
        aria-label="Screen alignment"
        value={layer.layout}
        disabled={!hasMedia || exporting || isRestoring}
        className="w-full gap-1 rounded-lg bg-muted p-1"
        onValueChange={(value) => {
          if (value !== 'physical' && value !== 'continuous') return
          updateFraming({ layout: value })
        }}
      >
        <ToggleGroupItem value="physical" className={itemClass}>Physical</ToggleGroupItem>
        <ToggleGroupItem value="continuous" className={itemClass}>Continuous</ToggleGroupItem>
      </ToggleGroup>
    </Field>
  )
}
