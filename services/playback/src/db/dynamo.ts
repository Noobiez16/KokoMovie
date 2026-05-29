import { DynamoDBClient, CreateTableCommand, DescribeTableCommand, UpdateTimeToLiveCommand } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { config } from '../config.js'

const rawClient = new DynamoDBClient({
  region: config.AWS_REGION,
  endpoint: config.DYNAMODB_ENDPOINT,
  credentials: {
    accessKeyId: config.AWS_ACCESS_KEY_ID,
    secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
  },
  maxAttempts: 1,
  requestHandler: { requestTimeout: 3000, throwOnRequestTimeout: true },
})

export const dynamo = DynamoDBDocumentClient.from(rawClient)

async function tableExists(name: string): Promise<boolean> {
  try {
    await rawClient.send(new DescribeTableCommand({ TableName: name }))
    return true
  } catch {
    return false
  }
}

export async function ensureTables(): Promise<void> {
  if (!(await tableExists('playback_sessions'))) {
    await rawClient.send(new CreateTableCommand({
      TableName: 'playback_sessions',
      KeySchema: [
        { AttributeName: 'sessionId', KeyType: 'HASH' },
      ],
      AttributeDefinitions: [
        { AttributeName: 'sessionId', AttributeType: 'S' },
        { AttributeName: 'profileId', AttributeType: 'S' },
      ],
      GlobalSecondaryIndexes: [{
        IndexName: 'profileId-index',
        KeySchema: [{ AttributeName: 'profileId', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
      }],
      BillingMode: 'PROVISIONED',
      ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
    }))
  }

  if (!(await tableExists('playback_positions'))) {
    await rawClient.send(new CreateTableCommand({
      TableName: 'playback_positions',
      KeySchema: [
        { AttributeName: 'profileId', KeyType: 'HASH' },
        { AttributeName: 'contentEpisodeId', KeyType: 'RANGE' },
      ],
      AttributeDefinitions: [
        { AttributeName: 'profileId', AttributeType: 'S' },
        { AttributeName: 'contentEpisodeId', AttributeType: 'S' },
      ],
      BillingMode: 'PAY_PER_REQUEST',
    }))
    await rawClient.send(new UpdateTimeToLiveCommand({
      TableName: 'playback_positions',
      TimeToLiveSpecification: { AttributeName: 'ttl', Enabled: true },
    }))
  }
}

export interface PlaybackSession {
  sessionId: string
  profileId: string
  contentId: string
  episodeId: string | null
  signedUrl: string
  drmKeyId: string | null
  createdAt: string
  ttl: number
}

export async function createSession(session: PlaybackSession): Promise<void> {
  await dynamo.send(new PutCommand({
    TableName: 'playback_sessions',
    Item: session,
  }))
}

export async function getSession(sessionId: string): Promise<PlaybackSession | null> {
  const result = await dynamo.send(new GetCommand({
    TableName: 'playback_sessions',
    Key: { sessionId },
  }))
  return (result.Item as PlaybackSession) ?? null
}

export interface PlaybackPosition {
  profileId: string
  contentEpisodeId: string
  positionSeconds: number
  durationSeconds: number
  completedAt: string | null
  updatedAt: string
  ttl: number
}

export async function upsertPosition(pos: PlaybackPosition): Promise<void> {
  await dynamo.send(new PutCommand({
    TableName: 'playback_positions',
    Item: pos,
  }))
}

export async function deletePosition(profileId: string, contentEpisodeId: string): Promise<void> {
  await dynamo.send(new DeleteCommand({
    TableName: 'playback_positions',
    Key: { profileId, contentEpisodeId },
  }))
}

export async function getPosition(profileId: string, contentEpisodeId: string): Promise<PlaybackPosition | null> {
  const result = await dynamo.send(new GetCommand({
    TableName: 'playback_positions',
    Key: { profileId, contentEpisodeId },
  }))
  return (result.Item as PlaybackPosition) ?? null
}

export async function getPositionsForProfile(profileId: string): Promise<PlaybackPosition[]> {
  const result = await dynamo.send(new QueryCommand({
    TableName: 'playback_positions',
    KeyConditionExpression: 'profileId = :pid',
    ExpressionAttributeValues: { ':pid': profileId },
  }))
  return (result.Items as PlaybackPosition[]) ?? []
}

export interface HistoryItem {
  profileId: string
  contentId: string
  contentTitle: string
  contentType: string
  thumbnailUrl: string | null
  positionSeconds: number
  durationSeconds: number
  completedAt: string | null
  watchedAt: string
  episodeId?: string | null
}

const HISTORY_TTL_SECS = 90 * 24 * 60 * 60

export async function recordHistory(item: HistoryItem): Promise<void> {
  // Query existing history items for this profile to find duplicates
  try {
    const result = await dynamo.send(new QueryCommand({
      TableName: 'viewing_history',
      KeyConditionExpression: 'profileId = :pid',
      ExpressionAttributeValues: { ':pid': item.profileId },
    }))
    const existing = result.Items as any[] ?? []
    const duplicates = existing.filter((x) => 
      x.contentId === item.contentId && 
      (x.episodeId ?? null) === (item.episodeId ?? null)
    )
    for (const dup of duplicates) {
      await dynamo.send(new DeleteCommand({
        TableName: 'viewing_history',
        Key: {
          profileId: item.profileId,
          watchedAtContentId: dup.watchedAtContentId,
        },
      }))
    }
  } catch (err) {
    console.error('Error deduplicating history items:', err)
  }

  const now = item.watchedAt
  const watchedAtContentId = `${now}#${item.contentId}`
  const ttl = Math.floor(Date.now() / 1000) + HISTORY_TTL_SECS
  await dynamo.send(new PutCommand({
    TableName: 'viewing_history',
    Item: { ...item, watchedAtContentId, ttl },
  }))
}
