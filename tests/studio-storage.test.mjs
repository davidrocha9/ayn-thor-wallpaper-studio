import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeWorkspaceSettings } from '../src/lib/studio-storage.ts'

const valid = {
  deviceColor: 'clear-purple',
  layer: { layout: 'physical', gapMm: 16, mediaId: 'saved-image', fit: 'contain', zoom: 1.75, offsetX: -0.3, offsetY: 0.4, rotation: 270, bg: '#A1B2C3' },
  stillFormat: 'jpeg', quality: 0.8, videoOutput: 'clip', clipDuration: 12, clipFps: 60, loop: false,
}

test('saved framing and export preferences round trip without changes', () => {
  assert.deepEqual(normalizeWorkspaceSettings(valid), valid)
})

test('an empty or malformed workspace gets usable defaults', () => {
  const expected = {
    deviceColor: 'rainbow',
    layer: { layout: 'physical', gapMm: 16, mediaId: null, fit: 'cover', zoom: 1, offsetX: 0, offsetY: 0, rotation: 0, bg: '#000000' },
    stillFormat: 'png', quality: 0.92, videoOutput: 'still', clipDuration: 6, clipFps: 30, loop: true,
  }
  for (const value of [undefined, null, false, 42, 'invalid', {}]) {
    assert.deepEqual(normalizeWorkspaceSettings(value), expected)
  }
})

test('out-of-range and non-finite stored settings cannot break the canvas', () => {
  const settings = normalizeWorkspaceSettings({
    layer: { mediaId: 9, fit: 'tile', zoom: 100, offsetX: -4, offsetY: NaN, rotation: 45, bg: 'red' },
    quality: -1, clipDuration: Infinity, clipFps: 120, loop: 'false', stillFormat: 'svg', videoOutput: 'invalid',
  })
  assert.deepEqual(settings.layer, {
    layout: 'continuous', gapMm: 16, mediaId: null, fit: 'cover', zoom: 4, offsetX: -1, offsetY: 0, rotation: 0, bg: '#000000',
  })
  assert.equal(settings.quality, 0.5)
  assert.equal(settings.clipDuration, 6)
  assert.equal(settings.clipFps, 30)
  assert.equal(settings.loop, true)
  assert.equal(settings.stillFormat, 'png')
  assert.equal(settings.videoOutput, 'still')
})

test('all four device colors round trip without changing wallpaper settings', () => {
  for (const deviceColor of ['black', 'white', 'rainbow', 'clear-purple']) {
    const saved = { ...valid, deviceColor }
    assert.deepEqual(normalizeWorkspaceSettings(saved), saved)
  }
})

test('older workspaces and unknown device colors retain the original rainbow finish', () => {
  for (const deviceColor of [undefined, null, 'purple', '', 42, {}, ['black']]) {
    assert.equal(normalizeWorkspaceSettings({ ...valid, deviceColor }).deviceColor, 'rainbow')
  }
})

test('settings normalization does not mutate data read from IndexedDB', () => {
  const original = structuredClone(valid)
  normalizeWorkspaceSettings(original)
  assert.deepEqual(original, valid)
})

test('pre-feature workspaces retain every framing value in continuous mode', () => {
  const { layout: _layout, gapMm: _gapMm, ...legacyLayer } = valid.layer
  const legacy = { ...valid, layer: { ...legacyLayer, fit: 'stretch' } }
  const normalized = normalizeWorkspaceSettings(legacy)
  assert.deepEqual(normalized.layer, { ...legacy.layer, layout: 'continuous', gapMm: 16 })
  assert.deepEqual(normalizeWorkspaceSettings(normalized), normalized, 'migration is idempotent')
  assert.ok(!('layout' in legacy.layer), 'migration does not modify stored input')
})

test('both layouts and custom gap settings survive a save-and-restore round trip', () => {
  for (const layout of ['physical', 'continuous']) {
    for (const gapMm of [0, 16, 23.5, 50]) {
      const saved = { ...valid, layer: { ...valid.layer, layout, gapMm } }
      assert.deepEqual(normalizeWorkspaceSettings(saved), saved)
    }
  }
})

test('every fit survives restoration independently of alignment', () => {
  for (const layout of ['physical', 'continuous']) {
    for (const fit of ['cover', 'contain', 'stretch']) {
      const saved = { ...valid, layer: { ...valid.layer, layout, fit } }
      assert.deepEqual(normalizeWorkspaceSettings(saved), saved)
    }
  }
})

test('corrupt gap and layout settings cannot expand the canvas without bounds', () => {
  for (const [gapMm, expected] of [[-1, 0], [500, 50], [NaN, 16], [Infinity, 16], ['20', 16], [null, 16]]) {
    const settings = normalizeWorkspaceSettings({ layer: { layout: 'physical', gapMm, fit: 'stretch' } })
    assert.equal(settings.layer.layout, 'physical')
    assert.equal(settings.layer.gapMm, expected)
    assert.equal(settings.layer.fit, 'stretch', 'gap normalization does not change fit')
  }
  assert.equal(normalizeWorkspaceSettings({ layer: { layout: 'unknown' } }).layer.layout, 'continuous')
})
