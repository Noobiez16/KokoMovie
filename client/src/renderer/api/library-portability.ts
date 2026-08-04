export interface LibraryImportSelection {
  cancelled: boolean
  token?: string
  preview?: LibraryImportPreview
}

export const libraryPortabilityApi = {
  exportFile: (includeArtwork: boolean) =>
    window.electronAPI!.exportLibraryFile({ includeArtwork }),
  selectImport: () =>
    window.electronAPI!.selectLibraryImport() as Promise<LibraryImportSelection>,
  applyImport: (token: string, mode: 'merge' | 'replace') =>
    window.electronAPI!.applyLibraryImport({ token, mode }),
}
