import assert from 'node:assert/strict'
import test from 'node:test'

import { createPreviewCrossfade, PREVIEW_CROSSFADE_MS } from '../src/lib/preview-crossfade.ts'

function mockCanvas(t, available = true) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const snapshots = []
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: () => {
        const canvas = { width: 0, height: 0, frame: null }
        canvas.getContext = () => available ? {
          drawImage: (source) => { canvas.frame = source.frame },
        } : null
        snapshots.push(canvas)
        return canvas
      },
    },
  })
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'document', original)
    else delete globalThis.document
  })
  return snapshots
}

function context() {
  const draws = []
  const stack = []
  return {
    draws,
    globalAlpha: 1,
    save() { stack.push(this.globalAlpha) },
    restore() { this.globalAlpha = stack.pop() },
    drawImage(source, x, y) { draws.push({ frame: source.frame, alpha: this.globalAlpha, x, y }) },
  }
}

test('wallpaper changes fade out the previous preview over 220ms', (t) => {
  const snapshots = mockCanvas(t)
  const fade = createPreviewCrossfade()
  const ctx = context()
  assert.equal(fade.active, false)
  fade.capture({ width: 960, height: 1080, frame: 'old-image' }, 100)
  assert.equal(fade.active, true)
  assert.equal(snapshots[0].width, 960)
  assert.equal(snapshots[0].height, 1080)
  fade.paint(ctx, 100)
  assert.deepEqual(ctx.draws[0], { frame: 'old-image', alpha: 1, x: 0, y: 0 })
  fade.paint(ctx, 100 + PREVIEW_CROSSFADE_MS / 2)
  assert.equal(ctx.draws[1].alpha, 0.125)
  assert.equal(ctx.globalAlpha, 1, 'Overlay opacity must not leak into later scene rendering')
  fade.paint(ctx, 100 + PREVIEW_CROSSFADE_MS)
  assert.equal(fade.active, false)
  assert.equal(ctx.draws.length, 2, 'Completed fades must leave the new scene unobscured')
})

test('rapid wallpaper changes capture the currently visible blend', (t) => {
  mockCanvas(t)
  const fade = createPreviewCrossfade()
  const ctx = context()
  const source = { width: 960, height: 1080, frame: 'first-image' }
  fade.capture(source, 0)
  source.frame = 'currently-visible-blend'
  fade.capture(source, 80)
  source.frame = 'new-image'
  fade.paint(ctx, 80)
  assert.equal(ctx.draws[0].frame, 'currently-visible-blend')
  assert.equal(ctx.draws[0].alpha, 1)
})

test('canceling a fade immediately removes its snapshot for reduced motion', (t) => {
  mockCanvas(t)
  const fade = createPreviewCrossfade()
  const ctx = context()
  fade.capture({ width: 960, height: 1080, frame: 'old-image' }, 0)
  fade.cancel()
  fade.paint(ctx, 50)
  assert.equal(fade.active, false)
  assert.equal(ctx.draws.length, 0)
})

test('unavailable snapshot contexts skip the transition safely', (t) => {
  mockCanvas(t, false)
  const fade = createPreviewCrossfade()
  fade.capture({ width: 960, height: 1080, frame: 'old-image' }, 0)
  assert.equal(fade.active, false)
})
