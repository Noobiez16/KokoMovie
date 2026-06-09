export interface StreamSource {
  url: string
  quality: string
  headers?: Record<string, string>
  subtitles?: SubtitleTrack[]
  // Alternate audio (dub) languages declared in the HLS master, as 2-letter codes in manifest
  // order (e.g. ['en','it']). Empty for single/muxed-audio streams. Used to label sources in
  // the player's source switcher so users can find which provider carries a given dub.
  audioLangs?: string[]
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
  // Optional preferred audio/dub language (ISO 639-1, e.g. 'es', 'hi'). Providers that can
  // select a dub via their embed URL (or, for anime, a sub/dub segment) read this; providers
  // that carry audio only inside the HLS manifest ignore it (the player auto-selects there).
  audioLang?: string
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
