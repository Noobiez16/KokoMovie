import { describe, expect, it } from 'vitest'
import { getStandardHeight } from './video-quality'

describe('nominal video resolution', () => {
  it.each([
    [960, 540, 540], [854, 480, 480], [640, 360, 360],
    [1280, 720, 720], [1920, 1080, 1080], [2560, 1440, 1440], [3840, 2160, 2160],
    [1282, 534, 720], [1920, 800, 1080], [2560, 1080, 1440],
    [1000, 800, 720], [1800, 1400, 1080], [0, 720, 720],
  ])('classifies %ix%i as %ip', (width, height, expected) => {
    expect(getStandardHeight(width, height)).toBe(expected)
  })
  it.each([[0, 0], [1280, 0], [NaN, 720], [Infinity, 1080], [-1, 720]])(
    'does not infer a tier from unknown or invalid dimensions %ix%i', (width, height) => {
      expect(getStandardHeight(width, height)).toBeNull()
    },
  )
})
