import { useLayoutEffect, useRef } from 'react'

const targets = [
  { selector: '.device', scale: true },
  { selector: '.media-library', scale: false },
  { selector: '.control-panel', scale: false },
] as const

const isEntering = (element: HTMLElement) => element.getAnimations().some(
  (animation) => 'animationName' in animation && animation.playState !== 'finished',
)

/** FLIP the physical model and both panels without animating layout each frame. */
export function useWorkspaceMotion(hasVideo: boolean) {
  const ref = useRef<HTMLElement>(null)
  const previous = useRef(new Map<string, DOMRect>())
  const animations = useRef(new Map<string, Animation>())

  useLayoutEffect(() => {
    const root = ref.current
    if (!root) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    for (const { selector, scale } of targets) {
      const element = root.querySelector<HTMLElement>(selector)
      if (!element) continue
      // Hydrating a saved video must not interrupt the page-load entrance.
      if (isEntering(element)) {
        previous.current.delete(selector)
        continue
      }
      const running = animations.current.get(selector)
      const before = running?.playState === 'running'
        ? element.getBoundingClientRect()
        : previous.current.get(selector)
      running?.cancel()
      const after = element.getBoundingClientRect()
      previous.current.set(selector, after)
      if (reduced || !before || !after.width || !after.height) continue

      const x = before.x - after.x
      const y = before.y - after.y
      const scaleX = scale ? before.width / after.width : 1
      const scaleY = scale ? before.height / after.height : 1
      if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5 && Math.abs(scaleX - 1) < 0.001 && Math.abs(scaleY - 1) < 0.001) continue

      animations.current.set(selector, element.animate([
        { transformOrigin: '0 0', transform: `translate(${x}px, ${y}px) scale(${scaleX}, ${scaleY})` },
        { transformOrigin: '0 0', transform: 'none' },
      ], { duration: 520, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }))
    }
  }, [hasVideo])

  useLayoutEffect(() => {
    const reset = () => {
      for (const animation of animations.current.values()) animation.cancel()
      for (const { selector } of targets) {
        const element = ref.current?.querySelector<HTMLElement>(selector)
        if (element && !isEntering(element)) {
          previous.current.set(selector, element.getBoundingClientRect())
        } else {
          previous.current.delete(selector)
        }
      }
    }
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onPreferenceChange = () => { if (preference.matches) reset() }
    window.addEventListener('resize', reset)
    preference.addEventListener('change', onPreferenceChange)
    const activeAnimations = animations.current
    return () => {
      window.removeEventListener('resize', reset)
      preference.removeEventListener('change', onPreferenceChange)
      for (const animation of activeAnimations.values()) animation.cancel()
    }
  }, [])

  return ref
}
