export interface FfmpegTargetSpec {
  /** Upstream asset filename; always an LGPL variant. */
  asset: string
  /** SHA-256 of the upstream archive, verified before extraction. */
  sha256: string
  /** Executable name inside the archive's bin/ directory. */
  binary: string
}

export declare const FFMPEG_RELEASE: string
export declare const FFMPEG_VERSION: string
export declare const FFMPEG_TARGETS: Record<string, FfmpegTargetSpec>
export declare function fetchTarget(target: string): Promise<string>
export declare const MACOS_FFMPEG_SOURCE: { version: string; release: string; asset: string; url: string; sha256: string }
export declare const MACOS_FFMPEG_TARGETS: string[]
export declare function macosConfigureArgs(arch: string): string[]
export declare function assertLgplConfiguration(binaryPath: string, target: string): string
export declare function buildMacosTarget(target: string): Promise<string>
export declare function fetchMacosSource(): Promise<string>
export declare function downloadArchive(url: string, options?: {
  fetcher?: typeof fetch; wait?: (ms: number) => Promise<void>; attempts?: number; timeoutMs?: number
}): Promise<Buffer>
