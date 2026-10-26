export interface UpdateFile { url: string; sha512: string; size?: number; blockMapSize?: number }
export interface UpdateMetadata { version: string; files: UpdateFile[]; path?: string; sha512?: string; releaseDate?: string }
export declare function mergeMacUpdateInfo(entries: Array<[string, UpdateMetadata]>, version: string): UpdateMetadata
export declare function digestFile(path: string, algorithm?: string, encoding?: string): Promise<string>
export declare function verifyUpdateFiles(metadata: UpdateMetadata, directory: string, version: string, expectedFile?: string): Promise<void>
export declare function releaseNotes(changelog: string, version: string): string
export declare function prepareRelease(root: string, input: string, output: string): Promise<void>
