import { File } from 'node:buffer'
import {
  getDiscordChannelConfig,
  getDiscordRoleId,
  getDiscordWebhookUrl,
  getSiteSettingsAdminSync,
  type DiscordWebhookChannel,
} from './siteSettings.js'
import { svgToPng, isPngBuffer } from './svgToPng.js'
import { discordWebhookTotal } from './metrics.js'
import { getSvgEventName } from './svgTheme.js'
import {
  getLiveMonthlyDiscordTemplates,
  renderDiscordCaption,
} from './monthlyThemeExtras.js'

/** Fallback when a publish label wasn't provided (legacy ISO key → "Week 30"). */
function weekNumberLabel(weekKey: string): string {
  const match = weekKey.match(/W(\d+)$/i)
  if (!match) return weekKey
  return `Week ${parseInt(match[1]!, 10)}`
}

function discordWeekHeading(weekKey: string, weekLabel?: string | null): string {
  const trimmed = weekLabel?.trim()
  return trimmed || weekNumberLabel(weekKey)
}

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

/** Turn `2026-07-06` into `Jul 6`. */
function formatWrapDay(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return iso
  const month = SHORT_MONTHS[Number(m[2]) - 1]
  const day = Number(m[3])
  if (!month || !Number.isFinite(day)) return iso
  return `${month} ${day}`
}

/**
 * Pretty range for Discord copy.
 * Accepts labels like `2026-07-06 → 2026-08-02 (4 weeks)`.
 */
export function formatDiscordWrapRange(label: string): string {
  const trimmed = label.trim()
  const m = trimmed.match(
    /^(\d{4}-\d{2}-\d{2})\s*(?:→|->|-)\s*(\d{4}-\d{2}-\d{2})/,
  )
  if (!m) return trimmed.replace(/\s*→\s*/g, ' - ')
  const from = formatWrapDay(m[1]!)
  const to = formatWrapDay(m[2]!)
  const fromYear = m[1]!.slice(0, 4)
  const toYear = m[2]!.slice(0, 4)
  if (fromYear === toYear) return `${from} - ${to}, ${toYear}`
  return `${from}, ${fromYear} - ${to}, ${toYear}`
}

/** Caption for the 4-week wrap image (standalone or after standings). */
export function discordMonthlyWrapContent(opts: {
  channel: DiscordWebhookChannel
  label: string
  /** Role mention prefix including trailing space, e.g. `<@&123> `. */
  mention?: string
}): string {
  const mention = opts.mention ?? ''
  const eventName = getSvgEventName()
  const range = formatDiscordWrapRange(opts.label || 'Last 4 weeks')
  const isTest = opts.channel === 'test'
  if (isTest) {
    return [
      `${mention}**[TEST] ${eventName} - 4-week wrap**`,
      `Looking back at **${range}**`,
      `_Top readers, warmongers, realms & more_`,
    ].join('\n')
  }
  return [
    `${mention}**${eventName} - the 4-week wrap is here!**`,
    `Looking back at **${range}**`,
    `_Top readers, warmongers, realms & more_`,
  ].join('\n')
}

function webhookUrlWithWait(webhookUrl: string): string {
  return webhookUrl.includes('?') ? `${webhookUrl}&wait=true` : `${webhookUrl}?wait=true`
}

function webhookHost(webhookUrl: string): string {
  try {
    return new URL(webhookUrl).hostname
  } catch {
    return '(invalid webhook url)'
  }
}

function assertDiscordPng(png: Buffer, label: string): void {
  if (!isPngBuffer(png)) {
    throw new Error(`[discord] ${label} is not a valid PNG`)
  }
  if (png.length < 5000) {
    throw new Error(`[discord] ${label} PNG is too small (${png.length} bytes)`)
  }
}

type WebhookPayload = {
  content: string
  embeds: Array<{ image: { url: string } }>
  attachments: Array<{ id: number; filename: string }>
  allowed_mentions?: { parse?: string[]; roles?: string[] }
}

function buildPayload(
  content: string,
  filename: string,
  roleId?: string,
): WebhookPayload {
  const payload: WebhookPayload = {
    content,
    embeds: [{ image: { url: `attachment://${filename}` } }],
    attachments: [{ id: 0, filename }],
  }
  if (roleId) {
    payload.allowed_mentions = { roles: [roleId] }
  } else {
    payload.allowed_mentions = { parse: [] }
  }
  return payload
}

async function postWebhookImage(
  label: string,
  webhookUrl: string,
  png: Buffer,
  filename: string,
  content: string,
  roleId?: string,
): Promise<boolean> {
  assertDiscordPng(png, filename)

  const message = content.trim()
  if (!message) {
    throw new Error(`[discord] ${label}: refusing to post ${filename} with empty message content`)
  }

  const payload = buildPayload(message, filename, roleId)
  const payloadJson = JSON.stringify(payload)

  console.log(`[discord] ${label}: preparing webhook post`, {
    host: webhookHost(webhookUrl),
    filename,
    contentLength: message.length,
    contentPreview: message.slice(0, 120),
    pngBytes: png.length,
    pngHeader: png.subarray(0, 8).toString('hex'),
    payloadJson,
  })

  const form = new FormData()
  form.append('payload_json', payloadJson)
  form.append(
    'files[0]',
    new Blob([Uint8Array.from(png)], { type: 'image/png' }),
    filename,
  )

  const res = await fetch(webhookUrlWithWait(webhookUrl), {
    method: 'POST',
    body: form,
  })

  const bodyText = await res.text()
  if (!res.ok) {
    console.error(`[discord] ${label}: webhook failed`, {
      status: res.status,
      statusText: res.statusText,
      body: bodyText,
      filename,
      contentLength: message.length,
      pngBytes: png.length,
      payloadJson,
    })
    return false
  }

  try {
    const data = JSON.parse(bodyText) as {
      id?: string
      content?: string
      attachments?: Array<{ filename?: string; size?: number; width?: number; height?: number }>
    }
    const attachment = data.attachments?.[0]
    console.log(`[discord] ${label}: uploaded OK`, {
      messageId: data.id,
      returnedContentLength: data.content?.length ?? 0,
      filename,
      bytes: png.length,
      discordSize: attachment?.size,
      width: attachment?.width,
      height: attachment?.height,
    })
    if (attachment?.size !== undefined && attachment.size < 5000) {
      console.error(`[discord] ${label}: Discord stored a suspiciously small attachment`, {
        filename,
        discordSize: attachment.size,
      })
    }
  } catch {
    console.log(`[discord] ${label}: uploaded OK (non-JSON response)`, {
      filename,
      bytes: png.length,
      bodyPreview: bodyText.slice(0, 200),
    })
  }

  return true
}

/**
 * Plain text webhook smoke test content (test channel).
 * Production “message” buttons use a standings-style sample announce.
 */
export const DISCORD_TEST_WEBHOOK_CONTENT = 'This is a test message!'

export const DISCORD_SAMPLE_ANNOUNCE_CONTENT =
  '**Sample standings announce** - production webhook check (no images).'

export type DiscordSendResult = {
  sent: boolean
  error?: string
  roleId?: string
  channel?: DiscordWebhookChannel
  withPing?: boolean
}

/**
 * Send a plain text message to the test or production standings webhook.
 * When `withPing` is true, prefixes `<@&roleId>` and sets allowed_mentions.roles.
 */
export async function sendDiscordChannelMessage(opts: {
  channel: DiscordWebhookChannel
  withPing: boolean
  /** test = short smoke string; announce = sample standings-style line */
  kind?: 'test' | 'announce'
}): Promise<DiscordSendResult> {
  const channel = opts.channel === 'test' ? 'test' : 'production'
  const withPing = Boolean(opts.withPing)
  const kind = opts.kind ?? (channel === 'test' ? 'test' : 'announce')
  const { webhookUrl, roleId } = getDiscordChannelConfig(channel)

  if (!webhookUrl) {
    return {
      sent: false,
      error: `No ${channel} Discord webhook URL configured (save settings first).`,
      channel,
      withPing,
    }
  }
  if (withPing && !roleId) {
    return {
      sent: false,
      error: `No ${channel} Discord role ID configured — copy Role ID (Developer Mode → right-click the role), not a user ID.`,
      channel,
      withPing,
    }
  }

  const bodyText =
    kind === 'announce' ? DISCORD_SAMPLE_ANNOUNCE_CONTENT : DISCORD_TEST_WEBHOOK_CONTENT
  const content = withPing && roleId ? `<@&${roleId}> ${bodyText}` : bodyText
  const payload: {
    content: string
    allowed_mentions: { parse?: string[]; roles?: string[] }
  } = withPing && roleId
    ? { content, allowed_mentions: { roles: [roleId] } }
    : { content, allowed_mentions: { parse: [] } }

  const metric = `${channel}_${withPing ? 'ping' : 'nopping'}`

  try {
    const res = await fetch(webhookUrlWithWait(webhookUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const responseText = await res.text()
    if (!res.ok) {
      console.error('[discord] channel send failed', {
        channel,
        withPing,
        status: res.status,
        body: responseText.slice(0, 300),
        roleId: roleId || null,
      })
      discordWebhookTotal.labels(metric, 'fail').inc()
      return {
        sent: false,
        error: `Discord returned ${res.status}`,
        roleId: roleId || undefined,
        channel,
        withPing,
      }
    }
    console.log('[discord] channel send OK', { channel, withPing, roleId: roleId || null })
    discordWebhookTotal.labels(metric, 'ok').inc()
    return { sent: true, roleId: roleId || undefined, channel, withPing }
  } catch (e) {
    console.error('[discord] channel send error:', e)
    discordWebhookTotal.labels(metric, 'fail').inc()
    return {
      sent: false,
      error: e instanceof Error ? e.message : 'Failed to send Discord message',
      roleId: roleId || undefined,
      channel,
      withPing,
    }
  }
}

/** @deprecated Prefer sendDiscordChannelMessage({ channel: 'production', withPing: false }) */
export async function sendDiscordWebhookTest(): Promise<{ sent: boolean; error?: string }> {
  return sendDiscordChannelMessage({ channel: 'production', withPing: false, kind: 'test' })
}

/** @deprecated Prefer sendDiscordChannelMessage({ channel: 'production', withPing: true }) */
export async function sendDiscordRolePingTest(): Promise<DiscordSendResult> {
  return sendDiscordChannelMessage({ channel: 'production', withPing: true, kind: 'test' })
}

export type DiscordStandingsBundleOpts = {
  weekKey: string
  standingsSvg: string
  breakdownSvg?: string
  vibesSvg?: string
  weekLabel?: string | null
  /** Defaults to production (real publishes). */
  channel?: DiscordWebhookChannel
  /** When false, skip role ping even if configured (test previews). Default true for production. */
  withPing?: boolean
  /** Optional 4-week wrap image after vibes. */
  monthlyWrapSvg?: string | null
  monthlyWrapLabel?: string | null
}

/**
 * Post standings (+ optional breakdown/vibes/monthly wrap) to test or production webhook.
 */
export async function notifyDiscordStandingsPublished(
  weekKeyOrOpts: string | DiscordStandingsBundleOpts,
  standingsSvg?: string,
  breakdownSvg?: string,
  vibesSvg?: string,
  weekLabel?: string | null,
): Promise<{ sent: boolean; error?: string }> {
  const opts: DiscordStandingsBundleOpts =
    typeof weekKeyOrOpts === 'string'
      ? {
          weekKey: weekKeyOrOpts,
          standingsSvg: standingsSvg ?? '',
          breakdownSvg,
          vibesSvg,
          weekLabel,
          channel: 'production',
          withPing: true,
        }
      : weekKeyOrOpts

  const channel = opts.channel === 'test' ? 'test' : 'production'
  const { webhookUrl, roleId } = getDiscordChannelConfig(channel)
  if (!webhookUrl) {
    console.log(`[discord] publish skipped: no ${channel} webhook URL configured`)
    return { sent: false, error: `No ${channel} Discord webhook URL configured.` }
  }

  const heading = discordWeekHeading(opts.weekKey, opts.weekLabel)
  const usePing = opts.withPing !== false && Boolean(roleId)
  const mention = usePing && roleId ? `<@&${roleId}> ` : ''
  const standingsFilename = `standings-${opts.weekKey.toLowerCase()}.png`
  const breakdownFilename = `standings-breakdown-${opts.weekKey.toLowerCase()}.png`
  const vibesFilename = `standings-vibes-${opts.weekKey.toLowerCase()}.png`
  const wrapFilename = `standings-wrap-${opts.weekKey.toLowerCase()}.png`
  const hasBreakdown = Boolean(opts.breakdownSvg?.trim())
  const hasVibes = Boolean(opts.vibesSvg?.trim())
  const hasWrap = Boolean(opts.monthlyWrapSvg?.trim())

  console.log('[discord] publish started', {
    channel,
    weekKey: opts.weekKey,
    weekLabel: heading,
    hasBreakdown,
    hasVibes,
    hasWrap,
    standingsSvgChars: opts.standingsSvg.length,
    breakdownSvgChars: opts.breakdownSvg?.length ?? 0,
    vibesSvgChars: opts.vibesSvg?.length ?? 0,
    wrapSvgChars: opts.monthlyWrapSvg?.length ?? 0,
    roleConfigured: Boolean(roleId),
    withPing: usePing,
  })

  try {
    const themeTpl = getLiveMonthlyDiscordTemplates()
    const eventName = getSvgEventName()
    const captionVarsBase = {
      mention,
      weekLabel: heading,
      eventName,
      wrapLabel: '',
      wrapRange: '',
    }

    console.log('[discord] standings: rasterizing SVG to PNG…')
    const standingsPng = svgToPng(opts.standingsSvg)
    const standingsFallback =
      channel === 'test'
        ? `${mention}**[TEST]** ${heading} standings preview`
        : `${mention}**${heading} standings are live!**`
    const standingsContent = renderDiscordCaption(
      themeTpl?.standings,
      captionVarsBase,
      standingsFallback,
    )
    const standingsSent = await postWebhookImage(
      'standings',
      webhookUrl,
      standingsPng,
      standingsFilename,
      standingsContent,
      usePing ? roleId || undefined : undefined,
    )
    if (!standingsSent) return { sent: false, error: 'Discord rejected standings image' }

    if (hasBreakdown && opts.breakdownSvg) {
      console.log('[discord] breakdown: rasterizing SVG to PNG…')
      const breakdownPng = svgToPng(opts.breakdownSvg)
      const breakdownFallback =
        channel === 'test'
          ? `**[TEST]** ${heading} score breakdown`
          : `**${heading} score breakdown**`
      const breakdownContent = renderDiscordCaption(
        themeTpl?.breakdown,
        { ...captionVarsBase, mention: '' },
        breakdownFallback,
      )
      const breakdownSent = await postWebhookImage(
        'breakdown',
        webhookUrl,
        breakdownPng,
        breakdownFilename,
        breakdownContent,
      )
      if (!breakdownSent) {
        console.error('[discord] breakdown failed after standings was sent successfully')
        return { sent: false, error: 'Discord rejected breakdown image' }
      }
    } else {
      console.log('[discord] breakdown: skipped (no breakdown SVG)')
    }

    if (hasVibes && opts.vibesSvg) {
      console.log('[discord] vibes: rasterizing SVG to PNG…')
      const vibesPng = svgToPng(opts.vibesSvg)
      const vibesFallback =
        channel === 'test'
          ? `**[TEST]** ${heading} reading vibes`
          : `**${heading} reading vibes**`
      const vibesContent = renderDiscordCaption(
        themeTpl?.vibes,
        { ...captionVarsBase, mention: '' },
        vibesFallback,
      )
      const vibesSent = await postWebhookImage(
        'vibes',
        webhookUrl,
        vibesPng,
        vibesFilename,
        vibesContent,
      )
      if (!vibesSent) {
        console.error('[discord] vibes failed after earlier posts succeeded')
        return { sent: false, error: 'Discord rejected vibes image' }
      }
    } else {
      console.log('[discord] vibes: skipped (no vibes SVG)')
    }

    if (hasWrap && opts.monthlyWrapSvg) {
      console.log('[discord] monthly wrap: rasterizing SVG to PNG…')
      const wrapPng = svgToPng(opts.monthlyWrapSvg)
      const wrapLabel = opts.monthlyWrapLabel?.trim() || 'Last 4 weeks'
      const wrapRange = formatDiscordWrapRange(wrapLabel)
      const wrapFallback = discordMonthlyWrapContent({
        channel,
        label: wrapLabel,
      })
      const wrapContent = renderDiscordCaption(
        themeTpl?.wrap,
        {
          ...captionVarsBase,
          mention: '',
          wrapLabel,
          wrapRange,
        },
        wrapFallback,
      )
      const wrapSent = await postWebhookImage(
        'monthly_wrap',
        webhookUrl,
        wrapPng,
        wrapFilename,
        wrapContent,
      )
      if (!wrapSent) {
        console.error('[discord] monthly wrap failed after earlier posts succeeded')
        return { sent: false, error: 'Discord rejected monthly wrap image' }
      }
    }

    console.log('[discord] publish finished successfully')
    return { sent: true }
  } catch (e) {
    console.error('[discord] publish error before/during webhook post:', e)
    return {
      sent: false,
      error: e instanceof Error ? e.message : 'Failed to send Discord standings',
    }
  }
}

/** Send only the 4-week wrap image to a webhook channel. */
export async function sendDiscordMonthlyWrap(opts: {
  channel: DiscordWebhookChannel
  wrapSvg: string
  label?: string
  withPing?: boolean
}): Promise<DiscordSendResult> {
  const channel = opts.channel === 'test' ? 'test' : 'production'
  const { webhookUrl, roleId } = getDiscordChannelConfig(channel)
  if (!webhookUrl) {
    return {
      sent: false,
      error: `No ${channel} Discord webhook URL configured.`,
      channel,
    }
  }
  const usePing = Boolean(opts.withPing && roleId)
  const mention = usePing && roleId ? `<@&${roleId}> ` : ''
  const label = opts.label?.trim() || 'Last 4 weeks'
  try {
    const png = svgToPng(opts.wrapSvg)
    const themeTpl = getLiveMonthlyDiscordTemplates()
    const wrapRange = formatDiscordWrapRange(label)
    const fallback = discordMonthlyWrapContent({ channel, label, mention })
    const content = renderDiscordCaption(
      themeTpl?.wrap,
      {
        mention,
        weekLabel: '',
        eventName: getSvgEventName(),
        wrapLabel: label,
        wrapRange,
      },
      fallback,
    )
    const ok = await postWebhookImage(
      'monthly_wrap',
      webhookUrl,
      png,
      `standings-wrap-${Date.now()}.png`,
      content,
      usePing ? roleId : undefined,
    )
    return {
      sent: ok,
      error: ok ? undefined : 'Discord rejected monthly wrap image',
      channel,
      roleId: roleId || undefined,
    }
  } catch (e) {
    return {
      sent: false,
      error: e instanceof Error ? e.message : 'Failed to send monthly wrap',
      channel,
    }
  }
}

/**
 * Optional per-realm chat webhook, separate from the weekly standings publish.
 * Fires a short, public-safe note (no dates/notes/prompt detail) to a team's own
 * Discord channel when a member logs a book. Fire-and-forget: failures are logged
 * and ignored so a bad webhook URL never breaks submission.
 */
export function notifyTeamChatSubmission(teamId: string | null | undefined, message: string): void {
  if (!teamId) return
  const settings = getSiteSettingsAdminSync()
  if (!settings.teamChatHooksEnabled) return

  const webhookUrl = settings.teamChatWebhookUrls[teamId]?.trim()
  if (!webhookUrl) return

  fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: message }),
  })
    .then((res) => {
      discordWebhookTotal
        .labels('team_chat', res.ok ? 'ok' : 'fail')
        .inc()
      if (!res.ok) {
        console.error(
          `[discord] team chat webhook failed for team ${teamId}: ${res.status}`,
        )
      }
    })
    .catch((e) => {
      discordWebhookTotal.labels('team_chat', 'fail').inc()
      console.error(`[discord] team chat webhook failed for team ${teamId} (ignored):`, e)
    })
}
