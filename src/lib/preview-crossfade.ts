export const PREVIEW_CROSSFADE_MS = 220

/** Blend a frozen previous preview over the new scene; exports never use this. */
export function createPreviewCrossfade() {
  let snapshot: HTMLCanvasElement | null = null
  let startedAt = 0

  return {
    get active() { return snapshot !== null },

    capture(source: HTMLCanvasElement, now: number) {
      const next = document.createElement('canvas')
      next.width = source.width
      next.height = source.height
      const ctx = next.getContext('2d')
      if (!ctx) {
        snapshot = null
        return
      }
      // The source contains the visible blend, so rapid changes don't jump
      // back to the previous transition's target image.
      ctx.drawImage(source, 0, 0)
      snapshot = next
      startedAt = now
    },

    paint(ctx: CanvasRenderingContext2D, now: number) {
      if (!snapshot) return
      const progress = Math.max(0, (now - startedAt) / PREVIEW_CROSSFADE_MS)
      if (progress >= 1) {
        snapshot = null
        return
      }
      ctx.save()
      ctx.globalAlpha = (1 - progress) ** 3
      ctx.drawImage(snapshot, 0, 0)
      ctx.restore()
    },

    cancel() { snapshot = null },
  }
}
