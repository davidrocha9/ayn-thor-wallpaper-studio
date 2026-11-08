import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const baseURL = process.env.BASE_URL || 'http://127.0.0.1:5173'
let browser
before(async () => { browser = await chromium.launch({ headless: true }) })
after(async () => { await browser?.close() })

const ready = (page) => page.waitForFunction(() => document.querySelector('.control-panel')?.getAttribute('aria-busy') === 'false')

for (const [color, label, reducedMotion] of [
  ['black', 'Black', 'no-preference'],
  ['white', 'White', 'no-preference'],
  ['rainbow', 'Rainbow', 'no-preference'],
  ['clear-purple', 'Clear Purple', 'no-preference'],
  ['black', 'Black', 'reduce'],
]) {
  test(`startup shows only the saved ${color} finish (${reducedMotion}) during slow restoration`, async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    try {
      await page.goto(baseURL)
      await ready(page)
      await page.locator('input[type="file"]').setInputFiles({
        name: 'startup.svg', mimeType: 'image/svg+xml',
        buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="blue"/></svg>'),
      })
      await page.getByRole('button', { name: 'Use startup.svg', exact: true }).waitFor()
      await page.getByText(label, { exact: true }).click()
      await page.waitForFunction(() => document.querySelector('.control-panel')?.dataset.storageStatus === 'saved')
      const expectedShell = await page.locator(`.thor-color-swatch[data-device-color="${color}"]`).evaluate((el) => getComputedStyle(el).getPropertyValue('--thor-shell-light').trim())

      await page.addInitScript(() => {
        // Hold image decoding so the initial/default state has time to paint.
        const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')
        Object.defineProperty(HTMLImageElement.prototype, 'src', {
          ...descriptor,
          set(value) { setTimeout(() => descriptor.set.call(this, value), 700) },
        })
        window.startupFrames = []
        const sample = () => {
          const stage = document.querySelector('.stage-inner')
          if (stage) {
            const device = stage.querySelector('.device')
            const style = device ? getComputedStyle(device) : null
            window.startupFrames.push({
              restoring: document.querySelector('.control-panel')?.getAttribute('aria-busy') === 'true',
              height: stage.getBoundingClientRect().height,
              visible: !!style && style.visibility !== 'hidden' && Number(style.opacity) > 0,
              color: device?.dataset.deviceColor,
              shell: style?.getPropertyValue('--thor-shell-light').trim(),
            })
          }
          if (window.startupFrames.length < 200) requestAnimationFrame(sample)
        }
        requestAnimationFrame(sample)
      })
      await page.reload()
      await ready(page)
      await page.waitForTimeout(300)
      const frames = await page.evaluate(() => window.startupFrames)
      const restoring = frames.filter((frame) => frame.restoring)
      assert.ok(restoring.length >= 5, 'test exercises a slow saved-library restore')
      assert.ok(restoring.every((frame) => frame.height > 0), 'preview space remains reserved')
      assert.ok(restoring.every((frame) => !frame.visible), 'no default-colored Thor is visible while restoring')
      const painted = frames.filter((frame) => frame.visible)
      assert.ok(painted.length > 0, 'the restored preview becomes visible')
      for (const frame of painted) {
        assert.equal(frame.color, color, 'first visible frame uses the saved finish')
        assert.equal(frame.shell, expectedShell, 'startup must not transition from the default light palette')
      }
      await page.waitForFunction(() => {
        const canvas = document.querySelector('[data-screen="top"] canvas')
        return canvas?.getContext('2d').getImageData(480, 270, 1, 1).data[2] === 255
      })

      if (color === 'black' && reducedMotion === 'no-preference') {
        if (process.env.SCREENSHOT_DIR) {
          await mkdir(process.env.SCREENSHOT_DIR, { recursive: true })
          await page.waitForFunction(() => getComputedStyle(document.querySelector('.device')).opacity === '1')
          await page.screenshot({ path: join(process.env.SCREENSHOT_DIR, 'startup-restored-black.png') })
        }
        await page.getByText('White', { exact: true }).click()
        await page.waitForFunction(() => document.querySelector('.device').getAnimations().some((animation) => animation.transitionProperty === '--thor-shell-light' && animation.playState === 'running'))
        assert.equal(await page.locator('.device').getAttribute('data-device-color'), 'white', 'manual color changes still animate')
      }
      assert.deepEqual(errors, [])
    } finally { await context.close() }
  })
}

test('unavailable local storage still reveals the default Thor', async () => {
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  try {
    const page = await context.newPage()
    await page.addInitScript(() => {
      indexedDB.open = () => { throw new DOMException('Storage disabled', 'SecurityError') }
    })
    await page.goto(baseURL)
    await ready(page)
    await page.locator('.device[data-device-color="rainbow"]').waitFor({ state: 'visible' })
    assert.equal(await page.locator('.control-panel').getAttribute('data-storage-status'), 'unavailable')
  } finally { await context.close() }
})
