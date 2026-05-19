export const providersApi = {
  list: () => window.electronAPI!.listProviders(),
  toggle: (id: string, enabled: boolean) => window.electronAPI!.toggleProvider(id, enabled),
  getStream: (providerId: string, req: StreamRequest) => window.electronAPI!.getStream(providerId, req),
  getFirstStream: (req: StreamRequest) => window.electronAPI!.getFirstStream(req),
  registerStreamHeaders: (streamUrl: string, headers: Record<string, string>) =>
    window.electronAPI!.registerStreamHeaders(streamUrl, headers),
}
