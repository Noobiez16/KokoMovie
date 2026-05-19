import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  CATALOG_PORT: z.coerce.number().default(3002),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  AUTH_SERVICE_URL: z.string().default('http://localhost:3001'),
  TMDB_API_KEY: z.string().default(''),
  ANTHROPIC_API_KEY: z.string().default(''),
  SENTRY_DSN: z.string().default(''),
})

const result = envSchema.safeParse(process.env)
if (!result.success) {
  console.error('Invalid environment variables:', result.error.flatten())
  process.exit(1)
}

export const config = result.data
export type Config = typeof config
