import { User } from '../db/models/User.js'
import { calculateStandings } from './scoring.js'
import { buildPublicStandingsVibes, type PublicStandingsVibes } from './adminAnalytics.js'
import { getDiscordWebhookUrl } from './siteSettings.js'
import { resolvePublishRange } from '../utils/week.js'
import { getSiteSettingsAdminSync } from './siteSettings.js'

export type LeaderGap = {
  leaderTeamName: string
  secondTeamName: string
  gapXp: number
} | null

export type StandingsPreviewRow = {
  teamId: string
  teamName: string
  totalTeamXp: number
  netXp: number
  memberCount: number
}

export type StandingsDigestNotify = {
  emailCount: number
  discordConfigured: boolean
}

export type StandingsDigestDraft = {
  weekKey: string
  weekLabel: string
  vibes: PublicStandingsVibes
  leaderGap: LeaderGap
  standingsPreview: StandingsPreviewRow[]
  notify: StandingsDigestNotify
  draftText: string
  range: {
    from: string
    to: string
    preset: string
    label: string
  }
}

async function countEmailNotifyRecipients(): Promise<number> {
  return User.countDocuments({
    notifyStandings: true,
    email: { $exists: true, $nin: [null, ''] },
  })
}

export function buildDraftText(opts: {
  weekLabel: string
  vibes: PublicStandingsVibes
  leaderGap: LeaderGap
  notify: StandingsDigestNotify
}): string {
  const { weekLabel, vibes, leaderGap, notify } = opts
  const o = vibes.overview
  const lines: string[] = []

  lines.push(`**${weekLabel} Vibes**`, '')

  if (leaderGap) {
    lines.push(
      `🏆 **${leaderGap.leaderTeamName}** leads by **${leaderGap.gapXp} XP** over ${leaderGap.secondTeamName}.`,
    )
  }

  lines.push(
    `📚 ${o.submissions} book${o.submissions === 1 ? '' : 's'} logged this week (${o.totalPages.toLocaleString()} pages, avg ${o.avgPages}).`,
  )
  lines.push(
    `⚔️ ${o.chaosRatio}% sabotage rate — ${o.sabotageCount} attack${o.sabotageCount === 1 ? '' : 's'} vs ${o.addCount} add${o.addCount === 1 ? '' : 's'}.`,
  )
  if (o.competitionRate > 0) {
    lines.push(`🎯 ${o.competitionRate}% of books claimed the competition bonus.`)
  }

  lines.push('')
  const notifyParts = [`${notify.emailCount} email${notify.emailCount === 1 ? '' : 's'}`]
  if (notify.discordConfigured) notifyParts.push('Discord')
  lines.push(`📣 Publishing will notify: ${notifyParts.join(' + ')}.`)

  return lines.join('\n')
}

/** Live (unpublished) preview of what a publish for the chosen range would look like. */
export async function buildStandingsDigestDraft(opts: {
  preset?: string | null
  from?: string | null
  to?: string | null
} = {}): Promise<StandingsDigestDraft> {
  const range = resolvePublishRange({
    ...opts,
    timeZone: getSiteSettingsAdminSync().scheduledPublishTimezone || 'Europe/Amsterdam',
  })

  const [standings, vibes, emailCount] = await Promise.all([
    calculateStandings(),
    buildPublicStandingsVibes({
      weekKey: range.weekKey,
      weekLabel: range.weekLabel,
      from: range.from,
      toExclusive: range.toExclusive,
    }),
    countEmailNotifyRecipients(),
  ])

  const leaderGap: LeaderGap =
    standings.length >= 2
      ? {
          leaderTeamName: standings[0]!.teamName,
          secondTeamName: standings[1]!.teamName,
          gapXp: standings[0]!.totalTeamXp - standings[1]!.totalTeamXp,
        }
      : null

  const standingsPreview: StandingsPreviewRow[] = standings.map((s) => ({
    teamId: s.teamId,
    teamName: s.teamName,
    totalTeamXp: s.totalTeamXp,
    netXp: s.netXp,
    memberCount: s.memberCount,
  }))

  const notify: StandingsDigestNotify = {
    emailCount,
    discordConfigured: Boolean(getDiscordWebhookUrl()),
  }

  const draftText = buildDraftText({
    weekLabel: range.weekLabel,
    vibes,
    leaderGap,
    notify,
  })

  return {
    weekKey: range.weekKey,
    weekLabel: range.weekLabel,
    vibes,
    leaderGap,
    standingsPreview,
    notify,
    draftText,
    range: {
      from: range.fromInput,
      to: range.toInput,
      preset: range.preset,
      label: range.label,
    },
  }
}
