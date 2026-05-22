const token = "eyJhbGciOiJSUzI1NiJ9.eyJlbWFpbCI6Im5vb2JpZXoxNi5kZXZAZ21haWwuY29tIiwicGxhbiI6ImJhc2ljIiwianRpIjoiNWJiNjUwNzAtZDNmYi00YjgxLWIwNWQtMzg5NjUzMjg4MjNkIiwic3ViIjoiOWZiMjZiNTYtZWI5MC00MTNiLWI1MWUtOTE0YTRhODQzZTRkIiwiaWF0IjoxNzc5MzgwNTExLCJleHAiOjE3NzkzODE0MTEsImlzcyI6Imtva29tb3ZpZS1hdXRoIiwiYXVkIjoia29rb21vdmllLWFwaSJ9.NrQeFKJSXBHHpbkHAtH7uKUA1vqd_lg4jbFuRQQJl9dXMyEpxT8e4WnOTVny0buBviI75G1BUlBX6qaEdiWCZtkCnEwL-d0LQvgC1s7Px3gk2ipjJ07IjDeYYDZ1h27ingIBtuMXwvwqXuYbx4Nvn7cuii13NTbqrKVxooUcxUpUklNsX2BDL9MUsgv0WglA0waTf0kdv9RUe1RQR4xK7hhtPTuDaJdFHgyF0o4UPngzXp38c6aT3pld4JRjISeb3daB7jbEBbHSb8uo3v-sEsomsw8zCzEfsL7rXob47cTPTpBTegEv338eDi6kLJ4gZAS2OU85VKUE3GkaUEoIw2eJj0uo-PkEO9LulOS_SNHfX8pFHjzYYBS00ELLPq9I706l2Y827dLeHVynJ8Y0FTulsH4vTU6FeBzt-Usmo1eVHlRmDCOy5SB-yd7a-Af7_AusBYAatuBZVu_5JquthT1tjvry2YdKGOEJBlKBYWUmY9pWbZFksRTHrdqI24BEGUqxvxBmAyhf29zfAyiND6j_VVwmUY6WS51MKRcZLhg43RJ1Dg9aI6TEEzUKoAdedMkzrQhPVUDPCHx0XxVyPbAgVE3y0rILOm7ww1dOKt4MhNcYCR8LKO5mv5DDkQl_XHJ4pztMfjkHbOd3fwoD2t99_5WSxA0PR2hXVSAqc2U";

async function test() {
  try {
    // 1. List profiles
    const profilesRes = await fetch("http://localhost:3004/user/profiles", {
      headers: {
        "Authorization": `Bearer ${token}`
      }
    })
    const profilesJson = await profilesRes.json() as any
    console.log("Profiles:", JSON.stringify(profilesJson, null, 2))
    
    if (!profilesJson.success || profilesJson.data.length === 0) {
      console.log("No profiles found")
      return
    }
    const profileId = profilesJson.data[0].id
    const contentId = "00000001-0000-4000-8000-000000150fc3"
    
    // 2. Add to watchlist
    const addRes = await fetch(`http://localhost:3004/user/watchlist/${contentId}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "X-Profile-Id": profileId,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ contentType: "movie" })
    })
    console.log("Add status:", addRes.status, await addRes.json())

    // 3. Check watchlist
    const checkRes = await fetch(`http://localhost:3004/user/watchlist/${contentId}/check`, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "X-Profile-Id": profileId
      }
    })
    console.log("Check status:", checkRes.status, await checkRes.json())

    // 4. Delete from watchlist
    const delRes = await fetch(`http://localhost:3004/user/watchlist/${contentId}`, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${token}`,
        "X-Profile-Id": profileId
      }
    })
    console.log("Delete status:", delRes.status, await delRes.json())

    // 5. Check watchlist again
    const checkRes2 = await fetch(`http://localhost:3004/user/watchlist/${contentId}/check`, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "X-Profile-Id": profileId
      }
    })
    console.log("Check 2 status:", checkRes2.status, await checkRes2.json())
  } catch (err) {
    console.error("Test failed:", err)
  }
}

test()
