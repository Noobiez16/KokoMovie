import { z } from 'zod'

const boundedId = z.string().trim().min(1).max(200)
const isoTimestamp = z.string().datetime({ offset: true })

export const portableWatchlistSchema = z.object({
  content_id: boundedId,
  content_type: z.enum(['movie', 'tv', 'series']),
  added_at: isoTimestamp,
}).strict()

export const portablePositionSchema = z.object({
  content_id: boundedId,
  episode_id: z.string().max(200),
  content_type: z.enum(['movie', 'tv', 'series']),
  position_seconds: z.number().int().nonnegative().max(60 * 60 * 24 * 30),
  duration_seconds: z.number().int().nonnegative().max(60 * 60 * 24 * 30),
  completed_at: isoTimestamp.nullable(),
  updated_at: isoTimestamp,
}).strict()

export const portablePreferencesSchema = z.object({
  language: z.string().trim().min(1).max(35),
  subtitle_default: z.string().trim().max(35).nullable(),
  autoplay: z.union([z.literal(0), z.literal(1)]),
  maturity_rating: z.string().trim().min(1).max(35),
}).strict()

export const libraryExportSchema = z.object({
  format: z.literal('kokomovie-library'),
  schemaVersion: z.literal(1),
  exportedAt: isoTimestamp,
  appVersion: z.string().trim().min(1).max(50),
  library: z.object({
    watchlist: z.array(portableWatchlistSchema).max(10_000),
    positions: z.array(portablePositionSchema).max(50_000),
    preferences: portablePreferencesSchema,
  }).strict(),
  artwork: z.array(z.object({
    file: z.string().regex(/^[a-f0-9]{64}\.(?:jpg|jpeg|png|webp)$/),
    data: z.string().max(22_000_000),
  }).strict()).max(256).optional(),
}).strict().superRefine((payload, context) => {
  const estimatedBytes = payload.artwork?.reduce((total, entry) => total + entry.data.length, 0) ?? 0
  if (estimatedBytes > 70_000_000) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Artwork payload exceeds the portable format limit' })
  }
})

export type LibraryExportPayload = z.infer<typeof libraryExportSchema>
export type PortableWatchlist = z.infer<typeof portableWatchlistSchema>
export type PortablePosition = z.infer<typeof portablePositionSchema>

export function incomingWins(existingTimestamp: string, incomingTimestamp: string): boolean {
  return Date.parse(incomingTimestamp) > Date.parse(existingTimestamp)
}

export function positionKey(position: Pick<PortablePosition, 'content_id' | 'episode_id'>): string {
  return `${position.content_id}\u0000${position.episode_id}`
}


export function hasValidArtworkSignature(file: string, bytes: Uint8Array): boolean {
  const extension = file.slice(file.lastIndexOf('.') + 1).toLowerCase()
  if ((extension === 'jpg' || extension === 'jpeg') && bytes.length >= 3) {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  }
  if (extension === 'png' && bytes.length >= 8) {
    return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
      .every((value, index) => bytes[index] === value)
  }
  if (extension === 'webp' && bytes.length >= 12) {
    return String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
      && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  }
  return false
}
export interface LibraryImportPreview {
  watchlist: number
  positions: number
  artwork: number
  watchlistConflicts: number
  positionConflicts: number
  exportedAt: string
  appVersion: string
}
