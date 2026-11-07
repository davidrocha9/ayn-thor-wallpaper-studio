import { Check } from 'lucide-react'

import { useStudioContext } from '@/components/studio-context'
import { DEVICE_COLORS } from '@/lib/device-colors'

export function DeviceColorField() {
  const { deviceColor, setDeviceColor, isRestoring } = useStudioContext()

  return (
    <fieldset className="min-w-0" disabled={isRestoring}>
      <legend className="mb-2 text-xs font-medium">Thor color</legend>
      <div className="grid grid-cols-4 gap-2">
        {DEVICE_COLORS.map(({ id, label }) => (
          <label key={id} className="relative min-w-0 cursor-pointer">
            <input
              type="radio"
              name="thor-color"
              value={id}
              checked={deviceColor === id}
              onChange={() => setDeviceColor(id)}
              className="peer sr-only"
            />
            <span className="flex h-full flex-col items-center gap-1.5 rounded-lg border border-border px-1 py-2 text-center text-[10px] leading-snug font-medium transition-colors hover:bg-muted/60 peer-checked:border-primary peer-checked:bg-accent peer-checked:text-accent-foreground peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring peer-disabled:pointer-events-none peer-disabled:opacity-50">
              <svg viewBox="0 0 48 58" width="48" height="58" preserveAspectRatio="xMidYMid meet" className="thor-color-swatch h-10 w-auto shrink-0" data-device-color={id} aria-hidden="true">
                <rect x="2" y="2" width="44" height="25.5" rx="2" fill="var(--thor-shell-light)" stroke="var(--thor-shell-border)" />
                <rect x="4" y="4" width="40" height="22.5" rx="1" fill="#18191d" />
                <rect x="2" y="27" width="44" height="3.2" rx="1" fill="var(--thor-shell-dark)" />
                <rect x="2" y="30" width="44" height="25.1" rx="3" fill="var(--thor-shell-mid)" stroke="var(--thor-shell-border)" />
                <rect x="13" y="32" width="22" height="19.16" rx="1" fill="#18191d" />
                <circle cx="8" cy="36" r="3.5" fill="var(--thor-stick-ring)" />
                <circle cx="8" cy="36" r="2.5" fill="var(--thor-stick-mid)" />
                <path d="M7 43h2v2h2v2H9v2H7v-2H5v-2h2z" fill="var(--thor-control-mid)" />
                <circle cx="40" cy="33.3" r="1.2" fill="var(--thor-x-light)" />
                <circle cx="37.3" cy="36" r="1.2" fill="var(--thor-y-light)" />
                <circle cx="42.7" cy="36" r="1.2" fill="var(--thor-a-light)" />
                <circle cx="40" cy="38.7" r="1.2" fill="var(--thor-b-light)" />
                <circle cx="40" cy="46" r="3.5" fill="var(--thor-stick-ring)" />
                <circle cx="40" cy="46" r="2.5" fill="var(--thor-stick-mid)" />
              </svg>
              {label}
            </span>
            {deviceColor === id && <Check className="pointer-events-none absolute top-1 right-1 size-2.5 text-primary" aria-hidden="true" />}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
