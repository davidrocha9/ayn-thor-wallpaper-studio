import { useRef, type KeyboardEvent, type PointerEvent } from 'react'

import { moveCrop, resizeCrop, type CropCorner, type CropRect } from '@/lib/crop'

interface CropSelectionOptions {
  selection: CropRect
  width: number
  height: number
  ratio?: number
  disabled: boolean
  onChange: (selection: CropRect) => void
}

export function useCropSelection({ selection, width, height, ratio, disabled, onChange }: CropSelectionOptions) {
  const drag = useRef<{
    pointerId: number
    corner?: CropCorner
    selection: CropRect
    x: number
    y: number
    scaleX: number
    scaleY: number
  } | null>(null)

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || event.button !== 0 || drag.current) return
    const target = event.target as HTMLElement
    if (!target.closest('[data-crop-selection]')) return
    const corner = target.closest<HTMLElement>('[data-crop-corner]')?.dataset.cropCorner as CropCorner | undefined
    const bounds = event.currentTarget.getBoundingClientRect()
    drag.current = {
      pointerId: event.pointerId, corner, selection,
      x: event.clientX, y: event.clientY,
      scaleX: width / bounds.width, scaleY: height / bounds.height,
    }
    event.preventDefault()
    target.closest<HTMLElement>('[data-crop-corner], [data-crop-selection]')?.focus({ preventScroll: true })
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const active = drag.current
    if (disabled || !active || event.pointerId !== active.pointerId) return
    const dx = (event.clientX - active.x) * active.scaleX
    const dy = (event.clientY - active.y) * active.scaleY
    const next = active.corner
      ? resizeCrop(active.selection, active.corner, dx, dy, width, height, ratio)
      : moveCrop(active.selection, dx, dy, width, height)
    onChange(next)
  }

  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerId !== drag.current?.pointerId) return
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLElement>, corner?: CropCorner) => {
    if (disabled) return
    const step = event.shiftKey ? 10 : 1
    const deltas: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
    }
    const delta = deltas[event.key]
    if (!delta) return
    event.preventDefault()
    event.stopPropagation()
    onChange(corner
      ? resizeCrop(selection, corner, ...delta, width, height, ratio)
      : moveCrop(selection, ...delta, width, height))
  }

  return { surface: { onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd, onLostPointerCapture: onPointerEnd }, onKeyDown }
}
