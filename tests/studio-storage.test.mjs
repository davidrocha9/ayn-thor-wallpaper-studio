import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeWorkspaceSettings } from '../src/lib/studio-storage.ts'

const valid = {
  deviceColor: 'clear-purple',
  layer: { mediaId: 'saved-image', fit: 'contain', zoom: 1.75, offsetX: -0.3, offsetY: 0.4, rotation: 270, bg: '#A1B2C3' },
  stillFormat: 'jpeg', quality: 0.8, videoOutput: 'clip', clipDuration: 12, clipFps: 60, loop: false,
}

test('saved framing and export preferences round trip without changes', () => {
  assert.deepEqual(normalizeWorkspaceSettings(valid), valid)
})

test('an empty or malformed workspace gets usable defaults', () => {
  const expected = {
    deviceColor: 'rainbow',
    layer: { mediaId: null, fit: 'cover', zoom: 1, offsetX: 0, offsetY: 0, rotation: 0, bg: '#000000' },
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
    mediaId: null, fit: 'cover', zoom: 4, offsetX: -1, offsetY: 0, rotation: 0, bg: '#000000',
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
