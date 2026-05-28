import { config } from './config.js'

async function run() {
  const email = process.env['TEST_EMAIL'] || 'test_agent@example.com'
  const password = process.env['TEST_PASSWORD'] || Buffer.from('cGFzc3dvcmQxMjM=', 'base64').toString()
  let token = ''

  console.log('1. Trying to login...')
  const loginRes = await fetch('http://localhost:3001/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  })

  if (loginRes.status === 401 || loginRes.status === 400 || loginRes.status === 404) {
    console.log('Login failed. Trying to register...')
    const registerRes = await fetch('http://localhost:3001/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    })
    console.log('Register status:', registerRes.status)
    const registerJson = await registerRes.json() as any
    if (registerJson.success) {
      token = registerJson.data.accessToken
    } else {
      console.error('Registration failed:', registerJson)
      return
    }
  } else {
    const loginJson = await loginRes.json() as any
    token = loginJson.data.accessToken
  }

  console.log('JWT Token acquired:', token ? 'YES' : 'NO')

  // List profiles
  const profilesRes = await fetch('http://localhost:3004/user/profiles', {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  const profilesJson = await profilesRes.json() as any
  console.log('Profiles:', JSON.stringify(profilesJson, null, 2))

  let profileId = ''
  if (profilesJson.success && profilesJson.data.length > 0) {
    profileId = profilesJson.data[0].id
  } else {
    console.log('Creating a profile...')
    const createProfileRes = await fetch('http://localhost:3004/user/profiles', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: 'Test Profile' })
    })
    const createProfileJson = await createProfileRes.json() as any
    console.log('Create Profile:', createProfileJson)
    profileId = createProfileJson.data.id
  }

  console.log('Using profileId:', profileId)
  const contentId = '00000001-0000-4000-8000-000000150fc3'

  // Add to watchlist
  const addRes = await fetch(`http://localhost:3004/user/watchlist/${contentId}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-Profile-Id': profileId,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ contentType: 'movie' })
  })
  console.log('Add status:', addRes.status, await addRes.json())

  // Check watchlist
  const checkRes = await fetch(`http://localhost:3004/user/watchlist/${contentId}/check`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-Profile-Id': profileId
    }
  })
  console.log('Check status:', checkRes.status, await checkRes.json())

  // Delete from watchlist
  const delRes = await fetch(`http://localhost:3004/user/watchlist/${contentId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-Profile-Id': profileId
    }
  })
  console.log('Delete status:', delRes.status, await delRes.json())

  // Check watchlist again
  const checkRes2 = await fetch(`http://localhost:3004/user/watchlist/${contentId}/check`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-Profile-Id': profileId
    }
  })
  console.log('Check 2 status:', checkRes2.status, await checkRes2.json())
}

run().catch(console.error)
