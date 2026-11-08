import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const baseURL = process.env.BASE_URL || 'http://127.0.0.1:5173'
let browser
before(async () => { browser = await chromium.launch({ headless: true }) })
after(async () => { await browser?.close() })
const ready = (page) => page.waitForFunction(() => document.querySelector('.control-panel')?.getAttribute('aria-busy') === 'false')
const source = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="2257">
  <rect width="1920" height="2257" fill="#3b82f6"/>
  <rect width="1920" height="1080" fill="#ef4444"/>
  <rect y="1080" width="1920" height="231" fill="#22c55e"/>
  <rect x="300" width="120" height="2257" fill="white"/>
  <rect x="1400" y="500" width="180" height="1200" fill="black"/>
</svg>`)

async function previews(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  return page.evaluate(async () => Object.fromEntries(await Promise.all(['top', 'bottom'].map(async (key) => {
    const canvas = document.querySelector(`[data-screen="${key}"] canvas`)
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
    const hash = await crypto.subtle.digest('SHA-256', data)
    return [key, [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('')]
  }))))
}

async function drag(page, key) {
  const bounds = await page.locator(`[data-screen="${key}"]`).boundingBox()
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  await page.mouse.down()
  await page.mouse.move(bounds.x + bounds.width / 2 + 18, bounds.y + bounds.height / 2 + 12, { steps: 4 })
  await page.mouse.up()
}

test('link toggle preserves the exact spanning crop, and independent gestures affect only one screen', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    await page.goto(baseURL)
    await ready(page)
    await page.locator('input[type="file"]').setInputFiles({ name: 'continuity.svg', mimeType: 'image/svg+xml', buffer: source })
    await page.getByRole('button', { name: 'Use continuity.svg', exact: true }).waitFor()
    const tools = page.locator('.control-panel')
    const link = tools.getByRole('switch', { name: 'Link screens', exact: true })
    for (const alignment of ['With screen gap', 'Without screen gap']) {
      await tools.getByRole('radio', { name: alignment, exact: true }).click()
      for (const fit of ['Cover', 'Contain', 'Stretch']) {
        await tools.getByRole('radio', { name: fit, exact: true }).click()
        await tools.getByRole('button', { name: '↻ 90°', exact: true }).click()
        await tools.getByRole('slider', { name: 'Zoom', exact: true }).focus()
        await page.keyboard.press('ArrowRight')
        await drag(page, 'top')
        const before = await previews(page)
        await link.uncheck()
        assert.deepEqual(await previews(page), before, `${alignment}/${fit}: unlink must not change either preview`)
        await link.check()
        assert.deepEqual(await previews(page), before, 'relink must not change either preview')
      }
    }
    await link.uncheck()
    let before = await previews(page)
    await drag(page, 'bottom')
    let after = await previews(page)
    assert.equal(after.top, before.top)
    assert.notEqual(after.bottom, before.bottom)
    before = after
    await page.mouse.wheel(0, -100)
    await page.waitForTimeout(100)
    after = await previews(page)
    assert.equal(after.top, before.top)
    assert.notEqual(after.bottom, before.bottom)
    await link.check()
    assert.deepEqual(await previews(page), after, 'relink retains independent adjustments')
    await drag(page, 'top')
    const movedTogether = await previews(page)
    assert.notEqual(movedTogether.top, after.top)
    assert.notEqual(movedTogether.bottom, after.bottom)
    await link.uncheck()
    assert.deepEqual(await previews(page), movedTogether)
    await page.waitForFunction(() => document.querySelector('.control-panel')?.dataset.storageStatus === 'saved')
    await page.reload()
    await ready(page)
    assert.deepEqual(await previews(page), movedTogether, 'both screen crops survive reload')
    assert.deepEqual(errors, [])
  } finally { await context.close() }
})

test('zoom enlarges the sky or landscape within its own screen without disturbing the other', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const markerBounds = (key, color) => page.evaluate(({ key, color }) => {
    const canvas = document.querySelector(`[data-screen="${key}"] canvas`)
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
    let left = canvas.width, right = -1, top = canvas.height, bottom = -1
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4
      if (color.every((c, k) => Math.abs(c - pixels[i + k]) < 3)) {
        left = Math.min(left, x); right = Math.max(right, x)
        top = Math.min(top, y); bottom = Math.max(bottom, y)
      }
    }
    return { width: right - left + 1, height: bottom - top + 1, x: (left + right) / 2, y: (top + bottom) / 2 }
  }, { key, color })
  const screenshot = async (name) => {
    if (!process.env.SCREENSHOT_DIR) return
    await mkdir(process.env.SCREENSHOT_DIR, { recursive: true })
    await page.screenshot({ path: join(process.env.SCREENSHOT_DIR, name) })
  }
  try {
    await page.goto(baseURL)
    await ready(page)
    await page.locator('input[type="file"]').setInputFiles({
      name: 'sky-and-landscape.svg', mimeType: 'image/svg+xml',
      buffer: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="2257">
        <rect width="1920" height="2257" fill="#080f45"/>
        <circle cx="960" cy="540" r="60" fill="#ffff00"/>
        <path d="M300 200h10v10h-10zM1450 650h10v10h-10zM500 800h10v10h-10z" fill="white"/>
        <path d="M0 1420L300 1120 640 1450 1100 1180 1550 1400 1920 1200V2257H0Z" fill="#164734"/>
        <path d="M0 1700L1920 1580V2257H0Z" fill="#38834e"/>
        <path d="M600 2257L800 1700H1100L1400 2257Z" fill="#a9a56c"/>
        <rect x="900" y="1724" width="120" height="120" fill="#ff0000"/>
      </svg>`),
    })
    await page.getByRole('button', { name: 'Use sky-and-landscape.svg', exact: true }).waitFor()
    const tools = page.locator('.control-panel')
    const link = tools.getByRole('switch', { name: 'Link screens', exact: true })
    const before = await previews(page)
    const moonBefore = await markerBounds('top', [255, 255, 0])
    const landscapeBefore = await markerBounds('bottom', [255, 0, 0])
    await link.uncheck()
    assert.deepEqual(await previews(page), before, 'unlink keeps the current sky/landscape split')
    await screenshot('sky-and-landscape-before.png')
    await tools.getByRole('slider', { name: 'Zoom', exact: true }).focus()
    await page.keyboard.press('End')
    const topZoomed = await previews(page)
    const moonAfter = await markerBounds('top', [255, 255, 0])
    assert.equal(topZoomed.bottom, before.bottom, 'top zoom leaves the entire bottom canvas pixel-identical')
    assert.ok(Math.abs(moonAfter.width - moonBefore.width * 4) < 10,
      `the sky detail actually gets four times larger: ${JSON.stringify({ moonBefore, moonAfter })}`)
    assert.ok(Math.abs(moonAfter.x - moonBefore.x) < 1 && Math.abs(moonAfter.y - moonBefore.y) < 1,
      `the moon stays at the top screen center: ${JSON.stringify({ moonBefore, moonAfter })}`)
    await screenshot('sky-zoomed-bottom-unchanged.png')
    const bounds = await page.locator('[data-screen="bottom"]').boundingBox()
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
    await page.mouse.wheel(0, -Math.log(2) / 0.0015)
    await tools.locator('[role="slider"][aria-valuenow="200"]').waitFor()
    const bothZoomed = await previews(page)
    const landscapeAfter = await markerBounds('bottom', [255, 0, 0])
    assert.equal(bothZoomed.top, topZoomed.top, 'bottom wheel zoom leaves the entire sky canvas pixel-identical')
    assert.ok(Math.abs(landscapeAfter.width - landscapeBefore.width * 2) < 6)
    assert.ok(Math.abs(landscapeAfter.x - landscapeBefore.x) < 1 && Math.abs(landscapeAfter.y - landscapeBefore.y) < 1,
      `landscape detail stays at the bottom screen center: ${JSON.stringify({ landscapeBefore, landscapeAfter })}`)
    await link.check()
    assert.deepEqual(await previews(page), bothZoomed, 'relink does not move either zoomed portion')
    await link.uncheck()
    await page.waitForFunction(() => document.querySelector('.control-panel')?.dataset.storageStatus === 'saved')
    await page.reload()
    await ready(page)
    assert.deepEqual(await previews(page), bothZoomed, 'local zoom origins survive reload')
    await screenshot('sky-and-landscape-independent-zoom.png')
    assert.deepEqual(errors, [])
  } finally { await context.close() }
})

for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [1024, 768], [1100, 660], [1280, 720], [1440, 900], [1920, 1080], [1280, 480]]) {
  test(`tools have no internal scrolling or clipped controls at ${width} × ${height}`, async () => {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', isMobile: width < 700, hasTouch: width < 700 })
    const page = await context.newPage()
    try {
      await page.goto(baseURL)
      await ready(page)
      await page.locator('input[type="file"]').setInputFiles({ name: 'continuity.svg', mimeType: 'image/svg+xml', buffer: source })
      await page.getByRole('button', { name: 'Use continuity.svg', exact: true }).waitFor()
      const link = page.getByRole('switch', { name: 'Link screens', exact: true })
      for (const linked of [true, false]) {
        await link.setChecked(linked)
        const dimensions = await page.evaluate(() => {
          const panel = document.querySelector('.control-panel')
          const rect = panel.getBoundingClientRect()
          const controls = [...panel.querySelectorAll('button, input:not([type="hidden"]), [role="slider"]')]
          return {
            overflow: [panel, panel.querySelector('.framing-controls')].map((el) => ({ x: el.scrollWidth - el.clientWidth, y: el.scrollHeight - el.clientHeight })),
            clipped: controls.filter((el) => {
              const r = el.getBoundingClientRect()
              return r.width > 0 && (r.x < rect.x || r.right > rect.right || r.y < rect.y || r.bottom > rect.bottom)
            }).map((el) => el.getAttribute('aria-label') ?? el.textContent),
            horizontalPageOverflow: document.documentElement.scrollWidth - innerWidth,
          }
        })
        assert.ok(dimensions.overflow.every(({ x, y }) => x <= 1 && y <= 1), JSON.stringify(dimensions))
        assert.deepEqual(dimensions.clipped, [])
        assert.ok(dimensions.horizontalPageOverflow <= 1)
      }
      if (process.env.SCREENSHOT_DIR && [390, 1440].includes(width)) {
        await mkdir(process.env.SCREENSHOT_DIR, { recursive: true })
        await page.locator('.control-panel').scrollIntoViewIfNeeded()
        await page.screenshot({ path: join(process.env.SCREENSHOT_DIR, `continuous-tools-${width}.png`) })
      }
    } finally { await context.close() }
  })
}
