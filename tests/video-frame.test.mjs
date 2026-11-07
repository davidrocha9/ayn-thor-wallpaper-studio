import assert from 'node:assert/strict'
import test from 'node:test'

import { waitForVideoFrame } from '../src/lib/media.ts'

class Video extends EventTarget {
  readyState = 1
  seeking = false
  listeners = new Set()

  addEventListener(type, listener) {
    this.listeners.add(type)
    super.addEventListener(type, listener)
  }

  removeEventListener(type, listener) {
    this.listeners.delete(type)
    super.removeEventListener(type, listener)
  }
}

test('an already decoded video frame is immediately ready', async () => {
  const video = new Video()
  video.readyState = 2
  assert.equal(await waitForVideoFrame(video), true)
  assert.equal(video.listeners.size, 0)
})

test('paired exports wait for seeked after restoring the playhead', async () => {
  const video = new Video()
  video.readyState = 2
  video.seeking = true
  let resolved = false
  const ready = waitForVideoFrame(video).then(value => { resolved = true; return value })
  await Promise.resolve()
  assert.equal(resolved, false)
  video.seeking = false
  video.dispatchEvent(new Event('seeked'))
  assert.equal(await ready, true)
  assert.equal(video.listeners.size, 0)
})

test('early events do not resolve until the video has a decoded frame', async () => {
  const video = new Video()
  const ready = waitForVideoFrame(video)
  video.dispatchEvent(new Event('loadeddata'))
  assert(video.listeners.has('canplay'))
  video.readyState = 2
  video.dispatchEvent(new Event('canplay'))
  assert.equal(await ready, true)
  assert.equal(video.listeners.size, 0)
})

test('video errors return false and release listeners', async () => {
  const video = new Video()
  const ready = waitForVideoFrame(video)
  video.dispatchEvent(new Event('error'))
  assert.equal(await ready, false)
  assert.equal(video.listeners.size, 0)
})

test('a stalled video times out and releases listeners', async () => {
  const video = new Video()
  assert.equal(await waitForVideoFrame(video, 5), false)
  assert.equal(video.listeners.size, 0)
})
