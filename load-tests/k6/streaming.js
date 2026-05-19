import http from 'k6/http'
import { check, sleep } from 'k6'
import { Counter, Rate, Trend } from 'k6/metrics'
import { AUTH_URL, PLAYBACK_URL, CATALOG_URL, TEST_ACCOUNT, THRESHOLDS } from './config.js'

// Target: 10,000 concurrent streams per architecture requirement
export const options = {
  thresholds: {
    ...THRESHOLDS,
    session_create_duration: ['p(95)<300'],
    position_update_duration: ['p(95)<100'],
  },
  scenarios: {
    // Ramp to 10,000 concurrent streams over 15 minutes
    concurrent_streams: {
      executor: 'ramping-vus',
      startVUs: 100,
      stages: [
        { duration: '5m', target: 2000 },
        { duration: '5m', target: 5000 },
        { duration: '5m', target: 10000 },
        { duration: '10m', target: 10000 },  // sustain peak
        { duration: '3m', target: 0 },
      ],
      gracefulRampDown: '2m',
    },
  },
}

const sessionDuration = new Trend('session_create_duration')
const positionDuration = new Trend('position_update_duration')
const sessionErrors = new Counter('session_errors')
const positionErrors = new Counter('position_errors')

// Sample content IDs — replace with actual seeded IDs in test env
const CONTENT_IDS = [
  'content-001', 'content-002', 'content-003', 'content-004', 'content-005',
  'content-006', 'content-007', 'content-008', 'content-009', 'content-010',
]

let cachedToken = null
let cachedProfileId = null

function authenticate() {
  if (cachedToken) return { token: cachedToken, profileId: cachedProfileId }

  const res = http.post(
    `${AUTH_URL}/auth/login`,
    JSON.stringify({ email: TEST_ACCOUNT.email, password: TEST_ACCOUNT.password }),
    { headers: { 'Content-Type': 'application/json' } },
  )
  if (res.status !== 200) return null

  cachedToken = res.json('data.accessToken')

  // Get first profile
  const profiles = http.get(`${PLAYBACK_URL.replace(':3003', ':3004')}/user/profiles`, {
    headers: { Authorization: `Bearer ${cachedToken}` },
  })
  if (profiles.status === 200 && profiles.json('data.length') > 0) {
    cachedProfileId = profiles.json('data.0.id')
  }

  return { token: cachedToken, profileId: cachedProfileId }
}

export default function () {
  const auth = authenticate()
  if (!auth) return

  const { token, profileId } = auth
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'X-Profile-Id': profileId || 'test-profile',
    'X-Client-Version': '1.0.0',
    'X-Platform': 'electron-linux',
  }

  // Create playback session
  const contentId = CONTENT_IDS[Math.floor(Math.random() * CONTENT_IDS.length)]
  const sessionRes = http.post(
    `${PLAYBACK_URL}/playback/session`,
    JSON.stringify({ contentId }),
    { headers },
  )

  sessionDuration.add(sessionRes.timings.duration)
  const sessionOk = check(sessionRes, {
    'session created': (r) => r.status === 200 || r.status === 201,
    'session has URL': (r) => !!r.json('data.manifestUrl'),
    'session < 300ms': (r) => r.timings.duration < 300,
  })

  if (!sessionOk) {
    sessionErrors.add(1)
    return
  }

  const sessionId = sessionRes.json('data.sessionId')

  // Simulate 2 minutes of playback with position heartbeats every 10s
  let positionSeconds = 0
  const heartbeats = 12 // 12 × 10s = 2 minutes

  for (let i = 0; i < heartbeats; i++) {
    positionSeconds += 10

    const posRes = http.put(
      `${PLAYBACK_URL}/playback/position`,
      JSON.stringify({
        contentId,
        positionSeconds,
        durationSeconds: 5400,  // 90min movie
        sessionId,
      }),
      { headers },
    )

    positionDuration.add(posRes.timings.duration)
    const posOk = check(posRes, {
      'position updated': (r) => r.status === 200,
      'position < 100ms': (r) => r.timings.duration < 100,
    })

    if (!posOk) positionErrors.add(1)

    sleep(10) // 10s between heartbeats (simulates real playback cadence)
  }
}
