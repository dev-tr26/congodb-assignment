import { Router } from 'express'
import { runQuery, toNumber } from '../db.js'
import * as Q from '../queries.js'

const router = Router()

/* ── helpers ─────────────────────────────────────────────────────────── */

/** Extract a plain user object from a driver Node. */
function toUser(node) {
  const p = node.properties
  return {
    id: toNumber(p.id),
    name: p.name,
    city: p.city,
    job: p.job,
    age: toNumber(p.age),
    interests: p.interests || [],
    degree: toNumber(p.degree),
  }
}

/** Validate a numeric user id from the URL. */
function parseId(raw) {
  const id = Number(raw)
  return Number.isInteger(id) && id >= 0 ? id : null
}

function clampLimit(raw, def = 12, min = 1, max = 50) {
  const n = Number.parseInt(raw, 10)
  if (Number.isNaN(n)) return def
  return Math.min(max, Math.max(min, n))
}

/** Wrap async route handlers so rejections reach the error middleware. */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

async function userExists(id) {
  const records = await runQuery(Q.USER_PROFILE, { id })
  return records.length > 0
}

/* ── routes ──────────────────────────────────────────────────────────── */

/** GET /api/users/search?q=...&limit=... */
router.get(
  '/search',
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || '').trim()
    if (!q) return res.json({ query: '', results: [] })
    const limit = clampLimit(req.query.limit, 10, 1, 20)
    const records = await runQuery(Q.SEARCH, { q, limit })
    res.json({ query: q, results: records.map((r) => toUser(r.get('u'))) })
  }),
)

/** GET /api/users/:id — full profile. */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id)
    if (id === null) {
      return res.status(400).json({ error: 'invalid-id', message: 'User id must be a non-negative integer.' })
    }
    const records = await runQuery(Q.USER_PROFILE, { id })
    if (records.length === 0) {
      return res.status(404).json({ error: 'not-found', message: `No user with id ${id}.` })
    }
    res.json({ user: toUser(records[0].get('u')) })
  }),
)

/** GET /api/users/:id/friends?limit=... */
router.get(
  '/:id/friends',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id)
    if (id === null) return res.status(400).json({ error: 'invalid-id', message: 'User id must be a non-negative integer.' })
    const limit = clampLimit(req.query.limit, 48, 1, 200)
    const records = await runQuery(Q.FRIENDS, { id, limit })
    if (records.length === 0 && !(await userExists(id))) {
      return res.status(404).json({ error: 'not-found', message: `No user with id ${id}.` })
    }
    res.json({ friends: records.map((r) => toUser(r.get('f'))) })
  }),
)

/**
 * GET /api/users/:id/recommendations?limit=...
 * The core 2-hop query: friends-of-friends who aren't already friends,
 * ranked by the number of mutual friends.
 */
router.get(
  '/:id/recommendations',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id)
    if (id === null) return res.status(400).json({ error: 'invalid-id', message: 'User id must be a non-negative integer.' })
    const limit = clampLimit(req.query.limit, 12, 1, 50)
    const records = await runQuery(Q.RECOMMENDATIONS, { userId: id, limit })
    if (records.length === 0 && !(await userExists(id))) {
      return res.status(404).json({ error: 'not-found', message: `No user with id ${id}.` })
    }
    res.json({
      recommendations: records.map((r) => ({
        user: toUser(r.get('candidate')),
        mutualCount: toNumber(r.get('mutualCount')),
      })),
    })
  }),
)

/** GET /api/users/:id/mutual/:otherId — shared friends between two users. */
router.get(
  '/:id/mutual/:otherId',
  asyncHandler(async (req, res) => {
    const idA = parseId(req.params.id)
    const idB = parseId(req.params.otherId)
    if (idA === null || idB === null) {
      return res.status(400).json({ error: 'invalid-id', message: 'User ids must be non-negative integers.' })
    }
    if (idA === idB) return res.json({ mutual: [], note: 'same-user' })
    const records = await runQuery(Q.MUTUAL_FRIENDS, { idA, idB })
    res.json({ mutual: records.map((r) => toUser(r.get('m'))) })
  }),
)

/** GET /api/users/:id/path/:otherId — degrees of separation (shortest path). */
router.get(
  '/:id/path/:otherId',
  asyncHandler(async (req, res) => {
    const idA = parseId(req.params.id)
    const idB = parseId(req.params.otherId)
    if (idA === null || idB === null) {
      return res.status(400).json({ error: 'invalid-id', message: 'User ids must be non-negative integers.' })
    }
    if (idA === idB) {
      return res.json({ found: true, degrees: 0, path: [] })
    }
    const records = await runQuery(Q.SHORTEST_PATH, { idA, idB })
    if (records.length === 0) {
      return res.json({ found: false, degrees: null, path: [] })
    }
    const nodes = records[0].get('path')
    const path = nodes.map((n) => toUser(n))
    res.json({ found: true, degrees: path.length - 1, path })
  }),
)

export default router
