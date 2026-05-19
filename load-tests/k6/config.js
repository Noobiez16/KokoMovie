export const BASE_URL = __ENV.BASE_URL || 'http://localhost'
export const AUTH_URL = __ENV.AUTH_URL || `${BASE_URL}:3001`
export const CATALOG_URL = __ENV.CATALOG_URL || `${BASE_URL}:3002`
export const PLAYBACK_URL = __ENV.PLAYBACK_URL || `${BASE_URL}:3003`

// Shared test account (pre-seeded in test env)
export const TEST_ACCOUNT = {
  email: __ENV.TEST_EMAIL || 'loadtest@streamflix.test',
  password: __ENV.TEST_PASSWORD || 'LoadTest123!',
}

export const THRESHOLDS = {
  // 95th percentile under 200ms
  http_req_duration: ['p(95)<200', 'p(99)<500'],
  // < 1% error rate
  http_req_failed: ['rate<0.01'],
}
