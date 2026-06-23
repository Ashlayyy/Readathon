import { Hono } from 'hono'
import type { Context } from 'hono'
import { reloadConfig } from '../config.js'
import { Question, questionToAdminPublic } from '../db/models/Question.js'
import { PublishedStandings } from '../db/models/PublishedStandings.js'
import { StandingsEvent } from '../db/models/StandingsEvent.js'
import { Submission } from '../db/models/Submission.js'
import { User } from '../db/models/User.js'
import {
  assignTeamsRandomly,
  getSessionUser,
  requireAdmin,
  userToPublic,
} from '../services/auth.js'
import { calculateStandings, submissionToPublic } from '../services/scoring.js'
import { generateStandingsSvg } from '../services/standings-image.js'
import { getWeekInfo } from '../utils/week.js'

export const adminRoutes = new Hono()

adminRoutes.use('*', async (c, next) => {
  const user = await getSessionUser(c)
  try {
    requireAdmin(user)
    await next()
  } catch {
    return c.json({ error: 'Admin access required' }, 403)
  }
})

adminRoutes.get('/users', async (c) => {
  const users = await User.find().sort({ createdAt: -1 })
  return c.json({
    users: users.map(userToPublic),
    pending: users.filter((u) => u.status === 'pending').length,
    assigned: users.filter((u) => u.status === 'assigned').length,
  })
})

adminRoutes.post('/assign-teams', async (c) => {
  const result = await assignTeamsRandomly()
  return c.json(result)
})

adminRoutes.get('/submissions', async (c) => {
  const rows = await Submission.find().sort({ createdAt: -1 })
  const userIds = [...new Set(rows.map((sub) => sub.userId.toString()))]
  const users = await User.find({ _id: { $in: userIds } })
  const userById = new Map(users.map((u) => [u._id.toString(), u]))
  return c.json({
    submissions: rows.map((sub) => {
      const user = userById.get(sub.userId.toString())

      return {
        ...submissionToPublic(sub),
        userName: user?.displayName ?? 'Unknown reader',
        userEmail: user?.email ?? '',
        userTeamId: user?.teamId ?? null,
      }
    }),
  })
})

function svgAttachment(c: Context, filename: string, svg: string) {
  c.header('Content-Type', 'image/svg+xml')
  c.header('Content-Disposition', `attachment; filename="${filename}"`)
  return c.body(svg)
}

adminRoutes.get('/standings/current', async (c) => {
  const standings = await calculateStandings()
  const svg = generateStandingsSvg(standings)
  const active = await PublishedStandings.findOne({ isActive: true }).sort({ createdAt: -1 })
  const activeWeeks = await PublishedStandings.find({ isActive: true }).sort({ createdAt: -1 })
  const history = await StandingsEvent.find().sort({ createdAt: -1 }).limit(100)

  return c.json({
    current: { standings, svg },
    activePublication: active
      ? {
          id: active._id.toString(),
          weekKey: active.weekKey,
          weekLabel: active.weekLabel,
          publishedAt: active.createdAt,
        }
      : null,
    activeWeeks: activeWeeks.map((p) => ({
      id: p._id.toString(),
      weekKey: p.weekKey,
      weekLabel: p.weekLabel,
      publishedAt: p.createdAt,
    })),
    history: history.map((e) => ({
      id: e._id.toString(),
      action: e.action,
      weekKey: e.weekKey,
      weekLabel: e.weekLabel,
      adminName: e.adminName,
      adminEmail: e.adminEmail,
      createdAt: e.createdAt,
    })),
  })
})

adminRoutes.get('/standings/current.svg', async (c) => {
  const standings = await calculateStandings()
  const { weekKey } = getWeekInfo()
  const svg = generateStandingsSvg(standings)
  return svgAttachment(c, `standings-${weekKey}.svg`, svg)
})

adminRoutes.get('/standings/history/:id.svg', async (c) => {
  const event = await StandingsEvent.findById(c.req.param('id'))
  if (!event) return c.json({ error: 'History entry not found' }, 404)
  return svgAttachment(
    c,
    `standings-${event.weekKey}-${event.action}.svg`,
    event.svgData,
  )
})

adminRoutes.post('/standings/publish', async (c) => {
  const admin = requireAdmin(await getSessionUser(c))
  const { weekKey, weekLabel } = getWeekInfo()

  const standings = await calculateStandings()
  const svg = generateStandingsSvg(standings, `REALMATHON 5.0 — ${weekLabel}`)

  await PublishedStandings.updateMany({ isActive: true }, { isActive: false, unpublishedAt: new Date() })

  const doc = await PublishedStandings.create({
    weekKey,
    weekLabel,
    standingsJson: JSON.stringify(standings),
    svgData: svg,
    isActive: true,
  })

  await StandingsEvent.create({
    action: 'published',
    weekKey,
    weekLabel,
    standingsJson: JSON.stringify(standings),
    svgData: svg,
    adminName: admin.displayName,
    adminEmail: admin.email,
    publicationId: doc._id,
  })

  return c.json({
    id: doc._id.toString(),
    weekKey,
    weekLabel,
    publishedAt: doc.createdAt,
    standings,
  })
})

adminRoutes.post('/standings/unpublish', async (c) => {
  const admin = requireAdmin(await getSessionUser(c))
  const { publicationId } = await c.req.json<{ publicationId: string }>()

  if (!publicationId) return c.json({ error: 'publicationId is required' }, 400)

  const publication = await PublishedStandings.findById(publicationId)
  if (!publication) return c.json({ error: 'Publication not found' }, 404)
  if (!publication.isActive) return c.json({ error: 'This week is already unpublished' }, 400)

  publication.isActive = false
  publication.unpublishedAt = new Date()
  await publication.save()

  await StandingsEvent.create({
    action: 'unpublished',
    weekKey: publication.weekKey,
    weekLabel: publication.weekLabel,
    standingsJson: publication.standingsJson,
    svgData: publication.svgData,
    adminName: admin.displayName,
    adminEmail: admin.email,
    publicationId: publication._id,
  })

  return c.json({ ok: true, weekLabel: publication.weekLabel })
})

adminRoutes.post('/reload-config', (c) => {
  reloadConfig()
  return c.json({ ok: true })
})

adminRoutes.get('/questions', async (c) => {
  const rows = await Question.find().sort({ createdAt: -1 })
  const unread = rows.filter((q) => q.status === 'unread').length

  return c.json({
    unread,
    questions: rows.map(questionToAdminPublic),
  })
})

adminRoutes.get('/questions/unread-count', async (c) => {
  const unread = await Question.countDocuments({ status: 'unread' })
  return c.json({ unread })
})

adminRoutes.patch('/questions/:id', async (c) => {
  const id = c.req.param('id')
  const { status } = await c.req.json<{ status: 'read' | 'unread' }>()

  const question = await Question.findByIdAndUpdate(id, { status }, { new: true })
  if (!question) return c.json({ error: 'Question not found' }, 404)

  return c.json({ question: questionToAdminPublic(question) })
})

adminRoutes.post('/questions/:id/answer', async (c) => {
  const admin = requireAdmin(await getSessionUser(c))
  const { answer } = await c.req.json<{ answer: string }>()
  const trimmed = answer?.trim()

  if (!trimmed || trimmed.length < 2) {
    return c.json({ error: 'Answer must be at least 2 characters' }, 400)
  }
  if (trimmed.length > 2000) {
    return c.json({ error: 'Answer must be 2000 characters or fewer' }, 400)
  }

  const question = await Question.findByIdAndUpdate(
    c.req.param('id'),
    {
      answer: trimmed,
      answeredAt: new Date(),
      answeredByName: admin.displayName,
      status: 'answered',
      answerSeen: false,
    },
    { new: true },
  )
  if (!question) return c.json({ error: 'Question not found' }, 404)

  return c.json({ question: questionToAdminPublic(question) })
})

adminRoutes.delete('/questions/:id', async (c) => {
  const id = c.req.param('id')
  const result = await Question.findByIdAndDelete(id)
  if (!result) return c.json({ error: 'Question not found' }, 404)
  return c.json({ ok: true })
})
