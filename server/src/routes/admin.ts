import { Hono } from 'hono'
import type { Context } from 'hono'
import { getStaticConfig, reloadConfig } from '../config.js'
import { getTeamById } from '../services/prompts.js'
import { Question, questionToAdminPublic } from '../db/models/Question.js'
import { PublishedStandings } from '../db/models/PublishedStandings.js'
import { StandingsEvent } from '../db/models/StandingsEvent.js'
import { Submission } from '../db/models/Submission.js'
import { withActive } from '../db/activeSubmission.js'
import { User } from '../db/models/User.js'
import { logAudit, listAuditLog } from '../services/audit.js'
import {
  createUserByAdmin,
  getSessionUser,
  requireAdmin,
  userToAdminPublic,
  userToPublic,
  AuthError,
} from '../services/auth.js'
import {
  applyAssignmentSet,
  applyTeamAssignments,
  clearAssignmentSet,
  enrichFromProposedAssignments,
  listAssignmentSets,
  previewAssignmentSet,
  previewTeamAssignments,
  saveAssignmentSet,
} from '../services/teamAssignment.js'
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
import { maybeNotifyQuestionAnswered } from '../services/notifications.js'
import { svgToPng } from '../services/svgToPng.js'
import {
  getDiscordRoleId,
  getSiteSettingsAdminSync,
  updateSiteSettings,
  type SiteSettingsAdminPatch,
} from '../services/siteSettings.js'
import { publishStandings } from '../services/standingsPublish.js'
import { buildStandingsDigestDraft } from '../services/standingsDigest.js'
import {
  sendDiscordChannelMessage,
  sendDiscordMonthlyWrap,
} from '../services/discord.js'
import {
  listGuildRoles,
  verifyDiscordRole,
} from '../services/discordRoleVerify.js'
import { sendLiveStandingsToDiscord } from '../services/standingsDiscordPreview.js'
import { buildMonthlyWrapSvg } from '../services/monthlyWrap.js'
import { submissionsCreatedTotal } from '../services/metrics.js'
import {
  createPrompt,
  deletePrompt,
  importPromptsFromConfigFile,
  importPromptsFromJson,
  isPromptLive,
  previewConfigWithMonthlyEvent,
  promptToAdminPublic,
  promptsUseDatabase,
  refreshPromptsCache,
  updatePrompt,
  type PromptInput,
} from '../services/prompts.js'
import { normalizeMonthlyEventSlot } from '../services/monthlyEvents.js'
import {
  enrichActiveMonthlyEvent,
  resolveReaderOfMonth,
} from '../services/monthlyThemeExtras.js'
import { Prompt } from '../db/models/Prompt.js'
import { getWeekInfo } from '../utils/week.js'
import {
  applyCoverUpdates,
  listCoverProposals,
  streamCoverLookups,
} from '../services/coverBackfill.js'

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

adminRoutes.get('/stats', async (c) => {
  const [totalUsers, pending, assigned, submissions, unreadQuestions] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ status: 'pending' }),
    User.countDocuments({ status: 'assigned' }),
    Submission.countDocuments(withActive()),
    Question.countDocuments({ status: 'unread' }),
  ])
  return c.json({ totalUsers, pending, assigned, submissions, unreadQuestions })
})

adminRoutes.get('/analytics', async (c) => {
  const { buildAdminAnalytics } = await import('../services/adminAnalytics.js')
  try {
    const analytics = await buildAdminAnalytics({
      from: c.req.query('from'),
      to: c.req.query('to'),
      preset: c.req.query('preset'),
      teamId: c.req.query('teamId'),
    })
    return c.json({ analytics })
  } catch (e) {
    return c.json(
      { error: e instanceof Error ? e.message : 'Failed to build analytics' },
      400,
    )
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

/**
 * Preview a monthly theme slot as if it were live (drafts allowed).
 * body: MonthlyEventSlot (or partial that normalizes)
 */
adminRoutes.post('/monthly-themes/preview-config', async (c) => {
  requireAdmin(await getSessionUser(c))
  const body = await c.req.json<unknown>()
  const slot = normalizeMonthlyEventSlot(body)
  if (!slot) {
    return c.json(
      { error: 'Invalid theme slot (need valid from/to dates, etc.).' },
      400,
    )
  }
  const config = previewConfigWithMonthlyEvent(slot)
  if (config.site) {
    config.site.activeMonthlyEvent = await enrichActiveMonthlyEvent(slot)
  }
  return c.json({ config })
})

/** Resolve reader-of-the-month for admin UI (auto or override). */
adminRoutes.post('/monthly-themes/resolve-reader', async (c) => {
  requireAdmin(await getSessionUser(c))
  const body = await c.req.json<{
    from?: string
    to?: string
    userId?: string
    shoutout?: string
  }>()
  const from = String(body.from ?? '').trim()
  const to = String(body.to ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return c.json({ error: 'Valid from/to dates required.' }, 400)
  }
  const reader = await resolveReaderOfMonth({
    from,
    to,
    readerOfMonth: {
      userId: String(body.userId ?? '').trim(),
      shoutout: String(body.shoutout ?? '').trim(),
    },
  })
  return c.json({ reader })
})

adminRoutes.patch('/settings', async (c) => {
  const admin = requireAdmin(await getSessionUser(c))
  const body = await c.req.json<SiteSettingsAdminPatch>()
  try {
    const before = getSiteSettingsAdminSync()
    const settings = await updateSiteSettings(body)

    if (typeof body.downtimeMode === 'boolean' && body.downtimeMode !== before.downtimeMode) {
      await logAudit({
        actor: admin,
        action: 'settings.downtime_toggled',
        entityType: 'SiteSettings',
        detail: { downtimeMode: settings.downtimeMode },
      })
    }

    const changedKeys = Object.keys(body).filter((key) => key !== 'downtimeMode')
    if (changedKeys.length > 0) {
      await logAudit({
        actor: admin,
        action: 'settings.updated',
        entityType: 'SiteSettings',
        detail: { changedKeys },
      })
    }

    return c.json({ settings })
  } catch (e) {
    if (e instanceof Error && e.message === 'Invalid Discord webhook URL') {
      return c.json({ error: e.message }, 400)
    }
    if (
      e instanceof Error &&
      (e.message === 'Invalid Discord role ID' ||
        e.message.startsWith('Invalid Discord role ID') ||
        e.message.startsWith('Invalid Discord ID') ||
        e.message.startsWith('Invalid Discord bot command') ||
        e.message.startsWith('Invalid Discord channel') ||
        e.message.includes('encrypt') ||
        e.message.includes('SETTINGS_ENCRYPTION_KEY') ||
        e.message.includes('Scheduled themes overlap') ||
        e.message.includes('monthly event') ||
        e.message.includes('ends before it starts') ||
        e.message.includes('valid from/to'))
    ) {
      return c.json({ error: e.message }, 400)
    }
    throw e
  }
})

/** List guilds the bot is currently in (memory + DB cached; ?refresh=1 forces Discord). */
adminRoutes.get('/discord/bot-guilds', async (c) => {
  requireAdmin(await getSessionUser(c))
  const force =
    c.req.query('refresh') === '1' ||
    c.req.query('refresh') === 'true' ||
    c.req.query('force') === '1'
  const { listBotGuilds } = await import('../services/discordBotGuilds.js')
  const result = await listBotGuilds({ force })
  if (!result.ok) return c.json({ error: result.error }, 400)
  return c.json({
    guilds: result.guilds,
    cached: result.cached,
    fetchedAt: result.fetchedAt,
  })
})

/** Discord gateway readiness for Admin site health. */
adminRoutes.get('/discord/gateway-status', async (c) => {
  requireAdmin(await getSessionUser(c))
  const { getDiscordGatewayStatus } = await import('../discord/gateway.js')
  return c.json(getDiscordGatewayStatus())
})

/** List guild roles (for picking bot command / ping roles in Admin). */
adminRoutes.get('/discord/guild-roles', async (c) => {
  requireAdmin(await getSessionUser(c))
  const guildId = String(c.req.query('guildId') ?? '').trim()
  const result = await listGuildRoles(guildId || undefined)
  if (!result.ok) {
    return c.json({ error: result.error }, 400)
  }
  return c.json({
    guildId: result.guildId,
    roles: result.roles
      .filter((r) => r.id !== result.guildId)
      .sort((a, b) => a.name.localeCompare(b.name)),
  })
})

/** Invite URL for the configured bot (bot + applications.commands). */
adminRoutes.get('/discord/bot-invite', async (c) => {
  requireAdmin(await getSessionUser(c))
  const { getDiscordBotInviteUrl } = await import('../services/discordRoleVerify.js')
  const result = await getDiscordBotInviteUrl()
  if (!result.ok) {
    return c.json({ error: result.error }, 400)
  }
  return c.json(result)
})

/** Verify one role ID exists on the configured guild. */
adminRoutes.post('/discord/verify-role', async (c) => {
  requireAdmin(await getSessionUser(c))
  const body = await c.req.json<{ roleId?: string; webhookUrl?: string }>()
  const roleId = String(body.roleId ?? '').trim()
  if (!roleId) {
    return c.json({ error: 'roleId is required' }, 400)
  }
  const result = await verifyDiscordRole({
    roleId,
    webhookUrl: body.webhookUrl,
  })
  if (!result.ok) {
    return c.json(
      { ok: false, error: result.error, roleId: result.roleId, guildId: result.guildId },
      400,
    )
  }
  return c.json({
    ok: true,
    roleId: result.roleId,
    roleName: result.roleName,
    guildId: result.guildId,
  })
})

/**
 * Send to test or production standings webhook.
 * body: { channel: 'test'|'production', withPing: boolean }
 * - test channel → short “test message”
 * - production channel → sample standings announce line
 */
adminRoutes.post('/discord/send', async (c) => {
  requireAdmin(await getSessionUser(c))
  const body = await c.req.json<{
    channel?: string
    withPing?: boolean
    guildId?: string
  }>()
  const channel = body.channel === 'test' ? 'test' : 'production'
  const withPing = Boolean(body.withPing)
  const guildId = String(body.guildId ?? '').trim() || undefined
  const result = await sendDiscordChannelMessage({
    channel,
    withPing,
    kind: channel === 'test' ? 'test' : 'announce',
    guildId,
  })
  if (!result.sent) {
    return c.json(
      {
        error: result.error ?? 'Failed to send Discord message',
        roleId: result.roleId,
        channel: result.channel,
        withPing: result.withPing,
      },
      400,
    )
  }
  return c.json({
    ok: true,
    roleId: result.roleId,
    channel: result.channel,
    withPing: result.withPing,
    guildId: guildId ?? null,
  })
})

/**
 * Send live standings images (optional + 4-week wrap) to test or production webhook.
 * Does not publish/unpublish standings in the DB.
 * body: { channel?: 'test'|'production', includeMonthlyWrap?: boolean, withPing?: boolean }
 */
adminRoutes.post('/discord/send-standings', async (c) => {
  requireAdmin(await getSessionUser(c))
  const body = await c.req.json<{
    channel?: string
    includeMonthlyWrap?: boolean
    withPing?: boolean
    guildId?: string
  }>()
  const channel = body.channel === 'production' ? 'production' : 'test'
  const guildId = String(body.guildId ?? '').trim() || undefined
  const result = await sendLiveStandingsToDiscord({
    channel,
    includeMonthlyWrap: Boolean(body.includeMonthlyWrap),
    withPing: Boolean(body.withPing),
    guildId,
  })
  if (!result.sent) {
    return c.json({ error: result.error ?? 'Failed to send standings' }, 400)
  }
  return c.json({
    ok: true,
    channel,
    includeMonthlyWrap: Boolean(body.includeMonthlyWrap),
    guildId: guildId ?? null,
  })
})

/** Send only the dense 4-week wrap image. */
adminRoutes.post('/discord/send-monthly-wrap', async (c) => {
  requireAdmin(await getSessionUser(c))
  const body = await c.req.json<{
    channel?: string
    withPing?: boolean
    guildId?: string
  }>()
  const channel = body.channel === 'production' ? 'production' : 'test'
  const guildId = String(body.guildId ?? '').trim() || undefined
  const wrap = await buildMonthlyWrapSvg()
  const result = await sendDiscordMonthlyWrap({
    channel,
    wrapSvg: wrap.svg,
    label: wrap.label,
    withPing: Boolean(body.withPing),
    guildId,
  })
  if (!result.sent) {
    return c.json({ error: result.error ?? 'Failed to send monthly wrap' }, 400)
  }
  return c.json({ ok: true, channel, label: wrap.label, guildId: guildId ?? null })
})

adminRoutes.get('/discord/monthly-wrap-preview.svg', async (c) => {
  requireAdmin(await getSessionUser(c))
  const wrap = await buildMonthlyWrapSvg()
  c.header('Content-Type', 'image/svg+xml; charset=utf-8')
  c.header('Cache-Control', 'no-store')
  return c.body(wrap.svg)
})

/** @deprecated Prefer POST /discord/send */
adminRoutes.post('/discord/test-webhook', async (c) => {
  requireAdmin(await getSessionUser(c))
  const result = await sendDiscordChannelMessage({
    channel: 'production',
    withPing: false,
    kind: 'test',
  })
  if (!result.sent) {
    return c.json({ error: result.error ?? 'Failed to send test message' }, 400)
  }
  return c.json({ ok: true })
})

/** @deprecated Prefer POST /discord/send */
adminRoutes.post('/discord/test-role-ping', async (c) => {
  requireAdmin(await getSessionUser(c))
  const result = await sendDiscordChannelMessage({
    channel: 'production',
    withPing: true,
    kind: 'test',
  })
  if (!result.sent) {
    return c.json(
      { error: result.error ?? 'Failed to send role ping test', roleId: result.roleId },
      400,
    )
  }
  return c.json({ ok: true, roleId: result.roleId })
})

adminRoutes.post('/assign-teams/preview', async (c) => {
  let includeAdmins = false
  try {
    const body = await c.req.json<{ includeAdmins?: boolean }>()
    includeAdmins = Boolean(body?.includeAdmins)
  } catch {
    /* empty body ok */
  }
  const result = await previewTeamAssignments(includeAdmins)
  if ('error' in result) return c.json({ error: result.error }, 400)
  return c.json(result)
})

adminRoutes.post('/assign-teams/enrich', async (c) => {
  const body = await c.req.json<{
    assignments?: { userId: string; teamId: string }[]
  }>()
  const result = await enrichFromProposedAssignments(body.assignments ?? [])
  if ('error' in result) return c.json({ error: result.error }, 400)
  return c.json(result)
})

adminRoutes.get('/assign-teams/sets', async (c) => {
  const sets = await listAssignmentSets()
  return c.json({ sets })
})

adminRoutes.put('/assign-teams/sets/:slot', async (c) => {
  const slot = Number(c.req.param('slot'))
  const body = await c.req.json<{
    label?: string
    includeAdmins?: boolean
    assignments?: { userId: string; teamId: string }[]
  }>()
  const result = await saveAssignmentSet(slot, {
    label: body.label,
    includeAdmins: body.includeAdmins,
    assignments: body.assignments ?? [],
  })
  if ('error' in result) return c.json({ error: result.error }, 400)

  const admin = requireAdmin(await getSessionUser(c))
  await logAudit({
    actor: admin,
    action: 'teams.set_saved',
    detail: { slot, count: result.count, label: result.label },
  })
  return c.json({ set: result })
})

adminRoutes.delete('/assign-teams/sets/:slot', async (c) => {
  const slot = Number(c.req.param('slot'))
  const result = await clearAssignmentSet(slot)
  if ('error' in result) return c.json({ error: result.error }, 400)
  return c.json({ set: result })
})

adminRoutes.post('/assign-teams/sets/:slot/preview', async (c) => {
  const slot = Number(c.req.param('slot'))
  const result = await previewAssignmentSet(slot)
  if ('error' in result) return c.json({ error: result.error }, 400)
  return c.json(result)
})

adminRoutes.post('/assign-teams/sets/:slot/apply', async (c) => {
  const slot = Number(c.req.param('slot'))
  const result = await applyAssignmentSet(slot)
  if ('error' in result) return c.json({ error: result.error }, 400)

  const admin = requireAdmin(await getSessionUser(c))
  await logAudit({
    actor: admin,
    action: 'teams.set_applied',
    detail: { slot, assigned: result.assigned },
  })
  return c.json(result)
})

adminRoutes.post('/assign-teams', async (c) => {
  const body = await c.req.json<{
    assignments?: { userId: string; teamId: string }[]
    includeAdmins?: boolean
  }>()

  // Legacy: no body assignments → pending-only one-shot (non-admins).
  if (!body?.assignments) {
    const { assignTeamsRandomly } = await import('../services/teamAssignment.js')
    const result = await assignTeamsRandomly()
    return c.json(result)
  }

  const result = await applyTeamAssignments(body.assignments)
  if ('error' in result) return c.json({ error: result.error }, 400)

  const admin = requireAdmin(await getSessionUser(c))
  await logAudit({
    actor: admin,
    action: 'teams.randomized',
    detail: {
      assigned: result.assigned,
      includeAdmins: Boolean(body.includeAdmins),
    },
  })

  return c.json(result)
})

adminRoutes.patch('/users/:id/team', async (c) => {
  const admin = requireAdmin(await getSessionUser(c))
  const body = await c.req.json<{ teamId?: string | null }>()
  const user = await User.findById(c.req.param('id'))
  if (!user) return c.json({ error: 'User not found' }, 404)

  const previousTeamId = user.teamId ?? null
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

  await logAudit({
    actor: admin,
    action: 'user.team_assigned',
    entityType: 'User',
    entityId: user._id.toString(),
    detail: { userName: user.displayName, from: previousTeamId, to: teamId },
  })

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
  const includeDeleted = c.req.query('includeDeleted') === '1'
  const rows = await Submission.find(includeDeleted ? {} : withActive()).sort({ createdAt: -1 })
  const userIds = [...new Set(rows.map((sub) => sub.userId.toString()))]
  const deletedByIds = [
    ...new Set(rows.filter((sub) => sub.deletedBy).map((sub) => sub.deletedBy!.toString())),
  ]
  const users = await User.find({ _id: { $in: userIds } }).select('displayName teamId')
  const deletedByUsers = await User.find({ _id: { $in: deletedByIds } }).select('displayName')
  const userById = new Map(users.map((u) => [u._id.toString(), u]))
  const deletedByNameById = new Map(deletedByUsers.map((u) => [u._id.toString(), u.displayName]))

  const active: unknown[] = []
  const deleted: unknown[] = []

  for (const sub of rows) {
    const user = userById.get(sub.userId.toString())
    const pub = submissionToPublic(sub)
    const row = {
      id: pub.id,
      bookTitle: pub.bookTitle,
      bookAuthor: pub.bookAuthor,
      pageCount: pub.pageCount,
      format: pub.format,
      submissionType: pub.submissionType,
      targetTeamId: pub.targetTeamId,
      pageBonus: pub.pageBonus,
      promptPoints: pub.promptPoints,
      bonusPoints: pub.bonusPoints,
      totalImpact: pub.totalImpact,
      createdAt: pub.createdAt,
      userId: sub.userId.toString(),
      userName: user?.displayName ?? 'Unknown reader',
      userEmail: '',
      userTeamId: user?.teamId ?? null,
      // Full prompt/date fields loaded via GET /submissions/:id when editing
      startedAt: null,
      finishedAt: null,
      promptIds: [] as string[],
      bonusCompetition: false,
      bonusTeamPromptIds: [] as string[],
      deletedAt: sub.deletedAt ?? null,
      deletedBy: sub.deletedBy?.toString() ?? null,
      deletedByName: sub.deletedBy ? deletedByNameById.get(sub.deletedBy.toString()) ?? null : null,
    }
    if (sub.deletedAt) deleted.push(row)
    else active.push(row)
  }

  return c.json({
    submissions: active,
    deletedSubmissions: includeDeleted ? deleted : [],
  })
})

adminRoutes.get('/submissions/covers/list', async (c) => {
  const proposals = await listCoverProposals()
  const missingCount = proposals.filter((p) => !p.currentCoverUrl).length
  return c.json({ proposals, total: proposals.length, missingCount })
})

adminRoutes.get('/submissions/covers/stream', async (c) => {
  const { streamSSE } = await import('hono/streaming')
  return streamSSE(c, async (stream) => {
    const abort = new AbortController()
    stream.onAbort(() => abort.abort())

    const all = await listCoverProposals()
    const total = all.length

    await stream.writeSSE({
      event: 'start',
      data: JSON.stringify({ total }),
    })

    let done = 0
    await streamCoverLookups(async (update) => {
      done++
      await stream.writeSSE({
        event: 'cover',
        data: JSON.stringify({
          id: update.id,
          proposedCoverUrl: update.proposedCoverUrl,
          done,
          total,
        }),
      })
    }, abort.signal)

    if (!abort.signal.aborted) {
      await stream.writeSSE({
        event: 'done',
        data: JSON.stringify({ done, total }),
      })
    }
  })
})

adminRoutes.post('/submissions/covers/apply', async (c) => {
  const admin = requireAdmin(await getSessionUser(c))
  const body = await c.req.json<{ updates?: { id: string; coverUrl: string }[] }>()
  const result = await applyCoverUpdates(body.updates ?? [])
  if (!result.ok) return c.json({ error: result.error }, 400)

  await logAudit({
    actor: admin,
    action: 'submission.covers_bulk_updated',
    entityType: 'Submission',
    entityId: null,
    detail: {
      updated: result.updated,
      skipped: result.skipped,
      requested: (body.updates ?? []).length,
    },
  })

  return c.json({ ok: true, updated: result.updated, skipped: result.skipped })
})

adminRoutes.get('/submissions/:id', async (c) => {
  const submission = await Submission.findById(c.req.param('id'))
  if (!submission) return c.json({ error: 'Submission not found' }, 404)
  const owner = await User.findById(submission.userId)
  return c.json({
    submission: {
      ...submissionToPublic(submission),
      userName: owner?.displayName ?? 'Unknown reader',
      userEmail: owner?.email ?? '',
      userTeamId: owner?.teamId ?? null,
    },
  })
})

function optionalDate(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed || null
}

adminRoutes.post('/submissions', async (c) => {
  const body = await c.req.json<SubmissionInput & { userId?: string }>()
  const userId = body.userId?.trim()
  if (!userId) return c.json({ error: 'Select a reader to submit for.' }, 400)

  const owner = await User.findById(userId)
  if (!owner) return c.json({ error: 'User not found' }, 404)

  const error = await validateSubmission(owner, body)
  if (error) return c.json({ error }, 400)

  const score = calculateScore(owner, body)

  const submission = await Submission.create({
    userId: owner._id,
    bookTitle: body.bookTitle.trim(),
    bookAuthor: body.bookAuthor.trim(),
    pageCount: body.pageCount,
    format: body.format,
    coverUrl: body.coverUrl?.trim() || null,
    startedAt: optionalDate(body.startedAt),
    finishedAt: optionalDate(body.finishedAt),
    submissionType: body.submissionType,
    targetTeamId: body.submissionType === 'sabotage' ? (body.targetTeamId ?? null) : null,
    promptIds: body.promptIds,
    bonusCompetition: body.bonusCompetition,
    bonusTeamPromptIds: body.bonusTeamPromptIds,
    pageBonus: score.pageBonus,
    promptPoints: score.promptPoints,
    bonusPoints: score.bonusPoints,
    totalImpact: score.totalImpact,
  })

  submissionsCreatedTotal
    .labels(body.submissionType, body.format || 'unknown')
    .inc()

  return c.json({
    submission: {
      ...submissionToPublic(submission),
      userName: owner.displayName,
      userEmail: owner.email,
      userTeamId: owner.teamId ?? null,
    },
    breakdown: score,
  })
})

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
  submission.coverUrl = body.coverUrl?.trim() || null
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
  const admin = requireAdmin(await getSessionUser(c))
  const submission = await Submission.findById(c.req.param('id'))
  if (!submission) return c.json({ error: 'Submission not found' }, 404)
  if (submission.deletedAt) return c.json({ error: 'Submission is already deleted' }, 400)

  submission.deletedAt = new Date()
  submission.deletedBy = admin._id
  await submission.save()

  await logAudit({
    actor: admin,
    action: 'submission.soft_deleted',
    entityType: 'Submission',
    entityId: submission._id.toString(),
    detail: { bookTitle: submission.bookTitle, bookAuthor: submission.bookAuthor },
  })

  return c.json({ ok: true })
})

adminRoutes.post('/submissions/:id/restore', async (c) => {
  const admin = requireAdmin(await getSessionUser(c))
  const submission = await Submission.findById(c.req.param('id'))
  if (!submission) return c.json({ error: 'Submission not found' }, 404)
  if (!submission.deletedAt) return c.json({ error: 'Submission is not deleted' }, 400)

  submission.deletedAt = null
  submission.deletedBy = null
  await submission.save()

  await logAudit({
    actor: admin,
    action: 'submission.restored',
    entityType: 'Submission',
    entityId: submission._id.toString(),
    detail: { bookTitle: submission.bookTitle, bookAuthor: submission.bookAuthor },
  })

  return c.json({ submission: submissionToPublic(submission) })
})

function svgAttachment(c: Context, filename: string, svg: string) {
  c.header('Content-Type', 'image/svg+xml; charset=utf-8')
  c.header('Content-Disposition', `attachment; filename="${filename}"`)
  return c.body(svg)
}

function svgInline(c: Context, svg: string) {
  c.header('Content-Type', 'image/svg+xml; charset=utf-8')
  c.header('Content-Disposition', 'inline')
  c.header('Cache-Control', 'no-store')
  return c.body(svg)
}

adminRoutes.get('/standings/current', async (c) => {
  const standings = await calculateStandings()
  const breakdown = await calculateStandingsBreakdown()
  const active = await PublishedStandings.findOne({ isActive: true }).sort({ createdAt: -1 })
  const activeWeeks = await PublishedStandings.find({ isActive: true }).sort({ createdAt: -1 })
  const history = await StandingsEvent.find().sort({ createdAt: -1 }).limit(100)

  return c.json({
    current: {
      standings,
      breakdown,
      // Vector for crisp admin preview (PNG stayed for Discord only)
      imageUrl: '/admin/standings/preview.svg?kind=standings',
      breakdownImageUrl: '/admin/standings/preview.svg?kind=breakdown',
    },
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

adminRoutes.get('/standings/preview.svg', async (c) => {
  const kind = c.req.query('kind') ?? 'standings'
  const { resolvePublishRange } = await import('../utils/week.js')
  const range = resolvePublishRange({
    preset: c.req.query('preset'),
    from: c.req.query('from'),
    to: c.req.query('to'),
    timeZone: getSiteSettingsAdminSync().scheduledPublishTimezone || 'Europe/Amsterdam',
  })
  const { weekKey, weekLabel } = range

  let svg: string
  if (kind === 'breakdown') {
    const breakdown = await calculateStandingsBreakdown()
    svg = generateBreakdownSvg(breakdown, weekLabel)
  } else if (kind === 'vibes') {
    const { buildPublicStandingsVibes } = await import('../services/adminAnalytics.js')
    const { generateVibesSvg } = await import('../services/vibes-image.js')
    const vibes = await buildPublicStandingsVibes({
      weekKey,
      weekLabel,
      from: range.from,
      toExclusive: range.toExclusive,
    })
    svg = generateVibesSvg(vibes)
  } else {
    const standings = await calculateStandings()
    svg = generateStandingsSvg(standings, weekLabel)
  }

  return svgInline(c, svg)
})

adminRoutes.get('/standings/publish-preview', async (c) => {
  const digest = await buildStandingsDigestDraft({
    preset: c.req.query('preset'),
    from: c.req.query('from'),
    to: c.req.query('to'),
  })
  const discordRoleId = getDiscordRoleId()
  const qs = new URLSearchParams()
  if (digest.range.preset) qs.set('preset', digest.range.preset)
  qs.set('from', digest.range.from)
  qs.set('to', digest.range.to)
  const rangeQs = qs.toString()

  return c.json({
    weekKey: digest.weekKey,
    weekLabel: digest.weekLabel,
    range: digest.range,
    // Dry-run only: these render the current unpublished snapshot live, nothing is written to the DB.
    standingsSvgUrl: `/admin/standings/preview.svg?kind=standings&${rangeQs}`,
    breakdownSvgUrl: `/admin/standings/preview.svg?kind=breakdown&${rangeQs}`,
    vibesSvgUrl: `/admin/standings/preview.svg?kind=vibes&${rangeQs}`,
    digest,
    whoGetsNotified: {
      emails: digest.notify.emailCount,
      discord: digest.notify.discordConfigured,
      ...(discordRoleId ? { discordRoleId } : {}),
    },
  })
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
  let body: { preset?: string; from?: string; to?: string } = {}
  try {
    body = await c.req.json()
  } catch {
    body = {}
  }
  const result = await publishStandings(admin, {
    preset: body.preset,
    from: body.from,
    to: body.to,
  })
  return c.json(result)
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

  await logAudit({
    actor: admin,
    action: 'standings.unpublished',
    entityType: 'PublishedStandings',
    entityId: publication._id.toString(),
    detail: { weekKey: publication.weekKey, weekLabel: publication.weekLabel },
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

adminRoutes.get('/audit-log', async (c) => {
  const limit = Number(c.req.query('limit') ?? '50')
  const offset = Number(c.req.query('offset') ?? '0')
  const result = await listAuditLog({
    limit: Number.isFinite(limit) ? limit : 50,
    offset: Number.isFinite(offset) ? offset : 0,
  })
  return c.json(result)
})

function csvEscape(value: unknown): string {
  const str = value == null ? '' : String(value)
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function csvAttachment(c: Context, filename: string, rows: (string | number)[][]): Response {
  const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\r\n')
  c.header('Content-Type', 'text/csv; charset=utf-8')
  c.header('Content-Disposition', `attachment; filename="${filename}"`)
  return c.body(csv)
}

adminRoutes.get('/export/submissions.csv', async (c) => {
  const includeDeleted = c.req.query('includeDeleted') === '1'
  const rows = await Submission.find(includeDeleted ? {} : withActive()).sort({ createdAt: -1 })
  const userIds = [...new Set(rows.map((sub) => sub.userId.toString()))]
  const users = await User.find({ _id: { $in: userIds } }).select('displayName teamId')
  const userById = new Map(users.map((u) => [u._id.toString(), u]))

  const header = [
    'id',
    'bookTitle',
    'bookAuthor',
    'pageCount',
    'format',
    'submissionType',
    'targetTeamId',
    'userName',
    'userTeamId',
    'totalImpact',
    'startedAt',
    'finishedAt',
    'createdAt',
    'deletedAt',
  ]

  const body = rows.map((sub) => {
    const user = userById.get(sub.userId.toString())
    return [
      sub._id.toString(),
      sub.bookTitle,
      sub.bookAuthor,
      sub.pageCount,
      sub.format,
      sub.submissionType,
      sub.targetTeamId ?? '',
      user?.displayName ?? 'Unknown reader',
      user?.teamId ?? '',
      sub.totalImpact,
      sub.startedAt ?? '',
      sub.finishedAt ?? '',
      sub.createdAt?.toISOString() ?? '',
      sub.deletedAt ? sub.deletedAt.toISOString() : '',
    ]
  })

  return csvAttachment(c, 'submissions.csv', [header, ...body])
})

adminRoutes.get('/export/standings-history.csv', async (c) => {
  const events = await StandingsEvent.find().sort({ createdAt: -1 })

  const header = [
    'id',
    'action',
    'weekKey',
    'weekLabel',
    'adminName',
    'adminEmail',
    'publicationId',
    'createdAt',
  ]

  const body = events.map((e) => [
    e._id.toString(),
    e.action,
    e.weekKey,
    e.weekLabel,
    e.adminName,
    e.adminEmail,
    e.publicationId?.toString() ?? '',
    e.createdAt?.toISOString() ?? '',
  ])

  return csvAttachment(c, 'standings-history.csv', [header, ...body])
})
