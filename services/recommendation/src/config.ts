import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  RECOMMENDATION_PORT: z.coerce.number().default(3005),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  AUTH_SERVICE_URL: z.string().url().default('http://localhost:3001'),
  CATALOG_SERVICE_URL: z.string().url().default('http://localhost:3002'),
  // AWS
  AWS_REGION: z.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID: z.string().default('local'),
  AWS_SECRET_ACCESS_KEY: z.string().default('local'),
  DYNAMODB_ENDPOINT: z.string().optional(),
  // AWS Personalize (optional — dev falls back to catalog)
  PERSONALIZE_CAMPAIGN_ARN: z.string().default(''),
  PERSONALIZE_SIMILAR_CAMPAIGN_ARN: z.string().default(''),
  SENTRY_DSN: z.string().optional(),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const config = parsed.data
