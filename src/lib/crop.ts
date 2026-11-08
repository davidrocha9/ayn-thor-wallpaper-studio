export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

export type CropCorner = 'nw' | 'ne' | 'sw' | 'se'

const bound = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

/** Integer source pixels, always within the decoded media's bounds. */
export function normalizeCropRect(value: unknown, width: number, height: number): CropRect {
  const full = { x: 0, y: 0, width, height }
  if (typeof value !== 'object' || value === null) return full
  const rect = value as Record<string, unknown>
  if (!['x', 'y', 'width', 'height'].every((key) => typeof rect[key] === 'number' && Number.isFinite(rect[key]))) return full
  const x = bound(Math.round(rect.x as number), 0, width - 1)
  const y = bound(Math.round(rect.y as number), 0, height - 1)
  return {
    x,
    y,
    width: bound(Math.round(rect.width as number), 1, width - x),
    height: bound(Math.round(rect.height as number), 1, height - y),
  }
}

export function centeredCrop(width: number, height: number, ratio: number): CropRect {
  const cropWidth = Math.min(width, height * ratio)
  const cropHeight = cropWidth / ratio
  return normalizeCropRect({ x: (width - cropWidth) / 2, y: (height - cropHeight) / 2, width: cropWidth, height: cropHeight }, width, height)
}

export function moveCrop(rect: CropRect, dx: number, dy: number, width: number, height: number): CropRect {
  return {
    ...rect,
    x: bound(Math.round(rect.x + dx), 0, width - rect.width),
    y: bound(Math.round(rect.y + dy), 0, height - rect.height),
  }
}

/** Resize from one corner, keeping the opposite corner anchored. */
export function resizeCrop(rect: CropRect, corner: CropCorner, dx: number, dy: number, width: number, height: number, ratio?: number): CropRect {
  const left = corner.includes('w')
  const up = corner.includes('n')
  const anchorX = left ? rect.x + rect.width : rect.x
  const anchorY = up ? rect.y + rect.height : rect.y
  const maxWidth = left ? anchorX : width - anchorX
  const maxHeight = up ? anchorY : height - anchorY
  let nextWidth = bound(rect.width + (left ? -dx : dx), 1, maxWidth)
  let nextHeight = bound(rect.height + (up ? -dy : dy), 1, maxHeight)
  if (ratio) {
    const horizontal = Math.abs(dx) >= Math.abs(dy * ratio)
    nextWidth = bound(horizontal ? nextWidth : nextHeight * ratio, Math.min(1, ratio), Math.min(maxWidth, maxHeight * ratio))
    nextHeight = nextWidth / ratio
  }
  return normalizeCropRect({
    x: left ? anchorX - nextWidth : anchorX,
    y: up ? anchorY - nextHeight : anchorY,
    width: nextWidth,
    height: nextHeight,
  }, width, height)
}
