import { useEffect, useEffectEvent, useRef, type PointerEvent } from 'react'

import { clamp, type Framing } from '@/lib/thor'

interface FramingGestureOptions {
  layer: Framing
  disabled: boolean
  updateFraming: (patch: Partial<Framing>) => void
  scaleX?: number
  scaleY?: number
}

/** Pan either a screen region or the whole crop canvas in shared-scene coordinates. */
export function useFramingGesture({ layer, disabled, updateFraming, scaleX = 1, scaleY = 1 }: FramingGestureOptions) {
  const ref = useRef<HTMLDivElement | null>(null)
  const panRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    originX: number
    originY: number
    factorX: number
    factorY: number
  } | null>(null)

  const onWheel = useEffectEvent((event: WheelEvent) => {
    if (disabled || event.ctrlKey || event.metaKey) return
    event.preventDefault()
    const zoom = clamp(Math.round(layer.zoom * Math.exp(-event.deltaY * 0.0015) * 100) / 100, 0.5, 4)
    if (zoom !== layer.zoom) updateFraming({ zoom })
  })

  useEffect(() => {
    const element = ref.current
    if (!element) return
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [])

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || panRef.current || event.button !== 0) return
    const rect = event.currentTarget.getBoundingClientRect()
    panRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: layer.offsetX,
      originY: layer.offsetY,
      factorX: scaleX / (rect.width || 1),
      factorY: scaleY / (rect.height || 1),
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.currentTarget.classList.add('is-dragging')
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current
    if (disabled || !pan || event.pointerId !== pan.pointerId) return
    event.preventDefault()
    const offsetX = clamp(pan.originX + (event.clientX - pan.startX) * pan.factorX, -1, 1)
    const offsetY = clamp(pan.originY + (event.clientY - pan.startY) * pan.factorY, -1, 1)
    if (Math.abs(offsetX - layer.offsetX) < 0.0004 && Math.abs(offsetY - layer.offsetY) < 0.0004) return
    updateFraming({ offsetX, offsetY })
  }

  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerId !== panRef.current?.pointerId) return
    panRef.current = null
    event.currentTarget.classList.remove('is-dragging')
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return { ref, onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd, onLostPointerCapture: onPointerEnd }
}
