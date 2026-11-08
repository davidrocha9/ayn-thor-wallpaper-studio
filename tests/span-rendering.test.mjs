import assert from 'node:assert/strict'
import test from 'node:test'

import { SCREENS, SPAN_CANVAS, defaultLayer, drawSpanRegion, getSpanLayout, getExportSceneSize, normalizeGapMm } from '../src/lib/thor.ts'

function renderCrop(key, scene, destination = SCREENS[key], layout = SPAN_CANVAS) {
  const calls = []
  const ctx = {
    canvas: { width: destination.width, height: destination.height },
    setTransform: (...args) => calls.push(['transform', ...args]),
    drawImage: (...args) => calls.push(['draw', ...args]),
  }
  drawSpanRegion(ctx, scene, key, layout)
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

test('export scenes retain enough source pixels for both native-resolution outputs', () => {
  for (const gapMm of [0, 16, 50]) {
    const layout = getSpanLayout({ ...defaultLayer(), gapMm })
    const size = getExportSceneSize(layout)
    assert.ok(Number.isInteger(size.width) && Number.isInteger(size.height))
    for (const key of ['top', 'bottom']) {
      const region = layout.regions[key]
      assert.ok(region.width * size.width / layout.width >= SCREENS[key].width)
      assert.ok(region.height * size.height / layout.height >= SCREENS[key].height)
    }
  }
  assert.deepEqual(getExportSceneSize(SPAN_CANVAS), { width: 1920, height: 2160 })
})

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.00001, `${actual} ≈ ${expected}`)

test('new workspaces use physically scaled screens with a 16 mm gap', () => {
  const layer = defaultLayer()
  const layout = getSpanLayout(layer)
  assert.equal(layer.layout, 'physical')
  assert.equal(layer.gapMm, 16)
  assert.equal(layout.width, 1920)
  assert.equal(Math.round(layout.height), 2257)
  close(layout.regions.bottom.width, 1085.2988795446297)
  close(layout.regions.bottom.height, 945.2603144420968)
  close(layout.regions.bottom.y - 1080, 231.2763433157269)
  close(layout.regions.bottom.x + layout.regions.bottom.width / 2, 960)
  close(layout.regions.bottom.y + layout.regions.bottom.height, layout.height)
})

test('physical crops preserve each screen aspect ratio and match physical scale', () => {
  const { top, bottom } = getSpanLayout(defaultLayer()).regions
  close(top.width / top.height, 1920 / 1080)
  close(bottom.width / bottom.height, 1240 / 1080)
  const topPixelsPerMm = Math.hypot(1920, 1080) / (6 * 25.4)
  const bottomPixelsPerMm = Math.hypot(1240, 1080) / (3.92 * 25.4)
  // A shared-scene square occupies equal millimeters on both real displays.
  close(100 * SCREENS.top.width / top.width / topPixelsPerMm,
    100 * SCREENS.bottom.width / bottom.width / bottomPixelsPerMm)
})

test('changing the gap moves only the bottom window and expands the scene', () => {
  const layer = defaultLayer()
  const small = getSpanLayout({ ...layer, gapMm: 0 })
  const large = getSpanLayout({ ...layer, gapMm: 25 })
  assert.deepEqual(small.regions.top, large.regions.top)
  assert.equal(small.regions.bottom.y, 1080)
  assert.equal(small.regions.bottom.width, large.regions.bottom.width)
  close(large.height - small.height, large.regions.bottom.y - small.regions.bottom.y)
  assert.ok(small.height !== SPAN_CANVAS.height, 'zero-gap physical mode is not the legacy split')
  assert.deepEqual(getSpanLayout({ ...layer, layout: 'continuous', gapMm: 50 }), SPAN_CANVAS)
})

test('physical previews and native exports sample identical normalized regions', () => {
  for (const gapMm of [0, 16, 16.5, 50]) {
    const layout = getSpanLayout({ ...defaultLayer(), gapMm })
    const preview = { width: 960, height: Math.round(layout.height / 2) }
    const native = { width: 1920, height: Math.round(layout.height) }
    for (const key of ['top', 'bottom']) {
      const a = renderCrop(key, preview, { width: 310, height: 270 }, layout)
      const b = renderCrop(key, native, SCREENS[key], layout)
      close(a[2] / preview.width, b[2] / native.width)
      close(a[3] / preview.height, b[3] / native.height)
      close(a[4] / preview.width, b[4] / native.width)
      close(a[5] / preview.height, b[5] / native.height)
      assert.deepEqual(b.slice(-4), [0, 0, SCREENS[key].width, SCREENS[key].height])
    }
  }
})

test('invalid gap values are bounded without mutating the original layer', () => {
  for (const [value, expected] of [[-5, 0], [80, 50], [Infinity, 16], [NaN, 16], [16.5, 16.5]]) {
    assert.equal(normalizeGapMm(value), expected)
    const layer = { ...defaultLayer(), gapMm: value }
    const layout = getSpanLayout(layer)
    assert.ok(Number.isFinite(layout.height) && layout.height > 0)
    assert.ok(Object.is(layer.gapMm, value))
  }
})
