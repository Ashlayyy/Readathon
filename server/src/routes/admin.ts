import { Hono } from 'hono'
import type { Context } from 'hono'
import { getStaticConfig, reloadConfig } from '../config.js'
import { getTeamById } from '../services/prompts.js'
import { Question, questionToAdminPublic } from '../db/models/Question.js'
import { PublishedStandings } from '../db/models/PublishedStandings.js'
import { StandingsEvent } from '../db/models/StandingsEvent.js'
import { Submission } from '../db/models/Submission.js'
import { User } from '../db/models/User.js'
import {
  assignTeamsRandomly,
  createUserByAdmin,
  getSessionUser,
  requireAdmin,
  userToAdminPublic,
  userToPublic,
  AuthError,
} from '../services/auth.js'
import {
  calculateScore,
  calculateStandings,
  submissionToPublic,
  validateSubmission,
  type SubmissionInput,
} from '../services/scoring.js'
import { generateStandingsSvg } from '../services/standings-image.js'
import { calculateStandingsBreakdown } from '../services/standings-breakdown.js'
import { generateBreakdownSvg } from '../services/standings-breakdown-image.js'
import { maybeNotifyQuestionAnswered, notifyStandingsPublished } from '../services/notifications.js'
import { notifyDiscordStandingsPublished } from '../services/discord.js'
import { svgToPng } from '../services/svgToPng.js'
import {
  getSiteSettingsAdminSync,
  updateSiteSettings,
} from '../services/siteSettings.js'
import {
  createPrompt,
  deletePrompt,
  importPromptsFromConfigFile,
  importPromptsFromJson,
  isPromptLive,
  promptToAdminPublic,
  promptsUseDatabase,
  refreshPromptsCache,
  updatePrompt,
  type PromptInput,
} from '../services/prompts.js'
import { Prompt } from '../db/models/Prompt.js'
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
    users: users.map(userToAdminPublic),
    pending: users.filter((u) => u.status === 'pending').length,
    assigned: users.filter((u) => u.status === 'assigned').length,
  })
})

adminRoutes.post('/users', async (c) => {
  try {
    const body = await c.req.json<{ displayName: string; email: string; teamId?: string | null }>()
    const user = await createUserByAdmin(body.displayName, body.email, body.teamId)
    return c.json({ user: userToAdminPublic(user) })
  } catch (e) {
    if (e instanceof AuthError) return c.json({ error: e.message }, 400)
    throw e
  }
})

adminRoutes.get('/settings', (c) => {
  return c.json({ settings: getSiteSettingsAdminSync() })
})

adminRoutes.patch('/settings', async (c) => {
  const body = await c.req.json<{
    showTeamRosters?: boolean
    discordWebhookUrl?: string
    discordRoleId?: string
  }>()
  try {
    const settings = await updateSiteSettings(body)
    return c.json({ settings })
  } catch (e) {
    if (e instanceof Error && e.message === 'Invalid Discord webhook URL') {
      return c.json({ error: e.message }, 400)
    }
    if (e instanceof Error && e.message === 'Invalid Discord role ID') {
      return c.json({ error: e.message }, 400)
    }
    throw e
  }
})

adminRoutes.post('/assign-teams', async (c) => {
  const result = await assignTeamsRandomly()
  return c.json(result)
})

adminRoutes.patch('/users/:id/team', async (c) => {
  const body = await c.req.json<{ teamId?: string | null }>()
  const user = await User.findById(c.req.param('id'))
  if (!user) return c.json({ error: 'User not found' }, 404)

  const teamId = body.teamId?.trim() || null

  if (teamId === null) {
    user.teamId = null
    user.status = 'pending'
  } else {
    if (!getTeamById(teamId)) return c.json({ error: 'Invalid team' }, 400)
    user.teamId = teamId
    user.status = 'assigned'
  }

  await user.save()
  return c.json({ user: userToPublic(user) })
})

adminRoutes.patch('/users/:id/admin', async (c) => {
  const admin = requireAdmin(await getSessionUser(c))
  const body = await c.req.json<{ isAdmin?: boolean }>()

  if (typeof body.isAdmin !== 'boolean') {
    return c.json({ error: 'isAdmin must be true or false' }, 400)
  }

  const user = await User.findById(c.req.param('id'))
  if (!user) return c.json({ error: 'User not found' }, 404)

  if (user._id.toString() === admin._id.toString()) {
    return c.json({ error: 'You cannot change your own admin status' }, 400)
  }

  user.isAdmin = body.isAdmin
  await user.save()
  return c.json({ user: userToAdminPublic(user) })
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

function optionalDate(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed || null
}

adminRoutes.patch('/submissions/:id', async (c) => {
  const body = await c.req.json<SubmissionInput>()
  const submission = await Submission.findById(c.req.param('id'))
  if (!submission) return c.json({ error: 'Submission not found' }, 404)

  const owner = await User.findById(submission.userId)
  if (!owner) return c.json({ error: 'Submission owner not found' }, 404)

  const error = await validateSubmission(owner, body, {
    excludeSubmissionId: submission._id.toString(),
  })
  if (error) return c.json({ error }, 400)

  const score = calculateScore(owner, body)

  submission.bookTitle = body.bookTitle.trim()
  submission.bookAuthor = body.bookAuthor.trim()
  submission.pageCount = body.pageCount
  submission.format = body.format
  submission.startedAt = optionalDate(body.startedAt)
  submission.finishedAt = optionalDate(body.finishedAt)
  submission.submissionType = body.submissionType
  submission.targetTeamId = body.submissionType === 'sabotage' ? (body.targetTeamId ?? null) : null
  submission.promptIds = body.promptIds
  submission.bonusCompetition = body.bonusCompetition
  submission.bonusTeamPromptIds = body.bonusTeamPromptIds
  submission.pageBonus = score.pageBonus
  submission.promptPoints = score.promptPoints
  submission.bonusPoints = score.bonusPoints
  submission.totalImpact = score.totalImpact

  await submission.save()

  const user = owner
  return c.json({
    submission: {
      ...submissionToPublic(submission),
      userName: user.displayName,
      userEmail: user.email,
      userTeamId: user.teamId ?? null,
    },
    breakdown: score,
  })
})

adminRoutes.delete('/submissions/:id', async (c) => {
  const submission = await Submission.findByIdAndDelete(c.req.param('id'))
  if (!submission) return c.json({ error: 'Submission not found' }, 404)
  return c.json({ ok: true })
})

function svgAttachment(c: Context, filename: string, svg: string) {
  c.header('Content-Type', 'image/svg+xml')
  c.header('Content-Disposition', `attachment; filename="${filename}"`)
  return c.body(svg)
}

adminRoutes.get('/standings/current', async (c) => {
  const standings = await calculateStandings()
  const breakdown = await calculateStandingsBreakdown()
  const { weekLabel } = getWeekInfo()
  const svg = generateStandingsSvg(standings, weekLabel)
  const breakdownSvg = generateBreakdownSvg(breakdown, weekLabel)
  const active = await PublishedStandings.findOne({ isActive: true }).sort({ createdAt: -1 })
  const activeWeeks = await PublishedStandings.find({ isActive: true }).sort({ createdAt: -1 })
  const history = await StandingsEvent.find().sort({ createdAt: -1 }).limit(100)

  return c.json({
    current: { standings, svg, breakdown, breakdownSvg },
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
  const { weekKey, weekLabel } = getWeekInfo()
  const svg = generateStandingsSvg(standings, weekLabel)
  return svgAttachment(c, `standings-${weekKey}.svg`, svg)
})

adminRoutes.get('/standings/discord-preview.png', async (c) => {
  const kind = c.req.query('kind') ?? 'standings'
  const { weekKey, weekLabel } = getWeekInfo()

  let svg: string
  if (kind === 'breakdown') {
    const breakdown = await calculateStandingsBreakdown()
    svg = generateBreakdownSvg(breakdown, weekLabel)
  } else {
    const standings = await calculateStandings()
    svg = generateStandingsSvg(standings, weekLabel)
  }

  const png = svgToPng(svg)
  c.header('Content-Type', 'image/png')
  c.header('Cache-Control', 'no-store')
  c.header('Content-Disposition', `inline; filename="discord-${kind}-${weekKey}.png"`)
  return c.body(new Uint8Array(png))
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
  const breakdown = await calculateStandingsBreakdown()
  const svg = generateStandingsSvg(standings, weekLabel)
  const breakdownSvg = generateBreakdownSvg(breakdown, weekLabel)
  const breakdownJson = JSON.stringify(breakdown)

  await PublishedStandings.updateMany({ isActive: true }, { isActive: false, unpublishedAt: new Date() })

  const doc = await PublishedStandings.create({
    weekKey,
    weekLabel,
    standingsJson: JSON.stringify(standings),
    svgData: svg,
    breakdownJson,
    breakdownSvgData: breakdownSvg,
    isActive: true,
  })

  await StandingsEvent.create({
    action: 'published',
    weekKey,
    weekLabel,
    standingsJson: JSON.stringify(standings),
    svgData: svg,
    breakdownJson,
    breakdownSvgData: breakdownSvg,
    adminName: admin.displayName,
    adminEmail: admin.email,
    publicationId: doc._id,
  })

  const emailResult = await notifyStandingsPublished(weekLabel).catch((e) => {
    console.error('[notifications] Standings emails failed:', e)
    return { sent: 0, skipped: 0 }
  })

  const discordResult = await notifyDiscordStandingsPublished(weekKey, svg, breakdownSvg).catch((e) => {
    console.error('[discord] Standings webhook failed:', e)
    return { sent: false }
  })

  return c.json({
    id: doc._id.toString(),
    weekKey,
    weekLabel,
    publishedAt: doc.createdAt,
    standings,
    emailsSent: emailResult.sent,
    emailsSkipped: emailResult.skipped,
    discordSent: discordResult.sent,
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

adminRoutes.post('/reload-config', async (c) => {
  reloadConfig()
  await refreshPromptsCache()
  return c.json({ ok: true })
})

adminRoutes.get('/prompts', async (c) => {
  const rows = await Prompt.find().sort({ goesLiveAt: 1, sortOrder: 1, label: 1 })
  return c.json({
    usingDatabase: promptsUseDatabase(),
    prompts: rows.map(promptToAdminPublic),
    liveCount: rows.filter((p) => isPromptLive(p)).length,
    scheduledCount: rows.filter(
      (p) => p.isActive && p.goesLiveAt && new Date(p.goesLiveAt) > new Date(),
    ).length,
    draftCount: rows.filter((p) => !p.isActive).length,
  })
})

adminRoutes.post('/prompts', async (c) => {
  try {
    const body = await c.req.json<PromptInput>()
    const doc = await createPrompt(body)
    return c.json({ prompt: promptToAdminPublic(doc) })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'Failed to create prompt' }, 400)
  }
})

adminRoutes.patch('/prompts/:id', async (c) => {
  try {
    const body = await c.req.json<Partial<PromptInput>>()
    const doc = await updatePrompt(c.req.param('id'), body)
    return c.json({ prompt: promptToAdminPublic(doc) })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'Failed to update prompt' }, 400)
  }
})

adminRoutes.delete('/prompts/:id', async (c) => {
  try {
    await deletePrompt(c.req.param('id'))
    return c.json({ ok: true })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'Failed to delete prompt' }, 400)
  }
})

adminRoutes.post('/prompts/import-json', async (c) => {
  try {
    const { replaceExisting, pack } = await c.req.json<{ replaceExisting?: boolean; pack: unknown }>()
    if (pack === undefined || pack === null) {
      return c.json({ error: 'Upload a JSON prompt pack in the request body.' }, 400)
    }
    const result = await importPromptsFromJson(pack, Boolean(replaceExisting))
    return c.json(result)
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'Import failed' }, 400)
  }
})

adminRoutes.post('/prompts/import-from-config', async (c) => {
  try {
    const { replaceExisting } = await c.req.json<{ replaceExisting?: boolean }>()
    const result = await importPromptsFromConfigFile(Boolean(replaceExisting))
    return c.json(result)
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'Import failed' }, 400)
  }
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

  await maybeNotifyQuestionAnswered(question.userId, question.message, trimmed, admin.displayName)

  return c.json({ question: questionToAdminPublic(question) })
})

adminRoutes.delete('/questions/:id', async (c) => {
  const id = c.req.param('id')
  const result = await Question.findByIdAndDelete(id)
  if (!result) return c.json({ error: 'Question not found' }, 404)
  return c.json({ ok: true })
})
