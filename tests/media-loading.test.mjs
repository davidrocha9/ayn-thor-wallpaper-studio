import assert from 'node:assert/strict'
import test from 'node:test'

import { disposeMedia, loadMedia } from '../src/lib/media.ts'

function replaceGlobal(t, name, value) {
  const original = Object.getOwnPropertyDescriptor(globalThis, name)
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value })
  t.after(() => {
    if (original) Object.defineProperty(globalThis, name, original)
    else delete globalThis[name]
  })
}

test('loaded images retain their original file and restored identity', async (t) => {
  replaceGlobal(t, 'Image', class {
    naturalWidth = 128
    naturalHeight = 64
    set src(_) { queueMicrotask(() => this.onload()) }
  })
  t.mock.method(URL, 'createObjectURL', () => 'blob:restored-image')
  const file = new File(['image bytes'], 'wallpaper.png', { type: 'image/png' })
  const item = await loadMedia(file, 'stable-saved-id')
  assert.equal(item.id, 'stable-saved-id')
  assert.equal(item.file, file)
  assert.equal(item.name, file.name)
  assert.equal(item.width, 128)
  assert.equal(item.height, 64)
})

test('failed image decoding revokes its temporary URL', async (t) => {
  replaceGlobal(t, 'Image', class {
    set src(_) { queueMicrotask(() => this.onerror()) }
  })
  t.mock.method(URL, 'createObjectURL', () => 'blob:broken-image')
  const revoke = t.mock.method(URL, 'revokeObjectURL', () => {})
  await assert.rejects(loadMedia(new File(['bad'], 'broken.png', { type: 'image/png' })), /Image failed/)
  assert.deepEqual(revoke.mock.calls.map((call) => call.arguments), [['blob:broken-image']])
})

test('failed video decoding releases the player as well as its URL', async (t) => {
  const released = []
  class BrokenVideo extends EventTarget {
    set src(_) { queueMicrotask(() => this.dispatchEvent(new Event('error'))) }
    pause() { released.push('pause') }
    removeAttribute(name) { released.push(name) }
    load() { released.push('load') }
  }
  replaceGlobal(t, 'window', { setTimeout, clearTimeout })
  replaceGlobal(t, 'document', { createElement: () => new BrokenVideo() })
  t.mock.method(URL, 'createObjectURL', () => 'blob:broken-video')
  const revoke = t.mock.method(URL, 'revokeObjectURL', () => {})
  await assert.rejects(loadMedia(new File(['bad'], 'broken.mp4', { type: 'video/mp4' })), /Video failed/)
  assert.deepEqual(released, ['pause', 'src', 'load'])
  assert.deepEqual(revoke.mock.calls.map((call) => call.arguments), [['blob:broken-video']])
})

test('disposing an image releases its URL without requiring a media player', (t) => {
  const revoke = t.mock.method(URL, 'revokeObjectURL', () => {})
  disposeMedia({ type: 'image', url: 'blob:removed-image' })
  assert.equal(revoke.mock.calls[0].arguments[0], 'blob:removed-image')
})
