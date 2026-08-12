import 'dotenv/config'
import { closeDriver, getDriver, runQuery, toNumber } from '../src/db.js'
import * as Q from '../src/queries.js'

/**
 * Smoke test — runs every headline query against a live database and prints
 * the results. Useful for verifying a fresh seed or a CognoDB instance.
 *
 *   npm run smoke
 */
async function main() {
  try {
    await getDriver().verifyConnectivity()
  } catch (err) {
    console.error('✖ Database unreachable:', err.message)
    process.exit(1)
  }

  const pick = (record, key) => record.get(key).properties

  // Stats
  const [usersRec, edgesRec, degRec] = await Promise.all([
    runQuery(Q.STATS_USERS),
    runQuery(Q.STATS_FRIENDSHIPS),
    runQuery(Q.STATS_DEGREES),
  ])
  console.log('── Stats ────────────────────────────────────────')
  console.log('users:', toNumber(usersRec[0].get('users')))
  console.log('friendships:', toNumber(edgesRec[0].get('friendships')) / 2)
  console.log('avgDegree:', toNumber(degRec[0].get('avgDegree')).toFixed(1), '| maxDegree:', toNumber(degRec[0].get('maxDegree')))

  // Pick the most-connected user as our demo "me"
  const topRec = await runQuery(Q.TOP_USERS, { limit: 1 })
  const me = pick(topRec[0], 'u')
  console.log(`\n── Demo user: ${me.name} (id ${me.id}, ${me.degree} friends) ──`)

  // Core: recommendations ranked by mutual friend count
  const recs = await runQuery(Q.RECOMMENDATIONS, { userId: me.id, limit: 5 })
  console.log('\nRecommendations (friends-of-friends, ranked by mutual friends):')
  for (const r of recs) {
    const c = r.get('candidate').properties
    console.log(`  #${toNumber(c.id)} ${c.name} — ${toNumber(r.get('mutualCount'))} mutual friends`)
  }

  // Friends
  const friends = await runQuery(Q.FRIENDS, { id: me.id, limit: 5 })
  console.log('\nDirect friends (first 5):')
  for (const r of friends) {
    const f = r.get('f').properties
    console.log(`  #${toNumber(f.id)} ${f.name} (${f.city})`)
  }

  // Mutual friends with the first suggestion
  if (recs.length > 0) {
    const other = recs[0].get('candidate').properties
    const mutual = await runQuery(Q.MUTUAL_FRIENDS, { idA: me.id, idB: toNumber(other.id) })
    console.log(`\nMutual friends with ${other.name}:`)
    for (const r of mutual) {
      const m = r.get('m').properties
      console.log(`  #${toNumber(m.id)} ${m.name}`)
    }
  }

  // Degrees of separation between me and the least-connected user
  const degRecs = await runQuery(
    `MATCH (u:User) RETURN u ORDER BY u.degree ASC, u.id ASC LIMIT $limit`,
    { limit: 1 },
  )
  const far = degRecs[0].get('u').properties
  const paths = await runQuery(Q.SHORTEST_PATH, { idA: me.id, idB: toNumber(far.id) })
  console.log(`\nDegrees of separation between ${me.name} and ${far.name}:`)
  if (paths.length === 0) {
    console.log('  No connection within 8 hops.')
  } else {
    const names = paths[0].get('path').map((n) => n.properties.name)
    console.log(`  ${names.length - 1} hop(s): ${names.join(' → ')}`)
  }

  // Search
  const search = await runQuery(Q.SEARCH, { q: 'ana', limit: 5 })
  console.log('\nSearch "ana":')
  for (const r of search) {
    const u = r.get('u').properties
    console.log(`  #${toNumber(u.id)} ${u.name}`)
  }

  console.log('\n✔ All queries completed.')
  await closeDriver()
}

main().catch((err) => {
  console.error('✖ Smoke test failed:', err.message)
  process.exit(1)
})
