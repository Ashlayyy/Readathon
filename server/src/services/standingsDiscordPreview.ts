import { calculateStandings } from './scoring.js'
import { calculateStandingsBreakdown } from './standings-breakdown.js'
import { generateStandingsSvg } from './standings-image.js'
import { generateBreakdownSvg } from './standings-breakdown-image.js'
import { generateVibesSvg } from './vibes-image.js'
import { buildPublicStandingsVibes } from './adminAnalytics.js'
import { buildMonthlyWrapSvg } from './monthlyWrap.js'
import { notifyDiscordStandingsPublished } from './discord.js'
import { resolvePublishRange } from '../utils/week.js'
import {
  getSiteSettingsAdminSync,
  type DiscordWebhookChannel,
} from './siteSettings.js'

/** Build current standings/breakdown/vibes SVGs (does not publish to DB). */
export async function buildLiveStandingsImages(opts?: {
  preset?: string | null
  from?: string | null
  to?: string | null
}): Promise<{
  weekKey: string
  weekLabel: string
  standingsSvg: string
  breakdownSvg: string
  vibesSvg: string
}> {
  const range = resolvePublishRange({
    preset: opts?.preset ?? 'lastMonToThisMon',
    from: opts?.from,
    to: opts?.to,
    timeZone: getSiteSettingsAdminSync().scheduledPublishTimezone || 'Europe/Amsterdam',
  })
  const standings = await calculateStandings()
  const breakdown = await calculateStandingsBreakdown()
  const standingsSvg = generateStandingsSvg(standings, range.weekLabel)
  const breakdownSvg = generateBreakdownSvg(breakdown, range.weekLabel)
  const vibes = await buildPublicStandingsVibes({
    weekKey: range.weekKey,
    weekLabel: range.weekLabel,
    from: range.from,
    toExclusive: range.toExclusive,
  })
  const vibesSvg = generateVibesSvg(vibes)
  return {
    weekKey: range.weekKey,
    weekLabel: range.weekLabel,
    standingsSvg,
    breakdownSvg,
    vibesSvg,
  }
}

/** Send live standings (and optional 4-week wrap) to test or production webhook. */
export async function sendLiveStandingsToDiscord(opts: {
  channel: DiscordWebhookChannel
  includeMonthlyWrap?: boolean
  withPing?: boolean
}): Promise<{ sent: boolean; error?: string }> {
  const images = await buildLiveStandingsImages()
  let monthlyWrapSvg: string | undefined
  let monthlyWrapLabel: string | undefined
  if (opts.includeMonthlyWrap) {
    const wrap = await buildMonthlyWrapSvg()
    monthlyWrapSvg = wrap.svg
    monthlyWrapLabel = wrap.label
  }
  return notifyDiscordStandingsPublished({
    weekKey: images.weekKey,
    weekLabel: images.weekLabel,
    standingsSvg: images.standingsSvg,
    breakdownSvg: images.breakdownSvg,
    vibesSvg: images.vibesSvg,
    channel: opts.channel,
    withPing: opts.withPing ?? false,
    monthlyWrapSvg,
    monthlyWrapLabel,
  })
}
