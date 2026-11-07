export const DEVICE_COLORS = [
  { id: 'black', label: 'Black' },
  { id: 'white', label: 'White' },
  { id: 'rainbow', label: 'Rainbow' },
  { id: 'clear-purple', label: 'Clear Purple' },
] as const

export type DeviceColor = typeof DEVICE_COLORS[number]['id']

// Preserve the original gray shell with colored ABXY buttons for older workspaces.
export const DEFAULT_DEVICE_COLOR: DeviceColor = 'rainbow'

export function isDeviceColor(value: unknown): value is DeviceColor {
  return DEVICE_COLORS.some((color) => color.id === value)
}
