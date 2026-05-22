import { dynamo } from './db/dynamo.js'
import { ScanCommand } from '@aws-sdk/lib-dynamodb'

async function run() {
  try {
    const watchlists = await dynamo.send(new ScanCommand({ TableName: 'watchlists' }))
    console.log('--- WATCHLISTS IN DYNAMODB ---')
    console.log(JSON.stringify(watchlists.Items, null, 2))
  } catch (err) {
    console.error('Scan failed:', err)
  }
}

run()
