import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { config as loadEnv } from 'dotenv'
import { existsSync } from 'node:fs'
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

const __dirname = dirname(fileURLToPath(import.meta.url))
const distPath = join(__dirname, '../../frontend/dist')
const isProduction = process.env.NODE_ENV === 'production'

if (isProduction && existsSync(distPath)) {
  app.use('*', async (c, next) => {
    if (c.req.path.startsWith('/api')) return next()
    return serveStatic({ root: distPath })(c, next)
  })
  app.get('*', async (c, next) => {
    if (c.req.path.startsWith('/api')) return next()
    return serveStatic({ root: distPath, path: 'index.html' })(c, next)
  })
}

const port = Number(process.env.PORT ?? 3001)

async function main() {
  if (isProduction && !existsSync(distPath)) {
    console.warn(
      `Warning: frontend/dist not found at ${distPath}. Run "npm run build --prefix frontend" before starting in production.`,
    )
  }
  if (isProduction && !process.env.MONGODB_URI) {
    console.error('FATAL: Set MONGODB_URI in server/.env for production (e.g. MongoDB Atlas).')
    process.exit(1)
  }

  await connectDb()
  serve({ fetch: app.fetch, port }, () => {
    const mode = isProduction ? 'production' : 'development'
    console.log(`Server running (${mode}) at http://localhost:${port}`)
  })
}

main().catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})
