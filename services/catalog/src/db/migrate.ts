import { readFile, readdir } from 'fs/promises'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import pg from 'pg'

const { Client } = pg
const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsDir = join(__dirname, 'migrations')

const client = new Client({ connectionString: process.env['DATABASE_URL'] })
await client.connect()

try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      service TEXT NOT NULL,
      filename TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (service, filename)
    )
  `)

  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort()

  for (const filename of files) {
    const { rows } = await client.query(
      'SELECT 1 FROM public.schema_migrations WHERE service = $1 AND filename = $2',
      ['catalog', filename]
    )

    if (rows.length > 0) {
      console.log(`Catalog migration ${filename} already applied, skipping`)
      continue
    }

    console.log(`Running catalog migration ${filename}...`)
    const sql = await readFile(join(migrationsDir, filename), 'utf-8')
    await client.query(sql)
    await client.query(
      'INSERT INTO public.schema_migrations (service, filename) VALUES ($1, $2)',
      ['catalog', filename]
    )
    console.log(`Catalog migration ${filename} complete`)
  }
} finally {
  await client.end()
}
