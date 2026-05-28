const token = process.env['TEST_TOKEN'] || "";

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
