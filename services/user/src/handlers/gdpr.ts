import type { FastifyRequest, FastifyReply } from 'fastify'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { profiles } from '../db/schema.js'
import { getWatchlist, getHistory } from '../db/dynamo.js'
import type { AuthenticatedRequest } from '../lib/auth.js'

function meta(request: FastifyRequest) {
  return { requestId: request.id, timestamp: new Date().toISOString() }
}

export async function exportDataHandler(request: FastifyRequest, reply: FastifyReply) {
  const req = request as AuthenticatedRequest

  const profileList = await db.query.profiles.findMany({
    where: and(eq(profiles.accountId, req.accountId), isNull(profiles.deletedAt)),
    orderBy: (t, { asc }) => [asc(t.sortOrder)],
  })

  const enriched = await Promise.all(
    profileList.map(async (p) => {
      const [watchlist, { items: history }] = await Promise.all([
        getWatchlist(p.id),
        getHistory(p.id, 500),
      ])
      return {
        id: p.id,
        name: p.name,
        isKids: p.isKids,
        maturityRating: p.maturityRating,
        language: p.language,
        autoplay: p.autoplay,
        subtitleDefault: p.subtitleDefault,
        createdAt: p.createdAt.toISOString(),
        watchlist,
        viewingHistory: history,
      }
    }),
  )

  const exportPayload = {
    accountId: req.accountId,
    exportedAt: new Date().toISOString(),
    profiles: enriched,
  }

  reply.header('Content-Type', 'application/json')
  reply.header('Content-Disposition', `attachment; filename="kokomovie-data-export-${req.accountId}.json"`)
  return reply.send(exportPayload)
}
