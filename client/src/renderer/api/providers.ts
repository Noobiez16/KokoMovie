export const providersApi = {
  list: () => window.electronAPI!.listProviders(),
  toggle: (id: string, enabled: boolean) => window.electronAPI!.toggleProvider(id, enabled),
  getStream: (providerId: string, req: StreamRequest) => window.electronAPI!.getStream(providerId, req),
  getFirstStream: (req: StreamRequest, searchId?: string) => window.electronAPI!.getFirstStream(req, searchId),
  onStreamsCollected: (
    callback: (payload: { searchId: string; allStreams: ProviderResult[] }) => void
  ) => window.electronAPI!.onStreamsCollected(callback),
  registerStreamHeaders: (streamUrl: string, headers: Record<string, string>) =>
    window.electronAPI!.registerStreamHeaders(streamUrl, headers),
}

// Built-in P2P torrent streaming: discovers dubbed releases (e.g. Spanish/Latino) and resolves
// a chosen magnet to a localhost MP4 URL on demand.
export const torrentApi = {
  getStreams: (req: StreamRequest) => window.electronAPI!.torrentGetStreams(req),
  resolve: (magnet: string, audioLang?: string) => window.electronAPI!.torrentResolve(magnet, audioLang),
}
