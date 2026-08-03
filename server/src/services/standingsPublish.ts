import { PublishedStandings } from '../db/models/PublishedStandings.js'
import { StandingsEvent } from '../db/models/StandingsEvent.js'
import { calculateStandings, type TeamStanding } from './scoring.js'
import { calculateStandingsBreakdown } from './standings-breakdown.js'
import { generateStandingsSvg } from './standings-image.js'
import { generateBreakdownSvg } from './standings-breakdown-image.js'
import { generateVibesSvg } from './vibes-image.js'
import { buildPublicStandingsVibes } from './adminAnalytics.js'
import { notifyStandingsPublished } from './notifications.js'
import { notifyDiscordStandingsPublished } from './discord.js'
import { logAudit, type AuditActor } from './audit.js'
import { getWeekInfo, resolvePublishRange } from '../utils/week.js'
import {
  getSiteSettingsAdminSync,
  updateSiteSettings,
} from './siteSettings.js'
import { buildMonthlyWrapSvg } from './monthlyWrap.js'
import {
  isFirstMondayOfMonth,
  monthlyWrapMonthKey,
} from './monthlyEvents.js'
import {
  discordWebhookTotal,
  emailsSentTotal,
  standingsPublishTotal,
} from './metrics.js'
import { captureServerEvent } from './posthog.js'
import { log } from './betterstack.js'

export type PublishStandingsOptions = {
  preset?: string | null
  from?: string | null
  to?: string | null
  /**
   * Explicit wrap choice for admin publish.
   * `undefined` = auto (scheduler / legacy): attach only on first Monday when enabled.
   * `true` / `false` = force include / exclude.
   */
  includeMonthlyWrap?: boolean | null
  /** Required when forcing wrap outside first Monday or after already sending this month. */
  confirmAtypicalWrap?: boolean | null
}

export type MonthlyWrapPublishInfo = {
  enabled: boolean
  isFirstMonday: boolean
  alreadySentThisMonth: boolean
  monthKey: string
  lastMonthlyWrapMonthKey: string
  timezone: string
  atypical: boolean
  reasons: string[]
}

export function getMonthlyWrapPublishInfo(now = new Date()): MonthlyWrapPublishInfo {
  const settings = getSiteSettingsAdminSync()
  const timezone = settings.scheduledPublishTimezone || 'Europe/Amsterdam'
  const monthKey = monthlyWrapMonthKey(now, timezone)
  const lastMonthlyWrapMonthKey = settings.lastMonthlyWrapMonthKey || ''
  const isFirstMonday = isFirstMondayOfMonth(now, timezone)
  const alreadySentThisMonth = lastMonthlyWrapMonthKey === monthKey
  const reasons: string[] = []
  if (!isFirstMonday) {
    reasons.push('Today is not the first Monday of the month (in the publish timezone).')
  }
  if (alreadySentThisMonth) {
    reasons.push(`A 4-week wrap was already sent for ${monthKey}.`)
  }
  return {
    enabled: Boolean(settings.monthlyWrapOnPublish),
    isFirstMonday,
    alreadySentThisMonth,
    monthKey,
    lastMonthlyWrapMonthKey,
    timezone,
    atypical: reasons.length > 0,
    reasons,
  }
}

export class PublishWrapConfirmationRequiredError extends Error {
  readonly code = 'WRAP_CONFIRM_REQUIRED' as const
  readonly wrap: MonthlyWrapPublishInfo

  constructor(wrap: MonthlyWrapPublishInfo) {
    super(
      'Confirm to attach the 4-week wrap outside the normal first-Monday publish (or after it was already sent this month).',
    )
    this.name = 'PublishWrapConfirmationRequiredError'
    this.wrap = wrap
  }
}

export type PublishStandingsResult = {
  id: string
  weekKey: string
  weekLabel: string
  publishedAt: Date | undefined
  standings: TeamStanding[]
  emailsSent: number
  emailsSkipped: number
  discordSent: boolean
  monthlyWrap: boolean
  range: {
    from: string
    to: string
    preset: string
    label: string
  }
}


/**
 * Publishes the current standings snapshot: standings/breakdown/vibes for the
 * chosen date range, fires email + Discord notifications, and writes the audit trail.
 * Shared between the admin "Publish" button and the Monday scheduled publisher -
 * keep this the single source of truth for what "publish" means.
 */
export async function publishStandings(
  actor: AuditActor,
  options: PublishStandingsOptions = {},
): Promise<PublishStandingsResult> {
  const settings = getSiteSettingsAdminSync()
  const tz = settings.scheduledPublishTimezone || 'Europe/Amsterdam'
  const now = new Date()
  const wrapInfo = getMonthlyWrapPublishInfo(now)

  const explicitWrap =
    typeof options.includeMonthlyWrap === 'boolean'
      ? options.includeMonthlyWrap
      : null

  let shouldAttachWrap = false
  if (explicitWrap === true) {
    if (!wrapInfo.enabled) {
      throw new Error(
        '4-week wrap on publish is disabled. Enable it under Admin → Settings → Discord.',
      )
    }
    if (wrapInfo.atypical && !options.confirmAtypicalWrap) {
      throw new PublishWrapConfirmationRequiredError(wrapInfo)
    }
    shouldAttachWrap = true
  } else if (explicitWrap === false) {
    shouldAttachWrap = false
  } else {
    // Auto (scheduler / unspecified): first Monday only when feature enabled
    shouldAttachWrap =
      wrapInfo.enabled &&
      wrapInfo.isFirstMonday &&
      !wrapInfo.alreadySentThisMonth
  }

  const range = resolvePublishRange({
    preset: options.preset,
    from: options.from,
    to: options.to,
    timeZone: tz,
  })
  const { weekKey, weekLabel } = range

  const standings = await calculateStandings()
  const breakdown = await calculateStandingsBreakdown()
  const svg = generateStandingsSvg(standings, weekLabel)
  const breakdownSvg = generateBreakdownSvg(breakdown, weekLabel)
  const breakdownJson = JSON.stringify(breakdown)

  const vibes = await buildPublicStandingsVibes({
    weekKey,
    weekLabel,
    from: range.from,
    toExclusive: range.toExclusive,
  })
  const vibesSvg = generateVibesSvg(vibes)
  const vibesJson = JSON.stringify(vibes)

  await PublishedStandings.updateMany({ isActive: true }, { isActive: false, unpublishedAt: new Date() })

  const doc = await PublishedStandings.create({
    weekKey,
    weekLabel,
    standingsJson: JSON.stringify(standings),
    svgData: svg,
    breakdownJson,
    breakdownSvgData: breakdownSvg,
    vibesJson,
    vibesSvgData: vibesSvg,
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
    adminName: actor?.displayName ?? 'Unknown',
    adminEmail: (actor as { email?: string } | null | undefined)?.email ?? '',
    publicationId: doc._id,
  })

  const emailResult = await notifyStandingsPublished({
    weekLabel,
    vibes,
    standings,
  }).catch((e) => {
    console.error('[notifications] Standings emails failed:', e)
    return { sent: 0, skipped: 0 }
  })

  let monthlyWrapSvg: string | undefined
  let monthlyWrapLabel: string | undefined
  if (shouldAttachWrap) {
    try {
      const wrap = await buildMonthlyWrapSvg({ now, timeZone: tz })
      monthlyWrapSvg = wrap.svg
      monthlyWrapLabel = wrap.label
    } catch (e) {
      console.error('[discord] Failed to build monthly wrap for publish:', e)
    }
  }

  const discordResult = await notifyDiscordStandingsPublished({
    weekKey,
    standingsSvg: svg,
    breakdownSvg,
    vibesSvg,
    weekLabel,
    channel: 'production',
    withPing: true,
    monthlyWrapSvg,
    monthlyWrapLabel,
  }).catch((e) => {
    console.error('[discord] Standings webhook failed:', e)
    return { sent: false }
  })

  if (shouldAttachWrap && monthlyWrapSvg && discordResult.sent) {
    try {
      await updateSiteSettings({
        lastMonthlyWrapMonthKey: monthlyWrapMonthKey(now, tz),
      })
    } catch (e) {
      console.error('[discord] Failed to persist lastMonthlyWrapMonthKey:', e)
    }
  }

  await logAudit({
    actor,
    action: 'standings.published',
    entityType: 'PublishedStandings',
    entityId: doc._id.toString(),
    detail: {
      weekKey,
      weekLabel,
      rangeFrom: range.fromInput,
      rangeTo: range.toInput,
      rangePreset: range.preset,
      monthlyWrap: Boolean(monthlyWrapSvg),
      monthlyWrapExplicit: explicitWrap,
      monthlyWrapAtypical: Boolean(explicitWrap && wrapInfo.atypical),
    },
  })

  const source =
    actor?.displayName === 'Scheduler' ? 'scheduler' : 'admin'
  standingsPublishTotal.labels('ok', source).inc()
  emailsSentTotal.labels('standings', 'sent').inc(emailResult.sent)
  if (emailResult.skipped > 0) {
    emailsSentTotal.labels('standings', 'skipped').inc(emailResult.skipped)
  }
  discordWebhookTotal
    .labels('standings_publish', discordResult.sent ? 'ok' : 'fail')
    .inc()

  captureServerEvent(
    (actor as { email?: string } | null | undefined)?.email ||
      actor?.displayName ||
      'system',
    'standings_published',
    {
      week_key: weekKey,
      week_label: weekLabel,
      source,
      emails_sent: emailResult.sent,
      discord_sent: discordResult.sent,
      monthly_wrap: Boolean(monthlyWrapSvg),
    },
  )
  log.info('Standings published', {
    weekKey,
    weekLabel,
    source,
    emailsSent: emailResult.sent,
    discordSent: discordResult.sent,
    monthlyWrap: Boolean(monthlyWrapSvg),
  })

  return {
    id: doc._id.toString(),
    weekKey,
    weekLabel,
    publishedAt: doc.createdAt,
    standings,
    emailsSent: emailResult.sent,
    emailsSkipped: emailResult.skipped,
    discordSent: discordResult.sent,
    monthlyWrap: Boolean(monthlyWrapSvg),
    range: {
      from: range.fromInput,
      to: range.toInput,
      preset: range.preset,
      label: range.label,
    },
  }
}

/** Scheduler keeps current-ISO-week semantics via default lastMon→thisMon when run Monday. */
export async function publishStandingsScheduled(actor: AuditActor): Promise<PublishStandingsResult> {
  // On scheduled Monday morning, default inclusive window is last Mon → this Mon.
  return publishStandings(actor, { preset: 'lastMonToThisMon' })
}

// Re-export for callers that still import getWeekInfo alongside publish
export { getWeekInfo }
