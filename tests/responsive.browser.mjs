import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

// Optional browser suite, separate from the dependency-free unit tests.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const baseURL = process.env.BASE_URL || 'http://127.0.0.1:5173'
let browser

before(async () => { browser = await chromium.launch({ headless: true }) })
after(async () => { await browser?.close() })

const sizes = [
  [320, 568], [375, 667], [390, 844], [430, 932], [600, 800],
  [768, 1024], [1024, 768], [1100, 660], [1280, 720], [1440, 900],
  [1920, 1080], [844, 390], [1280, 480],
]

test('site activates the Thor favicon and serves browser and home-screen fallbacks', async () => {
  const page = await browser.newPage()
  try {
    await page.goto(baseURL)
    const svg = page.locator('link[rel="icon"][type="image/svg+xml"]')
    assert.equal(await svg.getAttribute('sizes'), 'any')
    const svgResponse = await page.request.get(new URL(await svg.getAttribute('href'), page.url()).href)
    assert.ok(svgResponse.ok())
    const svgMarkup = await svgResponse.text()
    assert.match(svgMarkup, /<title>Thor Wallpaper Studio<\/title>/)
    const geometry = await page.evaluate((markup) => {
      const document = new DOMParser().parseFromString(markup, 'image/svg+xml')
      const dimensions = (id) => {
        const element = document.getElementById(id)
        return {
          width: Number(element.getAttribute('width')),
          height: Number(element.getAttribute('height')),
          viewBox: element.getAttribute('viewBox'),
        }
      }
      return {
        top: dimensions('thor-top-display'),
        bottom: dimensions('thor-bottom-display'),
        lid: dimensions('thor-lid'),
        base: dimensions('thor-base'),
      }
    }, svgMarkup)
    assert.equal(geometry.top.viewBox, '0 0 1920 1080')
    assert.equal(geometry.bottom.viewBox, '0 0 1240 1080')
    assert.ok(Math.abs(geometry.top.width / geometry.top.height - 16 / 9) < 0.00001, 'upper display preserves the native 16:9 ratio')
    assert.ok(Math.abs(geometry.bottom.width / geometry.bottom.height - 1240 / 1080) < 0.00001, 'lower display preserves its native ratio')
    assert.equal(geometry.lid.width, geometry.base.width, 'both device decks have the same width')
    assert.ok(Math.abs(geometry.base.width / geometry.base.height - 1.75) < 0.00001, 'base matches the Thor preview proportions')

    const ico = await page.request.get(new URL(await page.locator('link[rel="icon"]:not([type])').getAttribute('href'), page.url()).href)
    assert.ok(ico.ok())
    const icoBytes = await ico.body()
    assert.equal(icoBytes.readUInt16LE(2), 1, 'fallback is an ICO file')
    assert.equal(icoBytes.readUInt16LE(4), 3, 'fallback contains three icon sizes')
    assert.deepEqual([icoBytes[6], icoBytes[22], icoBytes[38]], [16, 32, 48])

    const appleHref = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href')
    const dimensions = await page.evaluate(async (href) => {
      const image = new Image()
      image.src = href
      await image.decode()
      return [image.naturalWidth, image.naturalHeight]
    }, appleHref)
    assert.deepEqual(dimensions, [180, 180])
  } finally {
    await page.close()
  }
})

for (const [width, height] of sizes) {
  test(`workspace fits ${width} × ${height} without clipping or overlapping`, async () => {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' })
    try {
      const page = await context.newPage()
      await page.goto(baseURL)
      await page.getByRole('button', { name: 'Import media', exact: true }).waitFor({ state: 'visible' })
      await page.waitForFunction(() => document.querySelector('.control-panel')?.getAttribute('aria-busy') === 'false')
      const layout = await page.evaluate(() => {
        const rect = (selector) => {
          const { x, y, width, height, right, bottom } = document.querySelector(selector).getBoundingClientRect()
          return { x, y, width, height, right, bottom }
        }
        return {
          viewport: innerWidth,
          content: document.documentElement.scrollWidth,
          panels: ['.media-library', '.device', '.control-panel'].map(rect),
          stage: rect('.stage-inner'),
        }
      })
      assert.ok(layout.content <= width + 1, `page overflows by ${layout.content - width}px`)
      for (const item of layout.panels) {
        assert.ok(item.x >= 0 && item.right <= width + 1, `item outside viewport: ${JSON.stringify(item)}`)
        assert.ok(item.width > 0 && item.height > 0, 'workspace items remain visible')
      }
      for (let i = 0; i < layout.panels.length; i++) {
        for (let j = i + 1; j < layout.panels.length; j++) {
          const a = layout.panels[i]
          const b = layout.panels[j]
          assert.ok(a.right <= b.x + 1 || b.right <= a.x + 1 || a.bottom <= b.y + 1 || b.bottom <= a.y + 1, 'workspace items overlap')
        }
      }
      const device = layout.panels[1]
      assert.ok(device.y >= layout.stage.y && device.bottom <= layout.stage.bottom + 1, 'device fits inside stage')
      assert.equal(await page.locator('.screen-frame').first().evaluate((element) => getComputedStyle(element).touchAction), 'pan-y', 'empty previews allow page scrolling')
      const exportButton = page.getByRole('button', { name: 'Export both screens', exact: true })
      await exportButton.scrollIntoViewIfNeeded()
      assert.ok(await exportButton.isVisible(), 'export remains reachable')
      await page.getByRole('button', { name: 'Export settings', exact: true }).click()
      const dialog = page.getByRole('dialog')
      const bounds = await dialog.boundingBox()
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1, 'dialog fits viewport width')
      assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= height + 1, 'dialog fits viewport height')
      await dialog.getByRole('button', { name: 'Done', exact: true }).click()
    } finally {
      await context.close()
    }
  })
}

test('library displays six entries per page and fills the desktop panel', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  try {
    const page = await context.newPage()
    await page.goto(baseURL)
    await page.waitForFunction(() => document.querySelector('.control-panel')?.getAttribute('aria-busy') === 'false')
    const image = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="1000"><rect width="600" height="1000" fill="#5897a8"/></svg>')
    await page.locator('input[type="file"]').setInputFiles(Array.from({ length: 7 }, (_, i) => ({ name: `grid-${i}.svg`, mimeType: 'image/svg+xml', buffer: image })))
    await page.getByRole('button', { name: 'Use grid-5.svg', exact: true }).waitFor()
    assert.equal(await page.locator('.media-tile').count(), 6)
    assert.equal(await page.locator('.media-library [aria-live="polite"]').textContent(), '1 / 2')

    for (const [width, height] of [[1440, 900], [1100, 660], [1280, 480], [320, 568], [768, 1024]]) {
      await page.setViewportSize({ width, height })
      const layout = await page.locator('.media-library').evaluate((library) => {
        const bounds = library.getBoundingClientRect()
        const grid = library.querySelector('.media-items')
        const tiles = [...grid.children].map((tile) => tile.getBoundingClientRect())
        const last = tiles.at(-1)
        const gridBounds = grid.getBoundingClientRect()
        const thumbnail = grid.querySelector('.media-thumbnail').getBoundingClientRect()
        return {
          thumbnailRatio: thumbnail.width / thumbnail.height,
          contained: tiles.every((tile) => tile.top >= bounds.top && tile.bottom <= bounds.bottom && tile.left >= bounds.left && tile.right <= bounds.right),
          bottomGap: gridBounds.bottom - last.bottom,
          columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
          rows: getComputedStyle(grid).gridTemplateRows.split(' ').length,
          footerTop: library.lastElementChild.getBoundingClientRect().top,
          gridBottom: gridBounds.bottom,
        }
      })
      assert.ok(layout.contained, `all six entries fit the panel at ${width}px`)
      assert.ok(layout.gridBottom <= layout.footerTop + 1, 'pagination does not overlap thumbnails')
      assert.ok(Math.abs(layout.bottomGap - 16) < 1, 'last row fills the grid down to its bottom padding')
      assert.equal(layout.columns, width >= 700 && width < 1100 ? 3 : 2)
      assert.equal(layout.rows, width >= 700 && width < 1100 ? 2 : 3)
      if (width < 1100) assert.ok(Math.abs(layout.thumbnailRatio - 16 / 9) < 0.02, 'mobile and tablet thumbnails stay compact even for portrait media')
    }

    await page.getByRole('button', { name: 'Next media page' }).click()
    assert.equal(await page.locator('.media-tile').count(), 1)
    await page.getByRole('button', { name: 'Remove grid-6.svg from library', exact: true }).click()
    await page.getByRole('button', { name: 'Use grid-5.svg', exact: true }).waitFor()
    assert.equal(await page.locator('.media-tile').count(), 6, 'removing the final-page entry returns to the full first page')
    assert.equal(await page.getByRole('button', { name: 'Next media page' }).count(), 0, 'six entries need no pagination')
  } finally {
    await context.close()
  }
})

test('phone entrance animations do not introduce horizontal scrolling', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  try {
    const page = await context.newPage()
    await page.goto(baseURL)
    const overflow = await page.evaluate(async () => {
      let maximum = 0
      const start = performance.now()
      while (performance.now() - start < 900) {
        maximum = Math.max(maximum, document.documentElement.scrollWidth - innerWidth)
        await new Promise(requestAnimationFrame)
      }
      return maximum
    })
    assert.equal(overflow, 0)
  } finally {
    await context.close()
  }
})

test('touch workspace supports a populated library, framing, and export', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce', acceptDownloads: true })
  try {
    const page = await context.newPage()
    await page.goto(baseURL)
    await page.waitForFunction(() => document.querySelector('.control-panel')?.getAttribute('aria-busy') === 'false')
    const image = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1600"><rect width="900" height="1600" fill="#5897a8"/><circle cx="450" cy="800" r="240" fill="#f5c66d"/></svg>')
    await page.locator('input[type="file"]').setInputFiles(Array.from({ length: 7 }, (_, i) => ({ name: `wallpaper-${i}.svg`, mimeType: 'image/svg+xml', buffer: image })))
    const first = page.getByRole('button', { name: 'Use wallpaper-0.svg', exact: true })
    await first.waitFor()
    await page.getByRole('button', { name: 'Next media page' }).tap()
    await page.getByRole('button', { name: 'Use wallpaper-6.svg', exact: true }).tap()
    await page.getByRole('button', { name: 'Previous media page' }).tap()
    await first.tap()
    assert.equal(await first.getAttribute('aria-pressed'), 'true')

    const touchAction = await page.locator('.screen-frame').first().evaluate((element) => getComputedStyle(element).touchAction)
    assert.equal(touchAction, 'none', 'loaded screens accept touch panning')
    const screen = page.locator('[data-screen="top"]')
    await screen.scrollIntoViewIfNeeded()
    const screenBounds = await screen.boundingBox()
    const client = await context.newCDPSession(page)
    const start = { x: screenBounds.x + screenBounds.width / 2, y: screenBounds.y + screenBounds.height / 2 }
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] })
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x + 24, y: start.y + 16 }] })
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    assert.ok(Number(await page.getByRole('slider', { name: 'X position', exact: true }).getAttribute('aria-valuenow')) > 0, 'touch drag changes shared framing')
    assert.ok(!(await screen.getAttribute('class')).includes('is-dragging'), 'touch release ends panning')
    await client.detach()
    const zoom = page.getByRole('slider', { name: 'Zoom', exact: true })
    await zoom.scrollIntoViewIfNeeded()
    await zoom.focus()
    await page.keyboard.press('ArrowRight')
    assert.equal(await zoom.getAttribute('aria-valuenow'), '101')
    const black = page.getByRole('radio', { name: 'Black', exact: true })
    await black.locator('..').tap()
    assert.ok(await black.isChecked())
    assert.equal(await page.locator('.device').getAttribute('data-device-color'), 'black')
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'populated workspace fits phone')
    const downloads = []
    page.on('download', (download) => downloads.push(download))
    await page.getByRole('button', { name: 'Export both screens', exact: true }).tap()
    await page.waitForFunction(() => document.querySelector('#export-wallpapers')?.textContent.includes('Export both screens'))
    assert.equal(downloads.length, 2, 'both native-resolution wallpapers download')
    assert.match(downloads[0].suggestedFilename(), /top-1920x1080\.png$/)
    assert.match(downloads[1].suggestedFilename(), /bottom-1240x1080\.png$/)

    for (const width of [320, 768, 1100, 1440, 390]) {
      await page.setViewportSize({ width, height: 844 })
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `populated workspace fits after resizing to ${width}px`)
      assert.equal(await zoom.getAttribute('aria-valuenow'), '101', 'resizing preserves framing')
      assert.equal(await page.locator('.device').getAttribute('data-device-color'), 'black', 'resizing preserves device color')
      const targetSizes = await page.locator('button[data-slot="button"]').evaluateAll((buttons) => buttons.map((button) => {
        const { width, height } = button.getBoundingClientRect()
        return { width, height }
      }))
      assert.ok(targetSizes.every(({ width, height }) => width >= 44 && height >= 44), 'touch buttons have at least 44px targets')
    }
  } finally {
    await context.close()
  }
})
