import { createDecipheriv } from 'node:crypto'

export interface HlsByteRange {
  length: number
  offset: number
}

export interface HlsAes128Key {
  method: 'AES-128'
  uri: string
  ivHex?: string
}

export interface HlsMediaObject {
  kind: 'map' | 'segment'
  uri: string
  byteRange?: HlsByteRange
  key?: HlsAes128Key
  mediaSequence: number
  discontinuity: boolean
}

export interface HlsMediaPlaylist {
  kind: 'media'
  playlistUrl: string
  segments: HlsMediaObject[]
  objects: HlsMediaObject[]
  endList: boolean
}

export interface HlsVariant {
  uri: string
  bandwidth: number
  height: number
  audioGroupId?: string
}

export interface HlsAudioRendition {
  uri: string
  groupId: string
  name: string
  language?: string
  isDefault: boolean
  autoselect: boolean
}

export interface HlsMasterPlaylist {
  kind: 'master'
  playlistUrl: string
  variants: HlsVariant[]
  audioRenditions: HlsAudioRendition[]
}

export type HlsPlaylist = HlsMediaPlaylist | HlsMasterPlaylist

export interface HlsDownloadTrack {
  playlistUrl: string
  objects: HlsMediaObject[]
  language?: string
  name?: string
}

export interface HlsDownloadPlan {
  video: HlsDownloadTrack
  audio?: HlsDownloadTrack
}

export interface LoadedHlsPlaylist {
  text: string
  finalUrl: string
}

export class UnsupportedHlsError extends Error {
  constructor(readonly code: 'DOWNLOAD_UNSUPPORTED_DRM' | 'DOWNLOAD_UNSUPPORTED_PLAYLIST') {
    super(code)
    this.name = 'UnsupportedHlsError'
  }
}

function resolveUri(baseUrl: string, uri: string): string {
  return new URL(uri, baseUrl).toString()
}

function parseAttributeList(raw: string): Record<string, string> {
  const attributes: Record<string, string> = {}
  let cursor = 0
  while (cursor < raw.length) {
    while (raw[cursor] === ',' || raw[cursor] === ' ') cursor++
    const equals = raw.indexOf('=', cursor)
    if (equals < 0) break
    const name = raw.slice(cursor, equals).trim().toUpperCase()
    cursor = equals + 1
    let value = ''
    if (raw[cursor] === '"') {
      cursor++
      const end = raw.indexOf('"', cursor)
      if (end < 0) throw new UnsupportedHlsError('DOWNLOAD_UNSUPPORTED_PLAYLIST')
      value = raw.slice(cursor, end)
      cursor = end + 1
    } else {
      const comma = raw.indexOf(',', cursor)
      const end = comma < 0 ? raw.length : comma
      value = raw.slice(cursor, end).trim()
      cursor = end
    }
    attributes[name] = value
    while (raw[cursor] === ',' || raw[cursor] === ' ') cursor++
  }
  return attributes
}

function attributesFromLine(line: string): Record<string, string> {
  const colon = line.indexOf(':')
  return parseAttributeList(colon < 0 ? '' : line.slice(colon + 1))
}

function parsePositiveInteger(raw: string | undefined, fallback = 0): number {
  const value = Number.parseInt(raw ?? '', 10)
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback
}

function parseByteRange(raw: string | undefined, implicitOffset: number | undefined): HlsByteRange | undefined {
  if (!raw) return undefined
  const match = raw.match(/^(\d+)(?:@(\d+))?$/)
  if (!match) throw new UnsupportedHlsError('DOWNLOAD_UNSUPPORTED_PLAYLIST')
  const length = Number.parseInt(match[1]!, 10)
  const explicitOffset = match[2] === undefined ? undefined : Number.parseInt(match[2], 10)
  const offset = explicitOffset ?? implicitOffset
  if (!Number.isSafeInteger(length) || length <= 0 || offset === undefined || !Number.isSafeInteger(offset) || offset < 0) {
    throw new UnsupportedHlsError('DOWNLOAD_UNSUPPORTED_PLAYLIST')
  }
  return { length, offset }
}

function parseIv(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const hex = raw.replace(/^0x/i, '').toLowerCase()
  if (!/^[0-9a-f]{1,32}$/.test(hex)) throw new UnsupportedHlsError('DOWNLOAD_UNSUPPORTED_PLAYLIST')
  return hex.padStart(32, '0')
}

function sameResource(a: HlsMediaObject | undefined, b: HlsMediaObject): boolean {
  return Boolean(
    a &&
    a.uri === b.uri &&
    a.byteRange?.length === b.byteRange?.length &&
    a.byteRange?.offset === b.byteRange?.offset &&
    a.key?.uri === b.key?.uri &&
    a.key?.ivHex === b.key?.ivHex,
  )
}

export function parseHlsPlaylist(text: string, playlistUrl: string): HlsPlaylist {
  if (!text.trimStart().startsWith('#EXTM3U')) throw new UnsupportedHlsError('DOWNLOAD_UNSUPPORTED_PLAYLIST')
  const lines = text.replace(/\r/g, '').split('\n').map((line) => line.trim())
  const isMaster = lines.some((line) => line.startsWith('#EXT-X-STREAM-INF'))

  if (isMaster) {
    const variants: HlsVariant[] = []
    const audioRenditions: HlsAudioRendition[] = []
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index]!
      if (line.startsWith('#EXT-X-MEDIA:')) {
        const attrs = attributesFromLine(line)
        if (attrs['TYPE'] !== 'AUDIO' || !attrs['GROUP-ID'] || !attrs['URI']) continue
        audioRenditions.push({
          uri: resolveUri(playlistUrl, attrs['URI']),
          groupId: attrs['GROUP-ID'],
          name: attrs['NAME'] || attrs['LANGUAGE'] || 'Audio',
          language: attrs['LANGUAGE'],
          isDefault: attrs['DEFAULT'] === 'YES',
          autoselect: attrs['AUTOSELECT'] === 'YES',
        })
        continue
      }
      if (!line.startsWith('#EXT-X-STREAM-INF:')) continue
      const attrs = attributesFromLine(line)
      let uri = ''
      for (let next = index + 1; next < lines.length; next++) {
        const candidate = lines[next]!
        if (!candidate) continue
        if (candidate.startsWith('#')) break
        uri = candidate
        index = next
        break
      }
      if (!uri) throw new UnsupportedHlsError('DOWNLOAD_UNSUPPORTED_PLAYLIST')
      const resolution = attrs['RESOLUTION']?.match(/^\d+x(\d+)$/i)
      variants.push({
        uri: resolveUri(playlistUrl, uri),
        bandwidth: parsePositiveInteger(attrs['AVERAGE-BANDWIDTH'] ?? attrs['BANDWIDTH']),
        height: parsePositiveInteger(resolution?.[1]),
        audioGroupId: attrs['AUDIO'],
      })
    }
    if (variants.length === 0) throw new UnsupportedHlsError('DOWNLOAD_UNSUPPORTED_PLAYLIST')
    return { kind: 'master', playlistUrl, variants, audioRenditions }
  }

  let mediaSequence = 0
  let currentKey: HlsAes128Key | undefined
  let currentMap: HlsMediaObject | undefined
  let pendingByteRange: string | undefined
  let discontinuity = false
  const lastRangeEnd = new Map<string, number>()
  const segments: HlsMediaObject[] = []
  const objects: HlsMediaObject[] = []
  let emittedMap: HlsMediaObject | undefined

  for (const line of lines) {
    if (!line) continue
    if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
      mediaSequence = parsePositiveInteger(line.slice(line.indexOf(':') + 1))
      continue
    }
    if (line.startsWith('#EXT-X-KEY:')) {
      const attrs = attributesFromLine(line)
      const method = attrs['METHOD']
      if (method === 'NONE') {
        currentKey = undefined
        continue
      }
      if (method !== 'AES-128' || (attrs['KEYFORMAT'] && attrs['KEYFORMAT'] !== 'identity') || !attrs['URI']) {
        throw new UnsupportedHlsError('DOWNLOAD_UNSUPPORTED_DRM')
      }
      currentKey = { method: 'AES-128', uri: resolveUri(playlistUrl, attrs['URI']), ivHex: parseIv(attrs['IV']) }
      continue
    }
    if (line.startsWith('#EXT-X-MAP:')) {
      const attrs = attributesFromLine(line)
      if (!attrs['URI']) throw new UnsupportedHlsError('DOWNLOAD_UNSUPPORTED_PLAYLIST')
      const uri = resolveUri(playlistUrl, attrs['URI'])
      const byteRange = parseByteRange(attrs['BYTERANGE'], lastRangeEnd.get(uri))
      if (byteRange) lastRangeEnd.set(uri, byteRange.offset + byteRange.length)
      if (currentKey && !currentKey.ivHex) throw new UnsupportedHlsError('DOWNLOAD_UNSUPPORTED_PLAYLIST')
      currentMap = { kind: 'map', uri, byteRange, key: currentKey, mediaSequence, discontinuity: false }
      continue
    }
    if (line.startsWith('#EXT-X-BYTERANGE:')) {
      pendingByteRange = line.slice(line.indexOf(':') + 1).trim()
      continue
    }
    if (line === '#EXT-X-DISCONTINUITY') {
      discontinuity = true
      continue
    }
    if (line.startsWith('#')) continue

    const uri = resolveUri(playlistUrl, line)
    const byteRange = parseByteRange(pendingByteRange, lastRangeEnd.get(uri))
    pendingByteRange = undefined
    if (byteRange) lastRangeEnd.set(uri, byteRange.offset + byteRange.length)
    const segment: HlsMediaObject = {
      kind: 'segment',
      uri,
      byteRange,
      key: currentKey,
      mediaSequence,
      discontinuity,
    }
    if (currentMap && (discontinuity || !sameResource(emittedMap, currentMap))) {
      const map = { ...currentMap, mediaSequence, discontinuity }
      objects.push(map)
      emittedMap = map
    }
    segments.push(segment)
    objects.push(segment)
    mediaSequence++
    discontinuity = false
  }

  if (segments.length === 0) throw new UnsupportedHlsError('DOWNLOAD_UNSUPPORTED_PLAYLIST')
  return { kind: 'media', playlistUrl, segments, objects, endList: lines.includes('#EXT-X-ENDLIST') }
}

export function selectHlsVariant(master: HlsMasterPlaylist): HlsVariant {
  return [...master.variants].sort((a, b) => {
    const a1080 = a.height === 1080 ? 1 : 0
    const b1080 = b.height === 1080 ? 1 : 0
    if (a1080 !== b1080) return b1080 - a1080
    if (a.height !== b.height) return b.height - a.height
    return b.bandwidth - a.bandwidth
  })[0]!
}

function selectAudioRendition(master: HlsMasterPlaylist, groupId: string | undefined): HlsAudioRendition | undefined {
  if (!groupId) return undefined
  const matches = master.audioRenditions.filter((rendition) => rendition.groupId === groupId)
  return matches.find((rendition) => rendition.isDefault) ?? matches.find((rendition) => rendition.autoselect) ?? matches[0]
}

export async function createHlsDownloadPlan(
  manifestUrl: string,
  loadPlaylist: (url: string) => Promise<LoadedHlsPlaylist>,
): Promise<HlsDownloadPlan> {
  const initial = await loadPlaylist(manifestUrl)
  const playlist = parseHlsPlaylist(initial.text, initial.finalUrl)
  if (playlist.kind === 'media') {
    if (!playlist.endList) throw new UnsupportedHlsError('DOWNLOAD_UNSUPPORTED_PLAYLIST')
    return { video: { playlistUrl: playlist.playlistUrl, objects: playlist.objects } }
  }

  const variant = selectHlsVariant(playlist)
  const loadedVideo = await loadPlaylist(variant.uri)
  const video = parseHlsPlaylist(loadedVideo.text, loadedVideo.finalUrl)
  if (video.kind !== 'media') throw new UnsupportedHlsError('DOWNLOAD_UNSUPPORTED_PLAYLIST')
  if (!video.endList) throw new UnsupportedHlsError('DOWNLOAD_UNSUPPORTED_PLAYLIST')
  const plan: HlsDownloadPlan = { video: { playlistUrl: video.playlistUrl, objects: video.objects } }

  const audioRendition = selectAudioRendition(playlist, variant.audioGroupId)
  if (audioRendition) {
    const loadedAudio = await loadPlaylist(audioRendition.uri)
    const audio = parseHlsPlaylist(loadedAudio.text, loadedAudio.finalUrl)
    if (audio.kind !== 'media') throw new UnsupportedHlsError('DOWNLOAD_UNSUPPORTED_PLAYLIST')
    if (!audio.endList) throw new UnsupportedHlsError('DOWNLOAD_UNSUPPORTED_PLAYLIST')
    plan.audio = {
      playlistUrl: audio.playlistUrl,
      objects: audio.objects,
      language: audioRendition.language,
      name: audioRendition.name,
    }
  }
  return plan
}

export function hlsIvForSequence(sequence: number): Buffer {
  if (!Number.isSafeInteger(sequence) || sequence < 0) throw new UnsupportedHlsError('DOWNLOAD_UNSUPPORTED_PLAYLIST')
  const iv = Buffer.alloc(16)
  iv.writeBigUInt64BE(BigInt(sequence), 8)
  return iv
}

export function decryptAes128Resource(encrypted: Buffer, key: Buffer, iv: Buffer): Buffer {
  if (key.length !== 16 || iv.length !== 16) throw new UnsupportedHlsError('DOWNLOAD_UNSUPPORTED_PLAYLIST')
  const decipher = createDecipheriv('aes-128-cbc', key, iv)
  return Buffer.concat([decipher.update(encrypted), decipher.final()])
}

export type HlsResourceLoader = (uri: string, byteRange?: HlsByteRange) => Promise<Buffer>

export async function materializeHlsObject(
  object: HlsMediaObject,
  loadResource: HlsResourceLoader,
  keyCache = new Map<string, Buffer>(),
): Promise<Buffer> {
  let payload = await loadResource(object.uri, object.byteRange)
  if (object.byteRange && payload.length !== object.byteRange.length) {
    const { offset, length } = object.byteRange
    if (payload.length < offset + length) throw new UnsupportedHlsError('DOWNLOAD_UNSUPPORTED_PLAYLIST')
    payload = payload.subarray(offset, offset + length)
  }
  if (!object.key) return payload

  let key = keyCache.get(object.key.uri)
  if (!key) {
    key = await loadResource(object.key.uri)
    if (key.length !== 16) throw new UnsupportedHlsError('DOWNLOAD_UNSUPPORTED_PLAYLIST')
    keyCache.set(object.key.uri, key)
  }
  const iv = object.key.ivHex ? Buffer.from(object.key.ivHex, 'hex') : hlsIvForSequence(object.mediaSequence)
  return decryptAes128Resource(payload, key, iv)
}
