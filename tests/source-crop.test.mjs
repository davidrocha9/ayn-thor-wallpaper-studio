import assert from 'node:assert/strict'
import test from 'node:test'

import { centeredCrop, moveCrop, normalizeCropRect, resizeCrop } from '../src/lib/crop.ts'
import { getSourceMedia, withSourceCrop } from '../src/lib/media.ts'
import { defaultLayer, drawScene } from '../src/lib/thor.ts'

const bounds = (rect, width, height) => {
  assert.ok(Number.isInteger(rect.x) && Number.isInteger(rect.y))
  assert.ok(Number.isInteger(rect.width) && Number.isInteger(rect.height))
  assert.ok(rect.x >= 0 && rect.y >= 0 && rect.width >= 1 && rect.height >= 1)
  assert.ok(rect.x + rect.width <= width && rect.y + rect.height <= height)
}

test('initial source selection is centered and follows the Thor aspect ratio', () => {
  for (const [width, height] of [[1200, 800], [800, 1600], [1, 1]]) {
    const rect = centeredCrop(width, height, 1920 / 2257)
    bounds(rect, width, height)
    assert.ok(Math.abs(rect.x + rect.width / 2 - width / 2) <= 1)
    assert.ok(Math.abs(rect.y + rect.height / 2 - height / 2) <= 1)
    assert.ok(Math.abs(rect.width - rect.height * 1920 / 2257) <= 1)
  }
})

test('source selections reject malformed data and clamp all edges to real pixels', () => {
  for (const value of [undefined, null, [], { x: NaN, y: 0, width: 20, height: 20 }, { x: 0, y: 0, width: Infinity, height: 20 }]) {
    assert.deepEqual(normalizeCropRect(value, 100, 80), { x: 0, y: 0, width: 100, height: 80 })
  }
  assert.deepEqual(normalizeCropRect({ x: -20, y: 90, width: 500, height: 0 }, 100, 80), { x: 0, y: 79, width: 100, height: 1 })
})

test('moving a crop never resizes it or leaves the original media', () => {
  const rect = { x: 20, y: 30, width: 40, height: 20 }
  assert.deepEqual(moveCrop(rect, 900, -900, 100, 80), { x: 60, y: 0, width: 40, height: 20 })
  assert.deepEqual(rect, { x: 20, y: 30, width: 40, height: 20 })
})

test('corner resizing preserves the opposite anchor, bounds, and optional aspect lock', () => {
  const rect = { x: 20, y: 20, width: 60, height: 40 }
  assert.deepEqual(resizeCrop(rect, 'se', 10, 15, 120, 100), { x: 20, y: 20, width: 70, height: 55 })
  assert.deepEqual(resizeCrop(rect, 'nw', -10, -5, 120, 100), { x: 10, y: 15, width: 70, height: 45 })
  for (const corner of ['nw', 'ne', 'sw', 'se']) {
    for (const delta of [-1000, -10, 0, 10, 1000]) {
      const resized = resizeCrop(rect, corner, delta, delta, 120, 100, 1.5)
      bounds(resized, 120, 100)
      assert.ok(Math.abs(resized.width - resized.height * 1.5) <= 1)
    }
  }
})

function replaceGlobal(t, name, value) {
  const original = Object.getOwnPropertyDescriptor(globalThis, name)
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value })
  t.after(() => {
    if (original) Object.defineProperty(globalThis, name, original)
    else delete globalThis[name]
  })
}

test('applying a crop preserves the original file, identity, decoded source, and playback element', (t) => {
  replaceGlobal(t, 'document', { createElement: () => ({
    getContext: () => ({ fillRect() {}, drawImage() {} }),
    toDataURL: () => 'data:image/jpeg;base64,crop',
  }) })
  const file = new File(['original'], 'scene.jpg', { type: 'image/jpeg' })
  const item = { type: 'image', animated: false, file, name: file.name, width: 1200, height: 800, el: { naturalWidth: 1200, naturalHeight: 800 }, id: 'original', url: 'blob:original', thumbUrl: 'blob:original' }
  const rect = { x: 500, y: 100, width: 300, height: 200 }
  const cropped = withSourceCrop(item, rect, false)
  assert.equal(cropped.id, item.id)
  assert.equal(cropped.file, file)
  assert.equal(cropped.name, item.name)
  assert.equal(cropped.url, item.url)
  assert.equal(cropped.el, item.el)
  assert.equal(cropped.cropAspectLocked, false)
  assert.deepEqual(cropped.sourceCrop, rect)
  assert.deepEqual([cropped.width, cropped.height], [300, 200])
  assert.deepEqual([item.width, item.height], [1200, 800])
  assert.deepEqual([getSourceMedia(cropped).width, getSourceMedia(cropped).height], [1200, 800])
  const expanded = withSourceCrop(cropped, { x: 0, y: 0, width: 1000, height: 700 }, false)
  assert.deepEqual(expanded.sourceCrop, { x: 0, y: 0, width: 1000, height: 700 })
  const restored = withSourceCrop(expanded, { x: 0, y: 0, width: 1200, height: 800 }, false)
  assert.equal(restored.sourceCrop, undefined)
  assert.equal(restored.thumbUrl, item.url)
  assert.equal(restored.file, file)
  assert.deepEqual([restored.width, restored.height], [1200, 800])
})

test('thumbnail failures cannot damage the original or prevent a reversible crop', (t) => {
  replaceGlobal(t, 'document', { createElement: () => ({ getContext: () => null }) })
  const item = { type: 'image', name: 'source.png', width: 100, height: 100, el: {}, url: 'blob:original' }
  const rect = { x: 0, y: 0, width: 50, height: 50 }
  const cropped = withSourceCrop(item, rect, false)
  assert.deepEqual(cropped.sourceCrop, rect)
  assert.equal(item.sourceCrop, undefined)
  assert.equal(item.width, 100)
})

test('animated crops reference absolute original pixels without flattening frames', (t) => {
  const draws = []
  replaceGlobal(t, 'document', { createElement: () => ({
    getContext: () => ({ fillRect() {}, drawImage: (...args) => draws.push(args) }),
    toDataURL: () => 'data:image/jpeg;base64,crop',
  }) })
  const file = new File(['animated-frames'], 'scene.gif', { type: 'image/gif' })
  const item = { type: 'image', animated: true, file, name: file.name, el: { naturalWidth: 1200, naturalHeight: 800 }, width: 400, height: 300, sourceCrop: { x: 100, y: 80, width: 400, height: 300 } }
  const cropped = withSourceCrop(item, { x: 20, y: 30, width: 200, height: 100 }, true)
  assert.equal(cropped.animated, true)
  assert.equal(cropped.el, item.el)
  assert.equal(cropped.file, file)
  assert.deepEqual(cropped.sourceCrop, { x: 20, y: 30, width: 200, height: 100 })
  assert.deepEqual(draws[0].slice(1, 5), [20, 30, 200, 100])
})

test('video rendering samples the saved source crop on every frame', () => {
  const calls = []
  const ctx = {
    canvas: { width: 1920, height: 2257 },
    setTransform() {}, fillRect() {}, save() {}, translate() {}, rotate() {}, scale() {}, restore() {},
    drawImage: (...args) => calls.push(args),
  }
  const video = { readyState: 2, videoWidth: 1920, videoHeight: 2258 }
  const item = { type: 'video', el: video, sourceCrop: { x: 400, y: 1500, width: 800, height: 600 } }
  drawScene(ctx, defaultLayer(), item)
  assert.deepEqual(calls[0], [video, 400, 1500, 800, 600, -400, -300, 800, 600])
})
