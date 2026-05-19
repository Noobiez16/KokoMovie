import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
} from '@aws-sdk/client-dynamodb'
import { NodeHttpHandler } from '@smithy/node-http-handler'
import http from 'http'
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  ScanCommand,
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
  if (!(await tableExists('ab_experiments'))) {
    await rawClient.send(new CreateTableCommand({
      TableName: 'ab_experiments',
      KeySchema: [{ AttributeName: 'experimentId', KeyType: 'HASH' }],
      AttributeDefinitions: [{ AttributeName: 'experimentId', AttributeType: 'S' }],
      BillingMode: 'PAY_PER_REQUEST',
    }))
  }

  if (!(await tableExists('ab_assignments'))) {
    await rawClient.send(new CreateTableCommand({
      TableName: 'ab_assignments',
      KeySchema: [
        { AttributeName: 'profileId', KeyType: 'HASH' },
        { AttributeName: 'experimentId', KeyType: 'RANGE' },
      ],
      AttributeDefinitions: [
        { AttributeName: 'profileId', AttributeType: 'S' },
        { AttributeName: 'experimentId', AttributeType: 'S' },
      ],
      BillingMode: 'PAY_PER_REQUEST',
    }))
  }
}

// ─── A/B Experiments ──────────────────────────────────────────────────────────

export interface Experiment {
  experimentId: string
  name: string
  variants: Array<{ id: string; weight: number; description: string }>
  status: 'active' | 'paused' | 'completed'
  createdAt: string
}

export async function getActiveExperiments(): Promise<Experiment[]> {
  const result = await dynamo.send(new ScanCommand({
    TableName: 'ab_experiments',
    FilterExpression: '#s = :active',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: { ':active': 'active' },
  }))
  return (result.Items as Experiment[]) ?? []
}

export async function getExperiment(experimentId: string): Promise<Experiment | null> {
  const result = await dynamo.send(new GetCommand({
    TableName: 'ab_experiments',
    Key: { experimentId },
  }))
  return (result.Item as Experiment) ?? null
}

export async function putExperiment(exp: Experiment): Promise<void> {
  await dynamo.send(new PutCommand({ TableName: 'ab_experiments', Item: exp }))
}

// Deterministic assignment: hash(profileId + experimentId) % 100
export function assignVariant(profileId: string, experimentId: string, variants: Experiment['variants']): string {
  let hash = 0
  const str = `${profileId}:${experimentId}`
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0
  }
  const bucket = hash % 100
  let cumulative = 0
  for (const variant of variants) {
    cumulative += variant.weight
    if (bucket < cumulative) return variant.id
  }
  return variants[variants.length - 1]?.id ?? 'control'
}

export async function recordAssignment(profileId: string, experimentId: string, variantId: string): Promise<void> {
  await dynamo.send(new PutCommand({
    TableName: 'ab_assignments',
    Item: { profileId, experimentId, variantId, assignedAt: new Date().toISOString() },
  }))
}
