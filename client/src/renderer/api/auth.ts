import { authClient } from './client'

export interface RegisterPayload {
  email: string
  password: string
  deviceName?: string
  platform?: string
}

export interface LoginPayload {
  email: string
  password: string
  mfaToken?: string
  deviceName?: string
  platform?: string
}

export interface AuthResponse {
  success: true
  data: {
    accessToken: string
    refreshToken: string
    expiresAt: number
    account: {
      id: string
      email: string
      plan: string
      mfaEnabled: boolean
      createdAt: string
    }
  }
}

export interface RefreshResponse {
  success: true
  data: {
    accessToken: string
    refreshToken: string
    expiresAt: number
  }
}

export interface DeviceSession {
  id: string
  deviceName: string
  platform: string
  lastActiveAt: string
  createdAt: string
  isCurrent: boolean
}

export const authApi = {
  register: (payload: RegisterPayload) =>
    authClient.post<AuthResponse>('/auth/register', payload, { skipAuth: true }),

  login: (payload: LoginPayload) =>
    authClient.post<AuthResponse>('/auth/login', payload, { skipAuth: true }),

  logout: (refreshToken: string) =>
    authClient.post('/auth/logout', { refreshToken }),

  refresh: (refreshToken: string) =>
    authClient.post<RefreshResponse>('/auth/refresh', { refreshToken }, { skipAuth: true }),

  listDevices: () =>
    authClient.get<{ success: true; data: DeviceSession[] }>('/auth/devices'),

  revokeDevice: (id: string) =>
    authClient.delete(`/auth/devices/${id}`),

  setupMfa: () =>
    authClient.post<{ success: true; data: { secret: string; qrCodeUrl: string; backupCodes: string[] } }>('/auth/mfa/setup'),

  verifyMfa: (token: string) =>
    authClient.post<{ success: true; data: { mfaEnabled: boolean } }>('/auth/mfa/verify', { token }),

  getPublicKey: () =>
    authClient.get<{ publicKey: string }>('/auth/public-key', { skipAuth: true }),
}
