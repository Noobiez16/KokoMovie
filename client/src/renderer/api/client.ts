interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  body?: unknown
  profileId?: string
  skipAuth?: boolean
}

async function doFetch(url: string, method: string, headers: Record<string, string>, body?: string) {
  if (window.electronAPI?.apiRequest) {
    return window.electronAPI.apiRequest({ url, method, headers, body })
  }
  const response = await fetch(url, { method, headers, body })
  const text = await response.text()
  return { ok: response.ok, status: response.status, body: text }
}

class ApiClient {
  private baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  async request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const { method = 'GET', body, profileId, skipAuth = false } = opts

    const headers: Record<string, string> = {
      'X-Client-Version': '1.0.0',
      'X-Platform': `electron-${navigator.platform.toLowerCase().includes('win') ? 'windows' : navigator.platform.toLowerCase().includes('mac') ? 'macos' : 'linux'}`,
    }

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json'
    }

    if (!skipAuth) {
      const token = await window.electronAPI?.getAuthToken()
      if (token) headers['Authorization'] = `Bearer ${token}`
    }

    if (profileId) headers['X-Profile-Id'] = profileId

    const bodyStr = body !== undefined ? JSON.stringify(body) : undefined
    const result = await doFetch(`${this.baseUrl}${path}`, method, headers, bodyStr)
    const data = JSON.parse(result.body) as T

    if (!result.ok) {
      const errData = data as { error?: { code?: string; message?: string } }
      if (result.status === 401 && errData.error?.code === 'AUTH_TOKEN_EXPIRED') {
        const refreshed = await this.refreshAccessToken()
        if (refreshed) return this.request<T>(path, opts)
      }
      const errorMessage = (typeof errData.error === 'object' && errData.error?.message)
        || (errData as any).message
        || 'Request failed'
      throw Object.assign(new Error(errorMessage), {
        code: errData.error?.code,
        status: result.status,
      })
    }

    return data
  }

  private async refreshAccessToken(): Promise<boolean> {
    try {
      const refreshToken = await window.electronAPI?.getRefreshToken()
      if (!refreshToken) return false

      const authUrl = import.meta.env['VITE_AUTH_URL'] ?? 'http://localhost:3001'
      const result = await doFetch(
        `${authUrl}/auth/refresh`,
        'POST',
        { 'Content-Type': 'application/json' },
        JSON.stringify({ refreshToken }),
      )

      if (!result.ok) return false

      const data = JSON.parse(result.body) as { data?: { accessToken?: string; refreshToken?: string } }
      if (data.data?.accessToken) {
        await window.electronAPI?.setAuthToken(data.data.accessToken)
        if (data.data.refreshToken) await window.electronAPI?.setRefreshToken(data.data.refreshToken)
        return true
      }
      return false
    } catch {
      return false
    }
  }

  get<T>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) {
    return this.request<T>(path, { ...opts, method: 'GET' })
  }

  post<T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method'>) {
    return this.request<T>(path, { ...opts, method: 'POST', body })
  }

  put<T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method'>) {
    return this.request<T>(path, { ...opts, method: 'PUT', body })
  }

  delete<T>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) {
    return this.request<T>(path, { ...opts, method: 'DELETE' })
  }
}

// Each service has its own client instance
export const authClient = new ApiClient(import.meta.env['VITE_AUTH_URL'] ?? 'http://localhost:3001')
export const userClient = new ApiClient(import.meta.env['VITE_USER_URL'] ?? 'http://localhost:3004')
export const catalogClient = new ApiClient(import.meta.env['VITE_CATALOG_URL'] ?? 'http://localhost:3002')
export const playbackClient = new ApiClient(import.meta.env['VITE_PLAYBACK_URL'] ?? 'http://localhost:3003')
export const recommendationClient = new ApiClient(import.meta.env['VITE_RECOMMENDATION_URL'] ?? 'http://localhost:3005')
