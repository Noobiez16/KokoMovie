import type { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import {
  addToWatchlist,
  removeFromWatchlist,
  getWatchlist,
  isInWatchlist,
} from '../db/dynamo.js'
import type { AuthenticatedRequest } from '../lib/auth.js'

function meta(request: FastifyRequest) {
  return { requestId: request.id, timestamp: new Date().toISOString() }
}

export async function getWatchlistHandler(request: FastifyRequest, reply: FastifyReply) {
  const req = request as AuthenticatedRequest
  if (!req.profileId) {
    return reply.code(422).send({ success: false, error: { code: 'PROFILE_REQUIRED', message: 'X-Profile-Id header required' }, meta: meta(request) })
  }

  const items = await getWatchlist(req.profileId)
  return reply.send({ success: true, data: items, meta: meta(request) })
}

const addSchema = z.object({ contentType: z.enum(['movie', 'series']).default('movie') })

export async function addWatchlistHandler(request: FastifyRequest, reply: FastifyReply) {
  const req = request as AuthenticatedRequest
  if (!req.profileId) {
    return reply.code(422).send({ success: false, error: { code: 'PROFILE_REQUIRED', message: 'X-Profile-Id header required' }, meta: meta(request) })
  }

  const params = z.object({ contentId: z.string().uuid() }).safeParse(request.params)
  if (!params.success) {
    return reply.code(422).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid contentId' }, meta: meta(request) })
  }

  const body = addSchema.safeParse(request.body ?? {})
  const contentType = body.success ? body.data.contentType : 'movie'

  const alreadyAdded = await isInWatchlist(req.profileId, params.data.contentId)
  if (alreadyAdded) {
    return reply.code(409).send({ success: false, error: { code: 'ALREADY_IN_WATCHLIST', message: 'Content already in watchlist' }, meta: meta(request) })
  }

  await addToWatchlist({
    profileId: req.profileId,
    contentId: params.data.contentId,
    addedAt: new Date().toISOString(),
    contentType,
  })

  return reply.code(201).send({ success: true, data: null, meta: meta(request) })
}

export async function removeWatchlistHandler(request: FastifyRequest, reply: FastifyReply) {
  const req = request as AuthenticatedRequest
  if (!req.profileId) {
    return reply.code(422).send({ success: false, error: { code: 'PROFILE_REQUIRED', message: 'X-Profile-Id header required' }, meta: meta(request) })
  }

  const params = z.object({ contentId: z.string().uuid() }).safeParse(request.params)
  if (!params.success) {
    return reply.code(422).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid contentId' }, meta: meta(request) })
  }

  await removeFromWatchlist(req.profileId, params.data.contentId)
  return reply.send({ success: true, data: null, meta: meta(request) })
}

export async function checkWatchlistHandler(request: FastifyRequest, reply: FastifyReply) {
  const req = request as AuthenticatedRequest
  if (!req.profileId) {
    return reply.code(422).send({ success: false, error: { code: 'PROFILE_REQUIRED', message: 'X-Profile-Id header required' }, meta: meta(request) })
  }

  const params = z.object({ contentId: z.string().uuid() }).safeParse(request.params)
  if (!params.success) {
    return reply.code(422).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid contentId' }, meta: meta(request) })
  }

  const inList = await isInWatchlist(req.profileId, params.data.contentId)
  return reply.send({ success: true, data: { inWatchlist: inList }, meta: meta(request) })
}
