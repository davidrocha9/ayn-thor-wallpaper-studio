import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'

import { useStudioContext } from '@/components/studio-context'
import { SCREENS, SPAN_CANVAS, clamp, type ScreenKey } from '@/lib/thor'
import { cn } from '@/lib/utils'

interface ScreenFrameProps {
  screenKey: ScreenKey
  className?: string
}

interface PanState {
  pointerId: number
  startX: number
  startY: number
  originX: number
  originY: number
  width: number
  height: number
}

export function ScreenFrame({ screenKey, className }: ScreenFrameProps) {
  const { layer, hasMedia, canvasRefs, updateFraming } = useStudioContext()
  const canvasRef = canvasRefs[screenKey]
  const panRef = useRef<PanState | null>(null)

  // Live values for the native (non-passive) wheel listener.
  const wheelRef = useRef({ layer, updateFraming })
  wheelRef.current = { layer, updateFraming }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const onWheel = (event: WheelEvent) => {
      const live = wheelRef.current
      const current = live.layer
      if (!current.mediaId) return
      event.preventDefault()
      const factor = Math.exp(-event.deltaY * 0.0015)
      const next = clamp(Math.round(current.zoom * factor * 100) / 100, 0.5, 4)
      if (next === current.zoom) return
      live.updateFraming({ zoom: next })
    }

    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [canvasRef])

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!hasMedia || panRef.current) return
    if (event.button !== 0) return

    const rect = event.currentTarget.getBoundingClientRect()
    panRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: layer.offsetX,
      originY: layer.offsetY,
      width: rect.width || 1,
      height: rect.height || 1,
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      /* ignore */
    }
    event.currentTarget.classList.add('is-dragging')
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pan = panRef.current
    if (!pan || event.pointerId !== pan.pointerId) return
    event.preventDefault()

    // Convert movement in either display to fractions of the shared layout.
    const region = SPAN_CANVAS.regions[screenKey]
    const dx = ((event.clientX - pan.startX) / pan.width) * (region.width / SPAN_CANVAS.width)
    const dy = ((event.clientY - pan.startY) / pan.height) * (region.height / SPAN_CANVAS.height)
    const nextX = clamp(pan.originX + dx, -1, 1)
    const nextY = clamp(pan.originY + dy, -1, 1)

    if (
      Math.abs(nextX - layer.offsetX) < 0.0004 &&
      Math.abs(nextY - layer.offsetY) < 0.0004
    ) {
      return
    }
    updateFraming({ offsetX: nextX, offsetY: nextY })
  }

  const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pan = panRef.current
    if (!pan) return
    if (event.pointerId !== pan.pointerId) return
    try {
      event.currentTarget.releasePointerCapture(pan.pointerId)
    } catch {
      /* ignore */
    }
    event.currentTarget.classList.remove('is-dragging')
    panRef.current = null
  }

  return (
    <div
      data-screen={screenKey}
      className={cn(
        'screen-frame',
        hasMedia && 'has-media',
        screenKey === 'top' ? 'aspect-[16/9]' : 'aspect-[1240/1080] w-full',
        className,
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onLostPointerCapture={handlePointerEnd}
    >
      <canvas
        ref={canvasRef}
        width={screenKey === 'top' ? 960 : 620}
        height={540}
        aria-label={`${SCREENS[screenKey].label} screen preview`}
      />
      <div className="screen-glass" />
    </div>
  )
}
