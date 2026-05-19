import pg from 'pg'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const databaseUrl = process.env['DATABASE_URL']
if (!databaseUrl) { console.error('DATABASE_URL required'); process.exit(1) }

const pool = new pg.Pool({ connectionString: databaseUrl })
const client = await pool.connect()

try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      service TEXT NOT NULL,
      filename TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (service, filename)
    )
  `)

  const { rows } = await client.query(
    'SELECT 1 FROM public.schema_migrations WHERE service = $1 AND filename = $2',
    ['user', '0000_initial.sql']
  )

  if (rows.length > 0) {
    console.log('User migrations already applied, skipping')
  } else {
    console.log('Running User service migrations...')
    const sql = readFileSync(resolve(__dirname, 'migrations/0000_initial.sql'), 'utf-8')
    await client.query(sql)
    await client.query(
      'INSERT INTO public.schema_migrations (service, filename) VALUES ($1, $2)',
      ['user', '0000_initial.sql']
    )
    console.log('User service migrations complete')
  }
} finally {
  client.release()
  await pool.end()
}
