import { dynamo, removeFromWatchlist } from './db/dynamo.js'
import { ScanCommand } from '@aws-sdk/lib-dynamodb'

async function run() {
  const profileId = 'b855cf84-f75d-40b3-8157-d41ab73685d8'
  const contentId = '00000001-0000-4000-8000-000000150fc3'

  try {
    console.log('Removing item...')
    await removeFromWatchlist(profileId, contentId)
    console.log('Remove done.')

    const watchlists = await dynamo.send(new ScanCommand({ TableName: 'watchlists' }))
    console.log('--- WATCHLISTS AFTER REMOVE ---')
    console.log(JSON.stringify(watchlists.Items, null, 2))
  } catch (err) {
    console.error('Operation failed:', err)
  }
}

run()
