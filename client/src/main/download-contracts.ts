import { z } from 'zod'

const webUrl = z.string().trim().max(8192).refine((value) => {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}, 'A valid HTTP(S) URL is required')

const artworkUrl = z.string().trim().max(8192).refine((value) => {
  try {
    return ['http:', 'https:', 'catalog-cache:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}, 'A valid catalog artwork URL is required')

const headersSchema = z.record(z.string().max(2048)).superRefine((headers, context) => {
  const entries = Object.entries(headers)
  if (entries.length > 32) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Too many request headers' })
  }
  for (const [name] of entries) {
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,100}$/.test(name)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid request header name' })
    }
  }
})

export const downloadIdSchema = z.string().uuid()

export const downloadStartSchema = z.object({
  contentId: z.string().trim().min(1).max(200),
  episodeId: z.string().trim().min(1).max(200).optional(),
  title: z.string().trim().min(1).max(300),
  contentType: z.enum(['movie', 'tv', 'series']),
  thumbnailUrl: artworkUrl.optional(),
  durationMins: z.number().finite().positive().max(24 * 60).optional(),
  manifestUrl: webUrl,
  drmKeyId: z.string().trim().max(500).optional(),
  customDownloadPath: z.string().trim().min(1).max(4096).optional(),
  headers: headersSchema.optional(),
  subtitles: z.array(z.object({
    lang: z.string().trim().min(1).max(35),
    url: webUrl,
  }).strict()).max(8).optional(),
}).strict()

export type DownloadStartInput = z.infer<typeof downloadStartSchema>
