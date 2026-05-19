import { generateKeyPairSync } from 'crypto'
import { writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const keysDir = join(__dirname, '../services/auth/keys')

const privateKeyPath = join(keysDir, 'private.pem')
const publicKeyPath = join(keysDir, 'public.pem')

if (existsSync(privateKeyPath) && existsSync(publicKeyPath)) {
  console.log('🔑 JWT keys already exist, skipping generation.')
  process.exit(0)
}

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 4096,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})

writeFileSync(privateKeyPath, privateKey, { mode: 0o600 })
writeFileSync(publicKeyPath, publicKey, { mode: 0o644 })

console.log('✅ Generated RS4096 JWT signing keys:')
console.log(`   Private: ${privateKeyPath}`)
console.log(`   Public:  ${publicKeyPath}`)
