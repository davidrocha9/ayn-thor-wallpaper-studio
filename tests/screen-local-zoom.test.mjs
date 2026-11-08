import assert from 'node:assert/strict'
import test from 'node:test'

import { defaultLayer, getScreenFraming, getSpanLayout, patchScreenFraming, setScreensLinked } from '../src/lib/thor.ts'
import { normalizeWorkspaceSettings } from '../src/lib/studio-storage.ts'

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} should equal ${expected}`)

for (const key of ['top', 'bottom']) {
  test(`independent ${key} zoom magnifies the current portion around that screen's center`, () => {
    for (const layout of ['physical', 'continuous']) {
      for (const fit of ['cover', 'contain', 'stretch']) {
        for (const rotation of [0, 90, 180, 270]) {
          const initial = setScreensLinked({ ...defaultLayer(), layout, fit, rotation, zoom: 0.5, offsetX: 0.3, offsetY: -0.2 }, false)
          const scene = getSpanLayout(initial)
          const region = scene.regions[key]
          const pivot = {
            x: (region.x + region.width / 2) / scene.width - 0.5,
            y: (region.y + region.height / 2) / scene.height - 0.5,
          }
          const before = getScreenFraming(initial, key)
          let layer = initial
          for (const zoom of [1, 2, 4, 0.5]) {
            layer = patchScreenFraming(layer, { zoom }, key)
            const after = getScreenFraming(layer, key)
            // The source point under the screen center must stay under it.
            close((pivot.x - after.offsetX - after.zoomOffsetX) / after.zoom, (pivot.x - before.offsetX) / before.zoom)
            close((pivot.y - after.offsetY - after.zoomOffsetY) / after.zoom, (pivot.y - before.offsetY) / before.zoom)
            const other = key === 'top' ? 'bottom' : 'top'
            assert.deepEqual(getScreenFraming(layer, other), getScreenFraming(initial, other))
            assert.equal(after.offsetX, before.offsetX, 'automatic anchoring does not consume manual panning range')
            assert.equal(after.offsetY, before.offsetY)
            assert.deepEqual(normalizeWorkspaceSettings({ layer }).layer, layer, 'local anchor survives reload')
          }
          close(layer.screenFraming[key].zoomOffsetX, 0)
          close(layer.screenFraming[key].zoomOffsetY, 0)
        }
      }
    }
  })
}

test('re-linking and unlinking preserve an independently zoomed sky and landscape', () => {
  let layer = setScreensLinked(defaultLayer(), false)
  layer = patchScreenFraming(layer, { zoom: 2 }, 'top')
  layer = patchScreenFraming(layer, { zoom: 1.5 }, 'bottom')
  const frames = structuredClone(layer.screenFraming)
  for (const linked of [true, false, true]) {
    layer = setScreensLinked(layer, linked)
    assert.deepEqual(layer.screenFraming, frames)
  }
})

test('malformed saved zoom anchors cannot inject NaN or infinity into rendering', () => {
  const layer = normalizeWorkspaceSettings({ layer: {
    ...defaultLayer(), linked: false,
    screenFraming: { top: { zoomOffsetX: NaN, zoomOffsetY: Infinity }, bottom: { zoomOffsetX: '0.5', zoomOffsetY: 1e100 } },
  } }).layer
  assert.equal(layer.screenFraming.top.zoomOffsetX, 0)
  assert.equal(layer.screenFraming.top.zoomOffsetY, 0)
  assert.equal(layer.screenFraming.bottom.zoomOffsetX, 0)
  assert.equal(layer.screenFraming.bottom.zoomOffsetY, 1000)
})
