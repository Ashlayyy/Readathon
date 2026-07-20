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
import { getWeekInfo } from '../utils/week.js'
import {
  discordWebhookTotal,
  emailsSentTotal,
  standingsPublishTotal,
} from './metrics.js'
import { captureServerEvent } from './posthog.js'
import { log } from './betterstack.js'

export type PublishStandingsResult = {
  id: string
  weekKey: string
  weekLabel: string
  publishedAt: Date | undefined
  standings: TeamStanding[]
  emailsSent: number
  emailsSkipped: number
  discordSent: boolean
}

/**
 * Publishes the current standings snapshot: freezes standings/breakdown/vibes,
 * fires email + Discord notifications, and writes the audit trail.
 * Shared between the admin "Publish" button and the Monday scheduled publisher -
 * keep this the single source of truth for what "publish" means.
 */
export async function publishStandings(actor: AuditActor): Promise<PublishStandingsResult> {
  const { weekKey, weekLabel } = getWeekInfo()

  const standings = await calculateStandings()
  const breakdown = await calculateStandingsBreakdown()
  const svg = generateStandingsSvg(standings, weekLabel)
  const breakdownSvg = generateBreakdownSvg(breakdown, weekLabel)
  const breakdownJson = JSON.stringify(breakdown)

  const vibes = await buildPublicStandingsVibes({
    weekKey,
    weekLabel,
    to: new Date(),
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

  const emailResult = await notifyStandingsPublished(weekLabel).catch((e) => {
    console.error('[notifications] Standings emails failed:', e)
    return { sent: 0, skipped: 0 }
  })

  const discordResult = await notifyDiscordStandingsPublished(
    weekKey,
    svg,
    breakdownSvg,
    vibesSvg,
  ).catch((e) => {
    console.error('[discord] Standings webhook failed:', e)
    return { sent: false }
  })

  await logAudit({
    actor,
    action: 'standings.published',
    entityType: 'PublishedStandings',
    entityId: doc._id.toString(),
    detail: { weekKey, weekLabel },
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
    },
  )
  log.info('Standings published', {
    weekKey,
    weekLabel,
    source,
    emailsSent: emailResult.sent,
    discordSent: discordResult.sent,
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
  }
}
