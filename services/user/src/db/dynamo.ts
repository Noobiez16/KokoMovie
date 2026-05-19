import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  UpdateTimeToLiveCommand,
} from '@aws-sdk/client-dynamodb'
import { NodeHttpHandler } from '@smithy/node-http-handler'
import http from 'http'
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  DeleteCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb'
import { config } from '../config.js'

const rawClient = new DynamoDBClient({
  region: config.AWS_REGION,
  endpoint: config.DYNAMODB_ENDPOINT,
  credentials: {
    accessKeyId: config.AWS_ACCESS_KEY_ID,
    secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
  },
  maxAttempts: 1,
  requestHandler: new NodeHttpHandler({
    requestTimeout: 5000,
    connectionTimeout: 2000,
    httpAgent: new http.Agent({ keepAlive: false }),
  }),
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
  if (!(await tableExists('watchlists'))) {
    await rawClient.send(new CreateTableCommand({
      TableName: 'watchlists',
      KeySchema: [
        { AttributeName: 'profileId', KeyType: 'HASH' },
        { AttributeName: 'contentId', KeyType: 'RANGE' },
      ],
      AttributeDefinitions: [
        { AttributeName: 'profileId', AttributeType: 'S' },
        { AttributeName: 'contentId', AttributeType: 'S' },
      ],
      GlobalSecondaryIndexes: [{
        IndexName: 'contentId-index',
        KeySchema: [{ AttributeName: 'contentId', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
      }],
      BillingMode: 'PROVISIONED',
      ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
    }))
  }

  if (!(await tableExists('viewing_history'))) {
    await rawClient.send(new CreateTableCommand({
      TableName: 'viewing_history',
      KeySchema: [
        { AttributeName: 'profileId', KeyType: 'HASH' },
        { AttributeName: 'watchedAtContentId', KeyType: 'RANGE' },
      ],
      AttributeDefinitions: [
        { AttributeName: 'profileId', AttributeType: 'S' },
        { AttributeName: 'watchedAtContentId', AttributeType: 'S' },
      ],
      BillingMode: 'PAY_PER_REQUEST',
    }))
    await rawClient.send(new UpdateTimeToLiveCommand({
      TableName: 'viewing_history',
      TimeToLiveSpecification: { AttributeName: 'ttl', Enabled: true },
    }))
  }
}

// ─── Watchlist ─────────────────────────────────────────────────────────────────

export interface WatchlistItem {
  profileId: string
  contentId: string
  addedAt: string
  contentType: string
}

export async function addToWatchlist(item: WatchlistItem): Promise<void> {
  await dynamo.send(new PutCommand({ TableName: 'watchlists', Item: item }))
}

export async function removeFromWatchlist(profileId: string, contentId: string): Promise<void> {
  await dynamo.send(new DeleteCommand({
    TableName: 'watchlists',
    Key: { profileId, contentId },
  }))
}

export async function getWatchlist(profileId: string): Promise<WatchlistItem[]> {
  const result = await dynamo.send(new QueryCommand({
    TableName: 'watchlists',
    KeyConditionExpression: 'profileId = :pid',
    ExpressionAttributeValues: { ':pid': profileId },
    ScanIndexForward: false,
  }))
  return (result.Items as WatchlistItem[]) ?? []
}

export async function isInWatchlist(profileId: string, contentId: string): Promise<boolean> {
  const result = await dynamo.send(new GetCommand({
    TableName: 'watchlists',
    Key: { profileId, contentId },
  }))
  return !!result.Item
}

// ─── Viewing History ───────────────────────────────────────────────────────────

export interface HistoryItem {
  profileId: string
  watchedAtContentId: string
  contentId: string
  contentTitle: string
  contentType: string
  thumbnailUrl: string | null
  positionSeconds: number
  durationSeconds: number
  completedAt: string | null
  watchedAt: string
  ttl: number
}

const HISTORY_TTL_SECS = 90 * 24 * 60 * 60 // 90 days

export async function recordHistory(item: Omit<HistoryItem, 'watchedAtContentId' | 'ttl'>): Promise<void> {
  const now = item.watchedAt
  const watchedAtContentId = `${now}#${item.contentId}`
  const ttl = Math.floor(Date.now() / 1000) + HISTORY_TTL_SECS
  await dynamo.send(new PutCommand({
    TableName: 'viewing_history',
    Item: { ...item, watchedAtContentId, ttl },
  }))
}

export async function getHistory(
  profileId: string,
  limit = 50,
  exclusiveStartKey?: Record<string, unknown>,
): Promise<{ items: HistoryItem[]; lastKey: Record<string, unknown> | undefined }> {
  const result = await dynamo.send(new QueryCommand({
    TableName: 'viewing_history',
    KeyConditionExpression: 'profileId = :pid',
    ExpressionAttributeValues: { ':pid': profileId },
    ScanIndexForward: false,
    Limit: limit,
    ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
  }))
  return {
    items: (result.Items as HistoryItem[]) ?? [],
    lastKey: result.LastEvaluatedKey as Record<string, unknown> | undefined,
  }
}
