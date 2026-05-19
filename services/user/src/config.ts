import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  USER_PORT: z.coerce.number().default(3004),
  DATABASE_URL: z.string().url(),
  AUTH_SERVICE_URL: z.string().url().default('http://localhost:3001'),
  // DynamoDB
  AWS_REGION: z.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID: z.string().default('local'),
  AWS_SECRET_ACCESS_KEY: z.string().default('local'),
  DYNAMODB_ENDPOINT: z.string().optional(),
  // S3 / avatar
  S3_ASSETS_BUCKET: z.string().default('kokomovie-assets-dev'),
  CLOUDFRONT_ASSETS_URL: z.string().default(''),
  SENTRY_DSN: z.string().optional(),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const config = parsed.data
