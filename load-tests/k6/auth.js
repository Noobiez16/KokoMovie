import http from 'k6/http'
import { check, sleep } from 'k6'
import { Counter, Rate, Trend } from 'k6/metrics'
import { AUTH_URL, TEST_ACCOUNT, THRESHOLDS } from './config.js'

const loginErrors = new Counter('login_errors')
const loginDuration = new Trend('login_duration_ms')
const refreshErrors = new Counter('refresh_errors')

export const options = {
  thresholds: THRESHOLDS,
  scenarios: {
    // Ramp up to 200 concurrent logins/min
    login_flow: {
      executor: 'ramping-arrival-rate',
      startRate: 10,
      timeUnit: '1m',
      preAllocatedVUs: 50,
      maxVUs: 200,
      stages: [
        { duration: '1m', target: 50 },
        { duration: '3m', target: 200 },
        { duration: '2m', target: 200 },
        { duration: '1m', target: 0 },
      ],
    },
  },
}

export default function () {
  const loginRes = http.post(
    `${AUTH_URL}/auth/login`,
    JSON.stringify({ email: TEST_ACCOUNT.email, password: TEST_ACCOUNT.password }),
    { headers: { 'Content-Type': 'application/json' } },
  )

  loginDuration.add(loginRes.timings.duration)

  const loginOk = check(loginRes, {
    'login status 200': (r) => r.status === 200,
    'has access token': (r) => !!r.json('data.accessToken'),
    'login < 500ms': (r) => r.timings.duration < 500,
  })

  if (!loginOk) {
    loginErrors.add(1)
    return
  }

  const { accessToken, refreshToken } = loginRes.json('data')

  sleep(0.5)

  // Token refresh
  const refreshRes = http.post(
    `${AUTH_URL}/auth/refresh`,
    JSON.stringify({ refreshToken }),
    { headers: { 'Content-Type': 'application/json' } },
  )

  const refreshOk = check(refreshRes, {
    'refresh status 200': (r) => r.status === 200,
    'new access token': (r) => !!r.json('data.accessToken'),
    'refresh < 300ms': (r) => r.timings.duration < 300,
  })

  if (!refreshOk) refreshErrors.add(1)

  sleep(0.5)
}
