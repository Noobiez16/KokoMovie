import { SignJWT, jwtVerify, importPKCS8, importSPKI, type KeyLike } from 'jose'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { randomUUID } from 'crypto'
import { config } from '../config.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const keysDir = resolve(__dirname, '../../keys')
const privateKeyPath = resolve(keysDir, 'private.pem')
const publicKeyPath = resolve(keysDir, 'public.pem')

function loadPems() {
  if (!existsSync(privateKeyPath) || !existsSync(publicKeyPath)) {
    throw new Error('JWT signing keys not found. Run: node scripts/generate-keys.mjs')
  }
  return {
    privatePem: readFileSync(privateKeyPath, 'utf-8'),
    publicPem: readFileSync(publicKeyPath, 'utf-8'),
  }
}

const { privatePem, publicPem } = loadPems()

let _privateKey: KeyLike | null = null
let _publicKey: KeyLike | null = null

async function getPrivateKey(): Promise<KeyLike> {
  if (!_privateKey) _privateKey = await importPKCS8(privatePem, 'RS256')
  return _privateKey
}

async function getPublicKey(): Promise<KeyLike> {
  if (!_publicKey) _publicKey = await importSPKI(publicPem, 'RS256')
  return _publicKey
}

export interface AccessTokenPayload {
  sub: string
  email: string
  plan: string
  jti: string
}

export interface RefreshTokenPayload {
  sub: string
  jti: string
}

export async function signAccessToken(payload: AccessTokenPayload): Promise<string> {
  const key = await getPrivateKey()
  return new SignJWT({ email: payload.email, plan: payload.plan, jti: payload.jti })
    .setProtectedHeader({ alg: 'RS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + config.JWT_ACCESS_TTL)
    .setIssuer('kokomovie-auth')
    .setAudience('kokomovie-api')
    .sign(key)
}

export async function signRefreshToken(payload: RefreshTokenPayload): Promise<string> {
  const key = await getPrivateKey()
  return new SignJWT({ jti: payload.jti })
    .setProtectedHeader({ alg: 'RS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + config.JWT_REFRESH_TTL)
    .setIssuer('kokomovie-auth')
    .setAudience('kokomovie-auth')
    .sign(key)
}

export async function verifyAccessToken(
  token: string,
): Promise<{ sub: string; email: string; plan: string; jti: string; exp: number }> {
  const key = await getPublicKey()
  const { payload } = await jwtVerify(token, key, {
    issuer: 'kokomovie-auth',
    audience: 'kokomovie-api',
    algorithms: ['RS256'],
  })
  return payload as { sub: string; email: string; plan: string; jti: string; exp: number }
}

export async function verifyRefreshToken(
  token: string,
): Promise<{ sub: string; jti: string; exp: number }> {
  const key = await getPublicKey()
  const { payload } = await jwtVerify(token, key, {
    issuer: 'kokomovie-auth',
    audience: 'kokomovie-auth',
    algorithms: ['RS256'],
  })
  return payload as { sub: string; jti: string; exp: number }
}

export function generateJti(): string {
  return randomUUID()
}

export function getPublicKeyPem(): string {
  return publicPem
}
