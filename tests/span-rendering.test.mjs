import assert from 'node:assert/strict'
import test from 'node:test'

import { SCREENS, SPAN_CANVAS, drawSpanRegion } from '../src/lib/thor.ts'

function renderCrop(key, scene, destination = SCREENS[key]) {
  const calls = []
  const ctx = {
    canvas: { width: destination.width, height: destination.height },
    setTransform: (...args) => calls.push(['transform', ...args]),
    drawImage: (...args) => calls.push(['draw', ...args]),
  }
  drawSpanRegion(ctx, scene, key)
  assert.deepEqual(calls[0], ['transform', 1, 0, 0, 1, 0, 0])
  return calls[1]
}

test('native exports crop different halves of one shared wallpaper', () => {
  const scene = { width: 1920, height: 2160 }
  assert.deepEqual(renderCrop('top', scene), [
    'draw', scene, 0, 0, 1920, 1080, 0, 0, 1920, 1080,
  ])
  assert.deepEqual(renderCrop('bottom', scene), [
    'draw', scene, 340, 1080, 1240, 1080, 0, 0, 1240, 1080,
  ])
})

test('half-resolution previews use the same crop as native exports', () => {
  const scene = { width: 960, height: 1080 }
  assert.deepEqual(renderCrop('top', scene, { width: 960, height: 540 }), [
    'draw', scene, 0, 0, 960, 540, 0, 0, 960, 540,
  ])
  assert.deepEqual(renderCrop('bottom', scene, { width: 620, height: 540 }), [
    'draw', scene, 170, 540, 620, 540, 0, 0, 620, 540,
  ])
})

test('bottom crop stays centered and starts exactly where the top crop ends', () => {
  const { top, bottom } = SPAN_CANVAS.regions
  assert.equal(bottom.x + bottom.width / 2, SPAN_CANVAS.width / 2)
  assert.equal(top.y + top.height, bottom.y)
  assert.equal(bottom.y + bottom.height, SPAN_CANVAS.height)
  for (const [key, region] of Object.entries(SPAN_CANVAS.regions)) {
    assert.equal(region.width, SCREENS[key].width)
    assert.equal(region.height, SCREENS[key].height)
  }
})

test('crop rendering scales independently to the source and destination backing sizes', () => {
  const scene = { width: 480, height: 540 }
  assert.deepEqual(renderCrop('bottom', scene, { width: 310, height: 270 }), [
    'draw', scene, 85, 270, 310, 270, 0, 0, 310, 270,
  ])
})
