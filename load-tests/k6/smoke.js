/**
 * Smoke test — quick sanity check against staging/prod.
 * Run with: k6 run --env BASE_URL=https://api.streamflix.com smoke.js
 * Expected duration: ~2 minutes, 1 VU.
 */
import http from 'k6/http'
import { check, group } from 'k6'
import { AUTH_URL, CATALOG_URL, PLAYBACK_URL, TEST_ACCOUNT } from './config.js'

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    checks: ['rate==1.0'],  // all checks must pass
  },
}

export default function () {
  let token, refreshToken, profileId

  group('Auth', () => {
    const loginRes = http.post(
      `${AUTH_URL}/auth/login`,
      JSON.stringify({ email: TEST_ACCOUNT.email, password: TEST_ACCOUNT.password }),
      { headers: { 'Content-Type': 'application/json' } },
    )
    check(loginRes, {
      'login 200': (r) => r.status === 200,
      'has tokens': (r) => !!r.json('data.accessToken') && !!r.json('data.refreshToken'),
    })
    token = loginRes.json('data.accessToken')
    refreshToken = loginRes.json('data.refreshToken')

    const refreshRes = http.post(
      `${AUTH_URL}/auth/refresh`,
      JSON.stringify({ refreshToken }),
      { headers: { 'Content-Type': 'application/json' } },
    )
    check(refreshRes, { 'refresh 200': (r) => r.status === 200 })
    token = refreshRes.json('data.accessToken') || token
  })

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'X-Client-Version': '1.0.0',
    'X-Platform': 'electron-linux',
  }

  group('Catalog', () => {
    const browseRes = http.get(`${CATALOG_URL}/catalog/browse?limit=10`, { headers })
    check(browseRes, {
      'browse 200': (r) => r.status === 200,
      'browse has items': (r) => r.json('data.length') > 0,
    })

    const genresRes = http.get(`${CATALOG_URL}/catalog/genres`, { headers })
    check(genresRes, {
      'genres 200': (r) => r.status === 200,
      'has genres': (r) => r.json('data.length') > 0,
    })

    const searchRes = http.get(`${CATALOG_URL}/catalog/search?q=test`, { headers })
    check(searchRes, { 'search 200': (r) => r.status === 200 })
  })

  group('Playback health', () => {
    const healthRes = http.get(`${PLAYBACK_URL}/health`)
    check(healthRes, {
      'playback healthy': (r) => r.status === 200,
      'playback ok': (r) => r.json('status') === 'ok',
    })
  })

  group('User service', () => {
    const profilesRes = http.get(
      `${AUTH_URL.replace('3001', '3004')}/user/profiles`,
      { headers },
    )
    check(profilesRes, {
      'profiles 200': (r) => r.status === 200,
    })
    profileId = profilesRes.json('data.0.id')
  })

  group('Billing', () => {
    const plansRes = http.get(
      `${AUTH_URL.replace('3001', '3006')}/billing/plans`,
    )
    check(plansRes, {
      'plans 200': (r) => r.status === 200,
      'has 3 plans': (r) => r.json('data.length') === 3,
    })
  })
}
