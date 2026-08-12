import 'dotenv/config'
import { closeDriver, getDriver, runQuery } from '../src/db.js'
import * as Q from '../src/queries.js'
import { ensureDataset, readEdges, DATASET_URL, LOCAL_FILE } from './dataset.js'
import { buildProfiles } from './profiles.js'

/**
 * Seed the graph database with the SNAP Facebook friendship network.
 *
 *   npm run seed                  # load the full network
 *   npm run seed -- --limit 5000  # only the first 5,000 edges (quick smoke test)
 *   npm run seed -- --fresh       # wipe the database first
 *
 * Every Cypher statement is parameterised (UNWIND + $params), never
 * string-concatenated.
 */
async function main() {
  const args = process.argv.slice(2)
  const limitArg = args.find((a) => a.startsWith('--limit='))
  const limit = limitArg ? Number.parseInt(limitArg.split('=')[1], 10) : null
  const fresh = args.includes('--fresh')

  // 1. Make sure we have a dataset
  const file = await ensureDataset()
  console.log(`\nUsing dataset: ${file} (${DATASET_URL})`)
  const allEdges = readEdges(file)
  const edges = limit ? allEdges.slice(0, limit) : allEdges
  console.log(`Edges to load: ${edges.length.toLocaleString()}`)

  // 2. Compute per-node degree and build deterministic profiles
  const degree = new Map()
  for (const [a, b] of edges) {
    degree.set(a, (degree.get(a) || 0) + 1)
    degree.set(b, (degree.get(b) || 0) + 1)
  }
  const ids = [...degree.keys()].sort((x, y) => x - y)
  const users = buildProfiles(ids).map((u) => ({ ...u, degree: degree.get(u.id) }))
  console.log(`Users to load: ${users.length.toLocaleString()}`)

  // 3. Connect
  try {
    await getDriver().verifyConnectivity()
  } catch (err) {
    console.error(
      `\n✖ Could not reach the graph database at ${process.env.NEO4J_URI || 'bolt://localhost:7687'}.\n` +
        `  • For CognoDB: set NEO4J_URI / NEO4J_USER / NEO4J_PASSWORD in .env (see .env.example).\n` +
        `  • For local testing: run "npm run db:up" first, then this script.\n`,
    )
    process.exit(1)
  }
  console.log('✔ Connected to the graph database\n')

  // 4. Optional clean slate
  if (fresh) {
    console.log('--fresh: wiping existing data …')
    await runQuery(Q.DROP_ALL)
  }

  // 5. Indexes (idempotent)
  console.log('Creating indexes …')
  await runQuery(Q.CREATE_INDEX_USER_ID)
  await runQuery(Q.CREATE_INDEX_USER_NAME)

  // 6. Users in a single batched, parameterised statement
  console.log(`Loading ${users.length.toLocaleString()} users …`)
  await runQuery(Q.UPSERT_USERS, { users })
  console.log('  users ✔')

  // 7. Edges, both directions (the network is undirected). A single
  //    parameterised UNWIND statement — one transaction, idempotent via MERGE.
  console.log(`Loading ${edges.length.toLocaleString()} friendships …`)
  await runQuery(Q.UPSERT_EDGES, { batch: edges })
  console.log('  friendships ✔\n')

  // 8. Verify
  const usersRec = await runQuery(Q.COUNT_USERS)
  const edgesRec = await runQuery(Q.COUNT_EDGES)
  const storedUsers = Number(usersRec[0].get('n'))
  const storedEdges = Number(edgesRec[0].get('n')) / 2

  console.log('─────────────── seed complete ───────────────')
  console.log(`  Users:        ${storedUsers.toLocaleString()}`)
  console.log(`  Friendships:  ${storedEdges.toLocaleString()}`)
  console.log('─────────────────────────────────────────────\n')
  console.log('Next: npm start, then open http://localhost:3000')

  await closeDriver()
}

main().catch((err) => {
  console.error('\n✖ Seeding failed:', err.message)
  process.exit(1)
})
