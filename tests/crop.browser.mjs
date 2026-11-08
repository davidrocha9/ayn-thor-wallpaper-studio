import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

// Optional browser suite; use the same PLAYWRIGHT_MODULE / BASE_URL as responsive.browser.mjs.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const baseURL = process.env.BASE_URL || 'http://127.0.0.1:5173'
let browser
before(async () => { browser = await chromium.launch({ headless: true }) })
after(async () => { await browser?.close() })

// The yellow band represents image content behind the 16 mm hinge gap.
const calibration = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="2257">
  <rect width="1920" height="2257" fill="#0000ff"/>
  <rect width="1920" height="1080" fill="#ff0000"/>
  <rect y="1080" width="1920" height="231" fill="#ffff00"/>
</svg>`)

async function workspace(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', acceptDownloads: true, ...options })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(baseURL)
  await ready(page)
  return { context, page, errors }
}

async function ready(page) {
  await page.waitForFunction(() => document.querySelector('.control-panel')?.getAttribute('aria-busy') === 'false')
}

async function importCalibration(page) {
  await page.locator('input[type="file"]').setInputFiles({ name: 'calibration.svg', mimeType: 'image/svg+xml', buffer: calibration })
  await page.getByRole('button', { name: 'Use calibration.svg', exact: true }).waitFor()
}

async function openCrop(page, name) {
  const trigger = name
    ? page.getByRole('button', { name: `Crop ${name}`, exact: true })
    : page.getByRole('button', { name: /^Crop / }).first()
  await trigger.click()
  const dialog = page.getByRole('dialog')
  await dialog.waitFor()
  return dialog
}

async function savedWorkspace(page) {
  await page.waitForFunction(() => document.querySelector('.control-panel')?.dataset.storageStatus === 'saved')
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('thor-wallpaper-studio', 1)
      request.onsuccess = () => resolve(request.result)
      request.onerror = reject
    })
    const tx = db.transaction(['media', 'settings'], 'readonly')
    const records = tx.objectStore('media').getAll()
    const settings = tx.objectStore('settings').get('workspace')
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = reject })
    db.close()
    return {
      settings: settings.result,
      media: await Promise.all(records.result.map(async (record) => ({
        id: record.id, name: record.name, type: record.type, lastModified: record.lastModified,
        size: record.blob.size, sourceCrop: record.sourceCrop, cropAspectLocked: record.cropAspectLocked,
        text: record.type === 'image/svg+xml' ? await record.blob.text() : undefined,
      }))),
    }
  })
}

async function readSelection(dialog, width, height) {
  return dialog.locator('[data-crop-selection]').evaluate((el, { width, height }) => ({
    x: Math.round(parseFloat(el.style.left) / 100 * width),
    y: Math.round(parseFloat(el.style.top) / 100 * height),
    width: Math.round(parseFloat(el.style.width) / 100 * width),
    height: Math.round(parseFloat(el.style.height) / 100 * height),
  }), { width, height })
}

async function dragBy(page, target, dx, dy) {
  const bounds = await target.boundingBox()
  const x = bounds.x + bounds.width / 2
  const y = bounds.y + bounds.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps: 4 })
  await page.mouse.up()
}

async function setSourceSelection(page, dialog, width, height, rect) {
  await dialog.getByRole('checkbox', { name: 'Keep Thor aspect ratio' }).uncheck()
  await dialog.getByRole('button', { name: 'Restore original', exact: true }).click()
  const surface = await dialog.locator('.crop-surface').boundingBox()
  await dragBy(page, dialog.getByRole('button', { name: 'Resize crop from bottom right' }),
    (rect.width - width) * surface.width / width, (rect.height - height) * surface.height / height)
  await dragBy(page, dialog.locator('[data-crop-selection]'),
    rect.x * surface.width / width, rect.y * surface.height / height)
  assert.deepEqual(await readSelection(dialog, width, height), rect)
}

async function screenshot(page, name) {
  if (!process.env.SCREENSHOT_DIR) return
  await mkdir(process.env.SCREENSHOT_DIR, { recursive: true })
  await page.locator('[data-sonner-toast]').waitFor({ state: 'hidden', timeout: 7000 })
  await page.screenshot({ path: join(process.env.SCREENSHOT_DIR, name) })
}

async function exportDownloads(page) {
  const downloads = []
  const collect = (download) => downloads.push(download)
  page.on('download', collect)
  try {
    await page.getByRole('button', { name: 'Export both screens', exact: true }).click()
    await page.waitForFunction(() => !document.querySelector('#export-wallpapers')?.disabled)
    assert.equal(downloads.length, 2)
    return await Promise.all(downloads.map(async (download) => ({
      name: download.suggestedFilename(),
      base64: (await readFile(await download.path())).toString('base64'),
    })))
  } finally {
    page.off('download', collect)
  }
}

async function inspectOutput(page, file, video = false) {
  return page.evaluate(async ({ base64, video }) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    const url = URL.createObjectURL(new Blob([bytes]))
    try {
      const media = document.createElement(video ? 'video' : 'img')
      media.src = url
      if (video) {
        media.muted = true
        await new Promise((resolve, reject) => { media.onloadeddata = resolve; media.onerror = reject })
        await media.play()
        await new Promise((resolve) => media.requestVideoFrameCallback(resolve))
        media.pause()
      } else await media.decode()
      const width = video ? media.videoWidth : media.naturalWidth
      const height = video ? media.videoHeight : media.naturalHeight
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(media, 0, 0)
      const pixel = (x, y) => [...ctx.getImageData(x, y, 1, 1).data].slice(0, 3)
      return { width, height, pixels: [pixel(width / 2, height / 2), pixel(10, 10), pixel(width - 11, height - 11)] }
    } finally { URL.revokeObjectURL(url) }
  }, { base64: file.base64, video })
}

function assertColor(pixels, expected, tolerance = 2) {
  for (const pixel of pixels) {
    assert.ok(pixel.every((value, i) => Math.abs(value - expected[i]) <= tolerance), `${pixel} should match ${expected}`)
  }
}

test('gap UI is removed and crop actions belong only to individual library items', async () => {
  const { context, page, errors } = await workspace()
  try {
    assert.equal(await page.getByRole('button', { name: /^Crop / }).count(), 0)
    await importCalibration(page)
    const tools = page.locator('.control-panel')
    assert.equal(await tools.getByRole('button', { name: /^Crop / }).count(), 0)
    assert.equal(await tools.getByRole('spinbutton', { name: 'Screen gap (mm)' }).count(), 0)
    assert.equal(await tools.getByRole('slider', { name: 'Screen gap', exact: true }).count(), 0)
    assert.doesNotMatch(await tools.innerText(), /Source guide|Skips the hinge area|fine-tune for your device/)
    assert.equal(await page.locator('.media-tile').getByRole('button', { name: 'Crop calibration.svg', exact: true }).count(), 1)
    await tools.getByRole('radio', { name: 'Without screen gap', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('.control-panel')?.dataset.storageStatus === 'saved')
    await page.reload()
    await ready(page)
    assert.equal(await tools.getByRole('radio', { name: 'Without screen gap', exact: true }).getAttribute('aria-checked'), 'true')
    const dialog = await openCrop(page, 'calibration.svg')
    assert.equal(await dialog.getByRole('spinbutton', { name: 'Screen gap (mm)' }).count(), 0)
    assert.equal(await dialog.getByText('Screen alignment', { exact: true }).count(), 0)
    assert.equal(await dialog.getByRole('slider').count(), 0)
    assert.equal(await dialog.getByRole('spinbutton').count(), 0)
    assert.equal(await dialog.getByRole('checkbox', { name: 'Keep Thor aspect ratio' }).isChecked(), true)
    assert.doesNotMatch(await dialog.innerText(), /Drag the selection|Cropped size|Apply adds a cropped copy|X \\(px\\)|Y \\(px\\)|Width \\(px\\)|Height \\(px\\)/)
    await screenshot(page, 'crop-desktop.png')
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    await screenshot(page, 'library-crop-desktop.png')
    assert.deepEqual(errors, [])
  } finally { await context.close() }
})

test('cropping an unselected library item leaves the active wallpaper unchanged until Apply', async () => {
  const { context, page, errors } = await workspace()
  try {
    const solid = (color) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="${color}"/></svg>`)
    await page.locator('input[type="file"]').setInputFiles([
      { name: 'red.svg', mimeType: 'image/svg+xml', buffer: solid('red') },
      { name: 'blue.svg', mimeType: 'image/svg+xml', buffer: solid('blue') },
    ])
    const active = page.getByRole('button', { name: 'Use red.svg', exact: true, includeHidden: true })
    await active.waitFor()
    let dialog = await openCrop(page, 'blue.svg')
    assert.equal(await dialog.getByRole('heading', { name: 'Crop Image', exact: true }).isVisible(), true)
    assert.doesNotMatch(await dialog.innerText(), /blue\.svg|choose the part|Nothing changes/)
    assert.equal(await active.getAttribute('aria-pressed'), 'true')
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    assert.equal(await active.getAttribute('aria-pressed'), 'true')
    dialog = await openCrop(page, 'blue.svg')
    await dialog.getByRole('button', { name: 'Apply crop', exact: true }).click()
    const copy = page.getByRole('button', { name: 'Use blue.svg', exact: true })
    await copy.waitFor()
    assert.equal(await copy.getAttribute('aria-pressed'), 'true')
    assert.equal(await page.locator('.media-tile').count(), 2)
    for (const file of await exportDownloads(page)) assertColor((await inspectOutput(page, file)).pixels, [0, 0, 255])
    assert.deepEqual(errors, [])
  } finally { await context.close() }
})

test('Apply crop updates the same file, preserves settings, and restores the original after reload', async () => {
  const { context, page, errors } = await workspace()
  try {
    const source = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="600" height="800" fill="red"/><rect x="600" width="600" height="800" fill="blue"/></svg>')
    await page.locator('input[type="file"]').setInputFiles({ name: 'split.svg', mimeType: 'image/svg+xml', buffer: source })
    const tile = page.getByRole('button', { name: 'Use split.svg', exact: true })
    await tile.waitFor()
    const zoom = page.getByRole('slider', { name: 'Zoom', exact: true })
    await zoom.focus()
    await page.keyboard.press('ArrowRight')
    const before = await savedWorkspace(page)
    let dialog = await openCrop(page)
    assert.equal(await dialog.getByRole('button', { name: 'Apply crop', exact: true }).getAttribute('data-variant'), 'contrast')
    const initialSelection = await readSelection(dialog, 1200, 800)
    await setSourceSelection(page, dialog, 1200, 800, { x: 0, y: 0, width: 600, height: 800 })
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    assert.equal(await page.locator('.media-tile').count(), 1)
    assert.equal(await zoom.getAttribute('aria-valuenow'), '101', 'Cancel leaves framing untouched')
    dialog = await openCrop(page)
    assert.deepEqual(await readSelection(dialog, 1200, 800), initialSelection)
    const rect = { x: 600, y: 0, width: 600, height: 800 }
    await setSourceSelection(page, dialog, 1200, 800, rect)
    await dialog.getByRole('button', { name: 'Apply crop', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(await tile.getAttribute('aria-pressed'), 'true')
    assert.equal(await page.locator('.media-tile').count(), 1)
    assert.equal(await zoom.getAttribute('aria-valuenow'), '101', 'Apply preserves framing')
    const after = await savedWorkspace(page)
    assert.equal(after.media.length, 1)
    for (const key of ['id', 'name', 'type', 'size', 'lastModified', 'text']) assert.equal(after.media[0][key], before.media[0][key])
    assert.deepEqual(after.settings.layer, before.settings.layer)
    assert.deepEqual(after.media[0].sourceCrop, rect)
    assert.equal(after.media[0].cropAspectLocked, false)
    for (const file of await exportDownloads(page)) assertColor((await inspectOutput(page, file)).pixels, [0, 0, 255])
    await page.reload()
    await ready(page)
    dialog = await openCrop(page, 'split.svg')
    assert.deepEqual(await readSelection(dialog, 1200, 800), rect)
    assert.equal(await dialog.getByRole('checkbox', { name: 'Keep Thor aspect ratio' }).isChecked(), false)
    assert.deepEqual(await dialog.locator('canvas').evaluate((canvas) => [canvas.width, canvas.height]), [1200, 800], 'the cropper retains the entire original')
    await dialog.getByRole('button', { name: 'Restore original', exact: true }).click()
    assert.deepEqual(await readSelection(dialog, 1200, 800), { x: 0, y: 0, width: 1200, height: 800 })
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    dialog = await openCrop(page, 'split.svg')
    assert.deepEqual(await readSelection(dialog, 1200, 800), rect, 'Cancel does not apply a restoration')
    await setSourceSelection(page, dialog, 1200, 800, { x: 0, y: 0, width: 1000, height: 800 })
    await dialog.getByRole('button', { name: 'Apply crop', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    assert.deepEqual((await savedWorkspace(page)).media[0].sourceCrop, { x: 0, y: 0, width: 1000, height: 800 }, 'later crops can recover previously discarded pixels')
    dialog = await openCrop(page, 'split.svg')
    await dialog.getByRole('button', { name: 'Restore original', exact: true }).click()
    await dialog.getByRole('button', { name: 'Apply crop', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    const restored = await savedWorkspace(page)
    assert.equal(restored.media[0].sourceCrop, undefined)
    assert.equal(restored.media[0].text, before.media[0].text)
    assert.deepEqual(restored.settings.layer, before.settings.layer)
    await page.reload()
    await ready(page)
    dialog = await openCrop(page, 'split.svg')
    assert.deepEqual(await readSelection(dialog, 1200, 800), { x: 0, y: 0, width: 1200, height: 800 })
    assert.deepEqual(errors, [])
  } finally { await context.close() }
})

test('Apply crop never encodes a new image or allocates a new source URL', async () => {
  const { context, page, errors } = await workspace()
  try {
    await importCalibration(page)
    const before = await savedWorkspace(page)
    const dialog = await openCrop(page)
    await setSourceSelection(page, dialog, 1920, 2257, { x: 400, y: 100, width: 1000, height: 1000 })
    await page.evaluate(() => {
      HTMLCanvasElement.prototype.toBlob = () => { throw new Error('Must not encode a new image') }
      URL.createObjectURL = () => { throw new Error('Must not allocate a source URL') }
    })
    await dialog.getByRole('button', { name: 'Apply crop', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    const after = await savedWorkspace(page)
    assert.equal(after.media.length, 1)
    assert.equal(after.media[0].id, before.media[0].id)
    assert.deepEqual(after.media[0].sourceCrop, { x: 400, y: 100, width: 1000, height: 1000 })
    assert.deepEqual(errors, [])
  } finally { await context.close() }
})

test('a full library can crop existing media without taking another slot', async () => {
  const { context, page, errors } = await workspace()
  try {
    await page.locator('input[type="file"]').setInputFiles(Array.from({ length: 24 }, (_, i) => ({
      name: `source-${i}.svg`, mimeType: 'image/svg+xml', buffer: calibration,
    })))
    await page.getByRole('button', { name: 'Use source-0.svg', exact: true }).waitFor()
    const dialog = await openCrop(page)
    assert.equal(await dialog.getByRole('button', { name: 'Apply crop', exact: true }).isEnabled(), true)
    await setSourceSelection(page, dialog, 1920, 2257, { x: 100, y: 100, width: 1000, height: 1000 })
    await dialog.getByRole('button', { name: 'Apply crop', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    const saved = await savedWorkspace(page)
    assert.equal(saved.media.length, 24)
    assert.deepEqual(saved.media.find((item) => item.name === 'source-0.svg').sourceCrop, { x: 100, y: 100, width: 1000, height: 1000 })
    assert.deepEqual(errors, [])
  } finally { await context.close() }
})

test('physical image previews and native exports omit the hidden gap', async () => {
  const { context, page, errors } = await workspace()
  try {
    await importCalibration(page)
    await page.waitForFunction(() => {
      const ctx = document.querySelector('[data-screen="bottom"] canvas')?.getContext('2d')
      return ctx?.getImageData(300, 250, 1, 1).data[2] === 255
    })
    const files = await exportDownloads(page)
    assert.match(files[0].name, /top-1920x1080\.png$/)
    assert.match(files[1].name, /bottom-1240x1080\.png$/)
    for (const [i, file] of files.entries()) {
      const result = await inspectOutput(page, file)
      assert.deepEqual([result.width, result.height], [i ? 1240 : 1920, 1080])
      assertColor(result.pixels, i ? [0, 0, 255] : [255, 0, 0])
    }
    const screenRatio = await page.evaluate(() => {
      const top = document.querySelector('[data-screen="top"]').getBoundingClientRect()
      const bottom = document.querySelector('[data-screen="bottom"]').getBoundingClientRect()
      return bottom.width / top.width
    })
    assert.ok(Math.abs(screenRatio - 0.56526) < 0.002, 'mock displays match physical width proportions')
    assert.deepEqual(errors, [])
  } finally { await context.close() }
})

test('phone crop selection supports touch movement, corner resizing, and cancellation', async () => {
  const { context, page, errors } = await workspace({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  try {
    await importCalibration(page)
    const dialog = await openCrop(page)
    for (const [width, height] of [[390, 844], [320, 568], [844, 390]]) {
      await page.setViewportSize({ width, height })
      const bounds = await dialog.boundingBox()
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1)
      assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= height + 1)
      assert.equal(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth), true)
    }
    await page.setViewportSize({ width: 390, height: 844 })
    await setSourceSelection(page, dialog, 1920, 2257, { x: 0, y: 0, width: 1000, height: 2257 })
    await dialog.locator('.crop-surface').scrollIntoViewIfNeeded()
    await screenshot(page, 'crop-mobile.png')
    const rect = await dialog.locator('[data-crop-selection]').boundingBox()
    const client = await context.newCDPSession(page)
    const start = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 3 }
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] })
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x + 20, y: start.y + 15 }] })
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await client.detach()
    assert.ok((await readSelection(dialog, 1920, 2257)).x > 0)
    const corner = dialog.getByRole('button', { name: 'Resize crop from bottom right' })
    await corner.focus()
    await page.keyboard.press('ArrowRight')
    assert.equal((await readSelection(dialog, 1920, 2257)).width, 1001)
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).tap()
    assert.equal(await page.locator('.media-tile').count(), 1)
    await dialog.waitFor({ state: 'hidden' })
    await screenshot(page, 'library-crop-mobile.png')
    await page.getByRole('button', { name: 'Export both screens', exact: true }).tap({ trial: true })
    assert.deepEqual(errors, [])
  } finally { await context.close() }
})

test('old saved compositions restore in continuous mode until explicitly changed', async () => {
  const { context, page, errors } = await workspace()
  try {
    await page.evaluate(async () => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('thor-wallpaper-studio', 1)
        request.onsuccess = () => resolve(request.result)
        request.onerror = reject
      })
      const transaction = db.transaction('settings', 'readwrite')
      transaction.objectStore('settings').put({ layer: { mediaId: null, fit: 'stretch', zoom: 1.3, offsetX: 0.2, offsetY: -0.1, rotation: 90, bg: '#123456' } }, 'workspace')
      await new Promise((resolve, reject) => { transaction.oncomplete = resolve; transaction.onerror = reject })
      db.close()
    })
    await page.reload()
    await ready(page)
    await importCalibration(page)
    const tools = page.locator('.control-panel')
    assert.equal(await tools.getByRole('radio', { name: 'Without screen gap', exact: true }).getAttribute('aria-checked'), 'true')
    assert.equal(await tools.getByRole('radio', { name: 'Stretch', exact: true }).getAttribute('data-state'), 'on')
    assert.equal(await tools.getByRole('slider', { name: 'Zoom', exact: true }).getAttribute('aria-valuenow'), '130')
    await tools.getByText('With screen gap', { exact: true }).click()
    assert.equal(await tools.getByRole('radio', { name: 'Stretch', exact: true }).getAttribute('data-state'), 'on')
    assert.equal(await tools.getByRole('radio', { name: 'With screen gap', exact: true }).getAttribute('aria-checked'), 'true')
    assert.deepEqual(errors, [])
  } finally { await context.close() }
})

test('all fits remain available and unchanged across alignment switches and reloads', async () => {
  const { context, page, errors } = await workspace()
  try {
    await importCalibration(page)
    const tools = page.locator('.control-panel')
    for (const fit of ['Cover', 'Contain', 'Stretch']) {
      await tools.getByRole('radio', { name: fit, exact: true }).click()
      for (const [layout, label] of [['continuous', 'Without screen gap'], ['physical', 'With screen gap']]) {
        await tools.getByRole('radio', { name: label, exact: true }).click()
        for (const option of ['Cover', 'Contain', 'Stretch']) {
          assert.equal(await tools.getByRole('radio', { name: option, exact: true }).isVisible(), true)
        }
        assert.equal(await tools.getByRole('radio', { name: fit, exact: true }).getAttribute('aria-checked'), 'true')
        const saved = await savedWorkspace(page)
        assert.equal(saved.settings.layer.fit, fit.toLowerCase())
        assert.equal(saved.settings.layer.layout, layout)
        await page.reload()
        await ready(page)
        assert.equal(await tools.getByRole('radio', { name: fit, exact: true }).getAttribute('aria-checked'), 'true')
        assert.equal(await tools.getByRole('radio', { name: label, exact: true }).getAttribute('aria-checked'), 'true')
      }
    }
    await screenshot(page, 'independent-fit-alignment.png')
    assert.deepEqual(errors, [])
  } finally { await context.close() }
})

test('video crop preview, still frames, and recorded clips use the physical layout', async () => {
  const { context, page, errors } = await workspace()
  try {
    const videoBytes = await page.evaluate(async () => {
      const canvas = document.createElement('canvas')
      canvas.width = 1920
      canvas.height = 2258 // Use even dimensions for the video encoder.
      const ctx = canvas.getContext('2d')
      const paint = () => {
        ctx.fillStyle = '#0000ff'; ctx.fillRect(0, 0, 1920, 2258)
        ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, 1920, 1080)
        ctx.fillStyle = '#ffff00'; ctx.fillRect(0, 1080, 1920, 231)
      }
      const stream = canvas.captureStream(10)
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' })
      const chunks = []
      recorder.ondataavailable = (event) => chunks.push(event.data)
      const stopped = new Promise((resolve) => { recorder.onstop = resolve })
      recorder.start()
      // Paint multiple frames after recording begins; a single unchanged canvas
      // otherwise produces a near-zero-duration clip that cannot loop reliably.
      for (let frame = 0; frame < 6; frame++) {
        paint()
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
      recorder.stop()
      await stopped
      stream.getTracks().forEach((track) => track.stop())
      return [...new Uint8Array(await new Blob(chunks).arrayBuffer())]
    })
    await page.locator('input[type="file"]').setInputFiles({ name: 'calibration.webm', mimeType: 'video/webm', buffer: Buffer.from(videoBytes) })
    await page.getByRole('button', { name: 'Use calibration.webm', exact: true }).waitFor()
    await page.locator('input[type="file"]').setInputFiles({ name: 'poster.svg', mimeType: 'image/svg+xml', buffer: calibration })
    const poster = page.getByRole('button', { name: 'Use poster.svg', exact: true })
    await poster.waitFor()
    const dialog = await openCrop(page, 'calibration.webm')
    assert.equal(await dialog.getByRole('heading', { name: 'Crop Video', exact: true }).isVisible(), true)
    await page.waitForFunction(() => {
      const canvas = document.querySelector('canvas[aria-label="Original media crop preview"]')
      return canvas?.height > 0 && canvas.getContext('2d').getImageData(canvas.width / 2, canvas.height * 0.78, 1, 1).data[2] > 240
    })
    const playback = dialog.getByRole('button', { name: 'Play video', exact: true })
    await playback.click()
    await dialog.getByRole('button', { name: 'Pause video', exact: true }).waitFor()
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    assert.equal(await poster.getAttribute('aria-pressed'), 'true')
    const stills = await exportDownloads(page)
    for (const [i, file] of stills.entries()) {
      assertColor((await inspectOutput(page, file)).pixels, i ? [0, 0, 255] : [255, 0, 0], 12)
    }
    const sourceCrop = await openCrop(page, 'calibration.webm')
    await setSourceSelection(page, sourceCrop, 1920, 2258, { x: 400, y: 1500, width: 800, height: 600 })
    await sourceCrop.getByRole('button', { name: 'Apply crop', exact: true }).click()
    await sourceCrop.waitFor({ state: 'hidden' })
    assert.equal(await page.locator('.media-tile').count(), 2)
    await page.waitForFunction(() => document.querySelector('.control-panel')?.dataset.storageStatus === 'saved')
    await page.reload()
    await ready(page)
    assert.equal(await page.getByRole('button', { name: 'Use calibration.webm', exact: true }).getAttribute('aria-pressed'), 'true')
    const croppedStills = await exportDownloads(page)
    for (const file of croppedStills) assertColor((await inspectOutput(page, file)).pixels, [0, 0, 255], 12)
    await page.getByRole('button', { name: 'Export settings', exact: true }).click()
    const settings = page.getByRole('dialog')
    await settings.getByText('Live clip', { exact: true }).click()
    const duration = settings.getByRole('slider', { name: 'Clip length', exact: true })
    await duration.focus()
    await page.keyboard.press('Home')
    await settings.getByRole('button', { name: 'Done', exact: true }).click()
    const clips = await exportDownloads(page)
    for (const [i, file] of clips.entries()) {
      assert.match(file.name, /(?:top-1920|bottom-1240)x1080\.(mp4|webm)$/)
      const result = await inspectOutput(page, file, true)
      assert.deepEqual([result.width, result.height], [i ? 1240 : 1920, 1080])
      assertColor(result.pixels, [0, 0, 255], 15)
    }
    assert.deepEqual(errors, [])
  } finally { await context.close() }
})
