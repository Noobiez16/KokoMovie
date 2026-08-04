export interface ByteRange {
  status: 200 | 206 | 416
  start: number
  end: number
  length: number
  contentRange?: string
}

export function parseByteRange(
  header: string | null,
  totalSize: number,
  maxLength = 4 * 1024 * 1024,
): ByteRange {
  if (!Number.isSafeInteger(totalSize) || totalSize <= 0 || maxLength <= 0) {
    return { status: 416, start: 0, end: -1, length: 0, contentRange: `bytes */${Math.max(0, totalSize)}` }
  }

  let start = 0
  let end = totalSize - 1
  let requested = false
  if (header) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
    if (!match || (!match[1] && !match[2])) {
      return { status: 416, start: 0, end: -1, length: 0, contentRange: `bytes */${totalSize}` }
    }
    requested = true
    if (!match[1]) {
      const suffix = Number(match[2])
      if (!Number.isSafeInteger(suffix) || suffix <= 0) {
        return { status: 416, start: 0, end: -1, length: 0, contentRange: `bytes */${totalSize}` }
      }
      start = Math.max(0, totalSize - suffix)
    } else {
      start = Number(match[1])
      if (match[2]) end = Number(match[2])
    }
  }

  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= totalSize || end < start) {
    return { status: 416, start, end, length: 0, contentRange: `bytes */${totalSize}` }
  }
  end = Math.min(end, totalSize - 1, start + maxLength - 1)
  const partial = requested || start > 0 || end < totalSize - 1
  return {
    status: partial ? 206 : 200,
    start,
    end,
    length: end - start + 1,
    ...(partial ? { contentRange: `bytes ${start}-${end}/${totalSize}` } : {}),
  }
}

export function normalizeSubtitleText(input: string): string {
  const text = input.replace(/^\uFEFF/, '')
  if (text.trimStart().startsWith('WEBVTT')) return text
  return 'WEBVTT\n\n' + text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')

}

export function resolveSubtitleTrackUrl(url: string, proxyPort: string): string {
  if (url.startsWith('offline:')) return url
  if (!proxyPort || !/^https?:\/\//.test(url)) return ''
  const clean = url.replace(/^https?:\/\//, '')
  return `http://localhost:${proxyPort}/proxy/${clean}${clean.includes('?') ? '&' : '?'}format=vtt`
}
