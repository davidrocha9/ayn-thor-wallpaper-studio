import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export function Section({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn('border-b border-border py-5 first:pt-0 last:border-b-0 last:pb-0', className)}>
      {children}
    </section>
  )
}

export function SectionHead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2.5">
      <h2 className="m-0 text-xs font-semibold text-foreground">
        {title}
      </h2>
      {children}
    </div>
  )
}

export function FieldTop({
  label,
  value,
  htmlFor,
  children,
}: {
  label: string
  value?: ReactNode
  htmlFor?: string
  children?: ReactNode
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <label htmlFor={htmlFor} className="text-xs font-medium text-foreground">
        {label}
      </label>
      {value !== undefined && (
        <span className="text-[11px] text-muted-foreground tabular-nums">{value}</span>
      )}
      {children}
    </div>
  )
}

export function Field({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={cn('mt-2.5 first:mt-0', className)}>{children}</div>
}

export const hintClass = 'mt-2 text-[11px] leading-relaxed text-muted-foreground'
export const noteClass = 'mt-3 text-[11px] leading-relaxed text-muted-foreground'
