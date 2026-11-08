import { useState } from 'react'

import { useStudioContext } from '@/components/studio-context'
import { Input } from '@/components/ui/input'
import { Field, FieldTop, hintClass } from './section'

function normalizeHex(value: string) {
  const hex = value.trim().replace(/^#/, '')
  if (/^[0-9a-f]{6}$/i.test(hex)) return `#${hex.toLowerCase()}`
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return `#${[...hex].map((character) => character.repeat(2)).join('').toLowerCase()}`
  }
  return null
}

export function BackdropField() {
  const { activeFraming: layer, updateFraming, isRestoring, exporting } = useStudioContext()
  const [draft, setDraft] = useState<string | null>(null)
  const invalid = draft !== null && normalizeHex(draft) === null

  return (
    <Field>
      <FieldTop label="Backdrop" htmlFor="backdrop-hex" />
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label="Choose any backdrop color"
          value={layer.bg}
          disabled={isRestoring || exporting}
          onChange={(event) => {
            setDraft(null)
            updateFraming({ bg: event.target.value })
          }}
          className="h-9 w-11 shrink-0 cursor-pointer rounded-md border border-input bg-background p-1"
        />
        <Input
          id="backdrop-hex"
          disabled={isRestoring || exporting}
          aria-label="Backdrop hex color"
          aria-invalid={invalid}
          aria-describedby={invalid ? 'backdrop-hint' : undefined}
          spellCheck={false}
          autoComplete="off"
          value={draft ?? layer.bg.toUpperCase()}
          onChange={(event) => {
            const value = event.target.value
            setDraft(value)
            const color = normalizeHex(value)
            if (color) updateFraming({ bg: color })
          }}
          onBlur={() => setDraft(null)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur()
          }}
          className="font-mono text-xs"
        />
      </div>
      {invalid && (
        <p id="backdrop-hint" role="alert" className={hintClass}>
          Enter a 3- or 6-digit hex color.
        </p>
      )}
    </Field>
  )
}
