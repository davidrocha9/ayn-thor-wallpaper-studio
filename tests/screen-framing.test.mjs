import assert from 'node:assert/strict'
import test from 'node:test'

import { defaultLayer, getScreenFraming, patchScreenFraming, setScreensLinked } from '../src/lib/thor.ts'
import { normalizeWorkspaceSettings } from '../src/lib/studio-storage.ts'

test('linked edits from either screen update the shared composition', () => {
  for (const key of ['top', 'bottom']) {
    const layer = patchScreenFraming(defaultLayer(), { zoom: 2, offsetX: 0.3 }, key)
    assert.equal(layer.zoom, 2)
    assert.equal(getScreenFraming(layer, 'top'), getScreenFraming(layer, 'bottom'))
    assert.equal(layer.screenFraming, null)
  }
})

test('unlinking initializes separate settings without mutating shared framing', () => {
  const shared = { ...defaultLayer(), zoom: 1.7, rotation: 90, offsetY: 0.2 }
  const separate = setScreensLinked(shared, false)
  assert.equal(shared.linked, true)
  assert.equal(shared.screenFraming, null)
  assert.deepEqual(separate.screenFraming.top, separate.screenFraming.bottom)
  assert.notEqual(separate.screenFraming.top, separate.screenFraming.bottom)
  assert.equal(separate.screenFraming.top.zoom, 1.7)
  assert.equal(separate.screenFraming.top.rotation, 90)
  assert.equal(separate.screenFraming.top.offsetY, 0.2)
})

test('all per-screen tools affect only the requested screen', () => {
  const initial = setScreensLinked(defaultLayer(), false)
  const patch = { zoom: 2, fit: 'contain', rotation: 270, offsetX: -0.3, offsetY: 0.4, bg: '#123456' }
  for (const key of ['top', 'bottom']) {
    const updated = patchScreenFraming(initial, patch, key)
    const { zoomOffsetX: _x, zoomOffsetY: _y, ...framing } = getScreenFraming(updated, key)
    assert.deepEqual(framing, patch)
    const other = key === 'top' ? 'bottom' : 'top'
    assert.deepEqual(getScreenFraming(updated, other), getScreenFraming(initial, other))
    assert.equal(updated.zoom, 1, 'shared settings stay intact')
    assert.equal(initial.screenFraming[key].zoom, 1, 'updates are immutable')
  }
})

test('toggling only changes the editing mode, not either screen crop', () => {
  let layer = setScreensLinked({ ...defaultLayer(), zoom: 1.5 }, false)
  layer = patchScreenFraming(layer, { zoom: 2, fit: 'stretch' }, 'top')
  layer = patchScreenFraming(layer, { zoom: 0.7, rotation: 180 }, 'bottom')
  const separate = structuredClone(layer.screenFraming)
  for (const linked of [true, false, true]) {
    layer = setScreensLinked(layer, linked)
    assert.deepEqual(layer.screenFraming, separate)
    assert.deepEqual(getScreenFraming(layer, 'top'), separate.top)
    assert.deepEqual(getScreenFraming(layer, 'bottom'), separate.bottom)
    assert.deepEqual(normalizeWorkspaceSettings({ layer }).layer, layer)
  }
})

test('linked edits preserve relative independent adjustments', () => {
  let layer = setScreensLinked(defaultLayer(), false)
  layer = patchScreenFraming(layer, { zoom: 2, offsetX: 0.2, offsetY: -0.3, rotation: 270 }, 'bottom')
  layer = setScreensLinked(layer, true)
  layer = patchScreenFraming(layer, { zoom: 1.5, offsetX: 0.1, offsetY: 0.1, rotation: 90 }, 'top')
  assert.equal(layer.screenFraming.top.zoom, 1.5)
  assert.equal(layer.screenFraming.bottom.zoom, 3)
  assert.ok(Math.abs(layer.screenFraming.bottom.offsetX - 0.3) < 1e-12)
  assert.ok(Math.abs(layer.screenFraming.bottom.offsetY + 0.2) < 1e-12)
  assert.equal(layer.screenFraming.bottom.rotation, 0)
  assert.deepEqual(normalizeWorkspaceSettings({ layer }).layer, layer)
})

test('linked edits keep identical frames numerically identical', () => {
  let layer = setScreensLinked({ ...defaultLayer(), zoom: 0.7, offsetX: 0.10529522880994456 }, false)
  layer = patchScreenFraming(setScreensLinked(layer, true), { zoom: 3, offsetX: 0.2 }, 'bottom')
  assert.equal(layer.screenFraming.top.zoom, 3)
  assert.equal(layer.screenFraming.bottom.zoom, 3)
  assert.equal(layer.screenFraming.top.offsetX, 0.2)
  assert.equal(layer.screenFraming.bottom.offsetX, 0.2)
})

test('pre-toggle workspaces restore as linked without changing framing', () => {
  const { linked: _linked, screenFraming: _screenFraming, ...legacy } = { ...defaultLayer(), zoom: 1.6 }
  const restored = normalizeWorkspaceSettings({ layer: legacy }).layer
  assert.equal(restored.linked, true)
  assert.equal(restored.screenFraming, null)
  assert.equal(restored.zoom, 1.6)
})

test('corrupt independent framing is normalized and missing screens get safe fallbacks', () => {
  const layer = normalizeWorkspaceSettings({ layer: {
    ...defaultLayer(), linked: false, zoom: 1.5,
    screenFraming: { top: { zoom: Infinity, fit: 'tile', offsetX: 5, rotation: 45, bg: 'red' }, bottom: null },
  } }).layer
  assert.equal(layer.screenFraming.top.zoom, 1.5)
  assert.equal(layer.screenFraming.top.fit, 'cover')
  assert.equal(layer.screenFraming.top.offsetX, 1)
  assert.equal(layer.screenFraming.top.rotation, 0)
  assert.equal(layer.screenFraming.top.bg, '#000000')
  assert.equal(layer.screenFraming.bottom.zoom, 1.5)
  assert.equal(normalizeWorkspaceSettings({ layer: { linked: false } }).layer.screenFraming.top.zoom, 1)
})
