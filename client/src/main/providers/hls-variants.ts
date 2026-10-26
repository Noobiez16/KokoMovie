export interface PlaybackVariant {
  url: string
  width: number
  height: number
  bandwidth: number
  codecs?: string
}

// Matches the existing direct-video compatibility policy. Unknown codec metadata
// stays usable; explicitly unsupported HEVC/Dolby Vision must not win by pixel count.
export function hasUnsupportedVideoCodec(codecs: string | undefined): boolean {
  return /(?:^|[,\s])(?:hvc1|hev1|dvhe|dvh1|hevc|h265)(?:[.,\s]|$)/i.test(codecs ?? '')
}

export function playbackVariants(text: string, base: string): PlaybackVariant[] {
  const lines = text.split(/\r?\n/).map(line => line.trim())
  const variants: PlaybackVariant[] = []
  for (let index = 0; index < lines.length && variants.length < 256; index++) {
    const line = lines[index]!
    if (!line.startsWith('#EXT-X-STREAM-INF:')) continue
    const attributes: Record<string, string> = {}
    for (const match of line.slice(line.indexOf(':') + 1).matchAll(/([A-Z0-9-]+)=(?:"([^"]*)"|([^,]*))/gi)) {
      attributes[match[1]!.toUpperCase()] = match[2] ?? match[3] ?? ''
    }
    let next = index + 1
    while (next < lines.length && !lines[next]) next++
    if (!lines[next] || lines[next]!.startsWith('#') || hasUnsupportedVideoCodec(attributes['CODECS'])) continue
    try {
      const url = new URL(lines[next]!, base)
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) continue
      const dimensions = /^(\d+)x(\d+)$/i.exec(attributes['RESOLUTION'] ?? '')
      variants.push({ url: url.toString(), width: Number(dimensions?.[1] ?? 0), height: Number(dimensions?.[2] ?? 0), bandwidth: Number(attributes['AVERAGE-BANDWIDTH'] ?? attributes['BANDWIDTH']) || 0, codecs: attributes['CODECS'] })
    } catch { /* A malformed rendition does not invalidate other real renditions. */ }
  }
  return variants
}
