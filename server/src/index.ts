import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { config as loadEnv } from 'dotenv'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rateLimit } from './middleware/rateLimit.js'
import { getConfig } from './config.js'
import { connectDb } from './db/connect.js'
import { PublishedStandings } from './db/models/PublishedStandings.js'
import { adminRoutes } from './routes/admin.js'
import { authRoutes } from './routes/auth.js'
import { profileRoutes } from './routes/profile.js'
import { questionRoutes } from './routes/questions.js'
import { submissionRoutes } from './routes/submissions.js'

loadEnv({ path: join(dirname(fileURLToPath(import.meta.url)), '../.env') })

const app = new Hono()
const frontendOrigin = process.env.FRONTEND_URL ?? 'http://localhost:5173'

app.use(
  '*',
  cors({
    origin: frontendOrigin,
    credentials: true,
  }),
)

const writeLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, keyPrefix: 'write' })
const adminLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, keyPrefix: 'admin' })

app.get('/api/health', (c) => c.json({ status: 'ok' }))

app.get('/api/config', (c) => c.json(getConfig()))

app.get('/api/standings', async (c) => {
  const published = await PublishedStandings.findOne({ isActive: true }).sort({ createdAt: -1 })

  if (!published) {
    return c.json({ published: false })
  }

  return c.json({
    published: true,
    publishedAt: published.createdAt,
    standings: JSON.parse(published.standingsJson),
    svg: published.svgData,
  })
})

app.route('/api/auth', authRoutes)
app.use('/api/submissions/*', writeLimiter)
app.route('/api/submissions', submissionRoutes)
app.use('/api/questions/*', writeLimiter)
app.route('/api/questions', questionRoutes)
app.route('/api/profile', profileRoutes)
app.use('/api/admin/*', adminLimiter)
app.route('/api/admin', adminRoutes)

const port = Number(process.env.PORT ?? 3001)

async function main() {
  await connectDb()
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Server running at http://localhost:${port}`)
  })
}

main().catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})
