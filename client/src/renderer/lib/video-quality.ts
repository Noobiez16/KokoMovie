/** Nominal tiers also account for widescreen films whose encoded frame is cropped. */
export function getStandardHeight(width: number, height: number): number | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 0 || height <= 0) return null
  if (width >= 3840 || height >= 2160) return 2160
  if (width >= 2560 || height >= 1440) return 1440
  if (width >= 1920 || height >= 1080) return 1080
  if (width >= 1280 || height >= 720) return 720
  if (width >= 960 || height >= 540) return 540
  if (width >= 854 || height >= 480) return 480
  return height
}
