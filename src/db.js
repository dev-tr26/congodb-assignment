import neo4j from 'neo4j-driver'
import { config } from './config.js'

/**
 * Thin wrapper around the official Neo4j driver. CognoDB speaks the same
 * openCypher-over-Bolt protocol, so the stock driver works unchanged.
 *
 * The driver is created lazily and reused for the process lifetime.
 */
let driver = null

export function getDriver() {
  if (!driver) {
    driver = neo4j.driver(
      config.neo4jUri,
      neo4j.auth.basic(config.neo4jUser, config.neo4jPassword),
      {
        maxConnectionPoolSize: 50,
        connectionTimeout: 10_000,
        // Fail fast instead of hanging forever when the DB is unreachable.
        disableLosslessIntegers: false,
      },
    )
  }
  return driver
}

/**
 * Cypher is strict about types: a JS `1` arrives as a Float `1.0`, which Neo4j
 * rejects in LIMIT/SKIP/ordering positions. Normalise integer params to
 * neo4j.int() so every query stays valid.
 */
function intParams(params) {
  const out = {}
  for (const [key, value] of Object.entries(params)) {
    out[key] = typeof value === 'number' && Number.isInteger(value) ? neo4j.int(value) : value
  }
  return out
}

/** Run a parameterised Cypher query and return the raw records. */
export async function runQuery(cypher, params = {}) {
  const session = getDriver().session()
  try {
    const result = await session.run(cypher, intParams(params))
    return result.records
  } finally {
    await session.close()
  }
}

/** Close the driver (lets CLI scripts exit cleanly). */
export async function closeDriver() {
  if (driver) {
    await driver.close()
    driver = null
  }
}

/** Lightweight connectivity check used by /api/health and the UI banner. */
export async function checkHealth() {
  try {
    await getDriver().verifyConnectivity()
    return { ok: true, error: null }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

/** Convert a neo4j Integer (or plain number) to a JS number safely. */
export function toNumber(value) {
  if (typeof value === 'number') return value
  if (value && typeof value.toNumber === 'function') return value.toNumber()
  return Number(value)
}
