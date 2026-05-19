import { ensureTables } from './dynamo.js'

await ensureTables()
console.log('Playback DynamoDB tables ready')
