export interface JwtAccessPayload {
  sub: string           // account ID
  email: string
  plan: SubscriptionPlan
  iat: number
  exp: number
  jti: string           // unique token ID for denylist
}

export interface JwtRefreshPayload {
  sub: string
  jti: string
  iat: number
  exp: number
}

export type SubscriptionPlan = 'basic' | 'standard' | 'premium_4k' | 'none'

export interface AuthTokenPair {
  accessToken: string
  refreshToken: string
  expiresAt: number     // UNIX timestamp of access token expiry
}

export interface Account {
  id: string
  email: string
  createdAt: string
  plan: SubscriptionPlan
  mfaEnabled: boolean
}

export interface Profile {
  id: string
  accountId: string
  name: string
  avatarUrl: string | null
  isKids: boolean
  maturityRating: string
  language: string
  createdAt: string
}

export interface DeviceSession {
  id: string
  accountId: string
  deviceName: string
  platform: string
  ipAddress: string
  lastActiveAt: string
  createdAt: string
  isCurrent: boolean
}

export interface MfaSetupResponse {
  secret: string
  qrCodeUrl: string
  backupCodes: string[]
}
