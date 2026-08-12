import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { config } from './config.js'
import { checkHealth } from './db.js'
import usersRouter from './routes/users.js'
import metaRouter from './routes/meta.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = path.join(__dirname, '..', 'public')

const app = express()
app.use(express.json())
app.use(express.static(PUBLIC_DIR))

// API
app.use('/api', metaRouter)
app.use('/api/users', usersRouter)

// Unknown API route
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'not-found', message: 'Unknown API route.' })
})

// Central error handler: keep the app alive and return a friendly message
// when the database is unreachable or a query fails.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  const message = String((err && err.message) || err || '')
  const dbUnreachable =
    (err && (err.code === 'SERVICE_UNAVAILABLE' || err.code === 'SESSION_EXPIRED')) ||
    /connect|connection refused|auth|authentication|unavailable|unreachable|invalid credential/i.test(message)
  console.error('[error]', message)
  res.status(dbUnreachable ? 503 : 500).json({
    error: dbUnreachable ? 'database-unreachable' : 'internal',
    message: dbUnreachable
      ? 'Could not reach the graph database. Check that your instance is running and your .env credentials are correct.'
      : 'Something went wrong while processing your request.',
    detail: process.env.NODE_ENV === 'production' ? undefined : message,
  })
})

app.listen(config.port, async () => {
  console.log(`\n  Six Degrees is running → http://localhost:${config.port}\n`)
  const health = await checkHealth()
  if (!health.ok) {
    console.warn(
      `  ⚠  Could not reach the graph database at ${config.neo4jUri}\n` +
        `     The app is still up (pages + error states work). Run "npm run seed" once the DB is reachable.\n` +
        `     ${health.error}\n`,
    )
  } else {
    console.log(`  ✔  Connected to the graph database at ${config.neo4jUri}\n`)
  }
})
