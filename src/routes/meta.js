import { Router } from 'express'
import { runQuery, checkHealth, toNumber } from '../db.js'
import * as Q from '../queries.js'

const router = Router()

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

/** GET /api/health — used by the UI banner; 200 when DB reachable, 503 otherwise. */
router.get(
  '/health',
  asyncHandler(async (req, res) => {
    const status = await checkHealth()
    res.status(status.ok ? 200 : 503).json({
      status: status.ok ? 'ok' : 'unreachable',
      detail: status.error || null,
    })
  }),
)

/** GET /api/stats — network-wide numbers for the home page. */
router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const [usersRec, edgesRec, degRec] = await Promise.all([
      runQuery(Q.STATS_USERS),
      runQuery(Q.STATS_FRIENDSHIPS),
      runQuery(Q.STATS_DEGREES),
    ])
    // FRIENDS_WITH is stored in both directions, so divide by two.
    res.json({
      users: toNumber(usersRec[0].get('users')),
      friendships: Math.round(toNumber(edgesRec[0].get('friendships')) / 2),
      avgDegree: Number(toNumber(degRec[0].get('avgDegree')).toFixed(1)),
      maxDegree: toNumber(degRec[0].get('maxDegree')),
    })
  }),
)

/** GET /api/top?limit=... — most-connected people (home page grid). */
router.get(
  '/top',
  asyncHandler(async (req, res) => {
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 10))
    const records = await runQuery(Q.TOP_USERS, { limit })
    const users = records.map((r) => {
      const p = r.get('u').properties
      return {
        id: toNumber(p.id),
        name: p.name,
        city: p.city,
        job: p.job,
        degree: toNumber(p.degree),
      }
    })
    res.json({ users })
  }),
)

export default router
