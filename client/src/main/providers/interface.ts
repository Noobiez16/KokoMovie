export interface StreamSource {
  url: string
  quality: string
  headers?: Record<string, string>
  subtitles?: SubtitleTrack[]
}

export interface SubtitleTrack {
  label: string
  language: string
  url: string
}

export interface StreamRequest {
  imdbId?: string
  tmdbId?: number
  type: 'movie' | 'tv'
  season?: number
  episode?: number
  title?: string
}

export interface Provider {
  readonly id: string
  readonly name: string
  readonly sessionName: string  // persistent session key for this provider
  readonly defaultEnabled?: boolean  // false = disabled on first install; omit or true = enabled
  getEmbedUrl(req: StreamRequest): string | null
}

export interface ProviderResult {
  providerId: string
  providerName: string
  streams: StreamSource[]
  error?: string
}
