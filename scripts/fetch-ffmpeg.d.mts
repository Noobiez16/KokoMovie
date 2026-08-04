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
