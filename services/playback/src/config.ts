import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PLAYBACK_PORT: z.coerce.number().default(3003),
  DATABASE_URL: z.string().min(1),
  AUTH_SERVICE_URL: z.string().default('http://localhost:3001'),
  DYNAMODB_ENDPOINT: z.string().default('http://localhost:8000'),
  AWS_REGION: z.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID: z.string().default('local'),
  AWS_SECRET_ACCESS_KEY: z.string().default('local'),
  CLOUDFRONT_DOMAIN: z.string().default(''),
  CLOUDFRONT_KEY_PAIR_ID: z.string().default(''),
  CLOUDFRONT_PRIVATE_KEY: z.string().default(''),
  S3_MEDIA_BUCKET: z.string().default(''),
  SENTRY_DSN: z.string().default(''),
})

const result = envSchema.safeParse(process.env)
if (!result.success) {
  console.error('Invalid environment variables:', result.error.flatten())
  process.exit(1)
}

export const config = result.data
export type Config = typeof config
