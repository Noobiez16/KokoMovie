import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend } from 'k6/metrics'
import { AUTH_URL, CATALOG_URL, TEST_ACCOUNT, THRESHOLDS } from './config.js'

const searchErrors = new Rate('search_errors')
const browseErrors = new Rate('browse_errors')
const browseDuration = new Trend('browse_duration_ms')
const searchDuration = new Trend('search_duration_ms')

// Target: 500 req/s catalog browse/search per architecture requirement
export const options = {
  thresholds: {
    ...THRESHOLDS,
    browse_duration_ms: ['p(95)<150'],  // cached, should be fast
    search_duration_ms: ['p(95)<300'],
  },
  scenarios: {
    browse_heavy: {
      executor: 'constant-arrival-rate',
      rate: 350,       // 350 req/s browse (cached)
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 200,
      maxVUs: 500,
    },
    search_load: {
      executor: 'constant-arrival-rate',
      rate: 150,       // 150 req/s search
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 100,
      maxVUs: 200,
      startTime: '10s',
    },
  },
}

// Get a JWT token once per VU (cached)
let cachedToken = null

function getToken() {
  if (cachedToken) return cachedToken
  const res = http.post(
    `${AUTH_URL}/auth/login`,
    JSON.stringify({ email: TEST_ACCOUNT.email, password: TEST_ACCOUNT.password }),
    { headers: { 'Content-Type': 'application/json' } },
  )
  if (res.status === 200) {
    cachedToken = res.json('data.accessToken')
  }
  return cachedToken
}

const GENRES = ['action', 'comedy', 'drama', 'thriller', 'sci-fi', 'horror', 'romance']
const SEARCH_TERMS = ['spider', 'matrix', 'dark', 'breaking', 'game of', 'inception', 'avatar']

export default function () {
  const token = getToken()
  if (!token) return

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'X-Client-Version': '1.0.0',
    'X-Platform': 'electron-linux',
  }

  // Browse scenario
  const genre = GENRES[Math.floor(Math.random() * GENRES.length)]
  const browseRes = http.get(
    `${CATALOG_URL}/catalog/browse?genre=${genre}&page=1&limit=20`,
    { headers },
  )

  browseDuration.add(browseRes.timings.duration)
  const browseOk = check(browseRes, {
    'browse 200': (r) => r.status === 200,
    'browse has items': (r) => Array.isArray(r.json('data')),
    'browse < 150ms (cached)': (r) => r.timings.duration < 150,
  })
  if (!browseOk) browseErrors.add(1)

  sleep(Math.random() * 0.5)

  // Search scenario (every other request)
  if (Math.random() < 0.5) {
    const term = SEARCH_TERMS[Math.floor(Math.random() * SEARCH_TERMS.length)]
    const searchRes = http.get(
      `${CATALOG_URL}/catalog/search?q=${encodeURIComponent(term)}&limit=20`,
      { headers },
    )

    searchDuration.add(searchRes.timings.duration)
    const searchOk = check(searchRes, {
      'search 200': (r) => r.status === 200,
      'search < 300ms': (r) => r.timings.duration < 300,
    })
    if (!searchOk) searchErrors.add(1)
  }

  sleep(Math.random() * 0.3)
}
