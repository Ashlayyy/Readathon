import { File } from 'node:buffer'
import { getDiscordRoleId, getDiscordWebhookUrl, getSiteSettingsAdminSync } from './siteSettings.js'
import { svgToPng, isPngBuffer } from './svgToPng.js'
import { discordWebhookTotal } from './metrics.js'

function weekNumberLabel(weekKey: string): string {
  const match = weekKey.match(/W(\d+)$/i)
  if (!match) return weekKey
  return `Week ${parseInt(match[1]!, 10)}`
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
 * Plain text webhook smoke test. Never mentions a role — even if one is configured.
 * Uses allowed_mentions.parse = [] so Discord will not expand any pings.
 */
export const DISCORD_TEST_WEBHOOK_CONTENT = 'This is a test message!'

export async function sendDiscordWebhookTest(): Promise<{ sent: boolean; error?: string }> {
  const webhookUrl = getDiscordWebhookUrl()
  if (!webhookUrl) {
    return { sent: false, error: 'No Discord webhook URL configured' }
  }

  try {
    const res = await fetch(webhookUrlWithWait(webhookUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: DISCORD_TEST_WEBHOOK_CONTENT,
        allowed_mentions: { parse: [] },
      }),
    })
    const bodyText = await res.text()
    if (!res.ok) {
      console.error('[discord] test webhook failed', {
        status: res.status,
        body: bodyText.slice(0, 300),
      })
      discordWebhookTotal.labels('test', 'fail').inc()
      return {
        sent: false,
        error: `Discord returned ${res.status}`,
      }
    }
    console.log('[discord] test webhook sent OK (no role ping)')
    discordWebhookTotal.labels('test', 'ok').inc()
    return { sent: true }
  } catch (e) {
    console.error('[discord] test webhook error:', e)
    discordWebhookTotal.labels('test', 'fail').inc()
    return {
      sent: false,
      error: e instanceof Error ? e.message : 'Failed to send test message',
    }
  }
}

/** Posts a real role mention so you can verify the configured role ID in-guild. */
export async function sendDiscordRolePingTest(): Promise<{
  sent: boolean
  error?: string
  roleId?: string
}> {
  const webhookUrl = getDiscordWebhookUrl()
  if (!webhookUrl) {
    return { sent: false, error: 'No Discord webhook URL configured' }
  }
  const roleId = getDiscordRoleId()
  if (!roleId) {
    return { sent: false, error: 'No Discord role ID configured' }
  }

  try {
    const res = await fetch(webhookUrlWithWait(webhookUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `<@&${roleId}> Role ping test — if you see @unknown-role, this ID is not a role in this server.`,
        allowed_mentions: { roles: [roleId] },
      }),
    })
    const bodyText = await res.text()
    if (!res.ok) {
      console.error('[discord] role ping test failed', {
        status: res.status,
        body: bodyText.slice(0, 300),
        roleId,
      })
      discordWebhookTotal.labels('role_ping_test', 'fail').inc()
      return {
        sent: false,
        error: `Discord returned ${res.status}`,
        roleId,
      }
    }
    console.log('[discord] role ping test sent OK', { roleId })
    discordWebhookTotal.labels('role_ping_test', 'ok').inc()
    return { sent: true, roleId }
  } catch (e) {
    console.error('[discord] role ping test error:', e)
    discordWebhookTotal.labels('role_ping_test', 'fail').inc()
    return {
      sent: false,
      error: e instanceof Error ? e.message : 'Failed to send role ping test',
      roleId,
    }
  }
}

export async function notifyDiscordStandingsPublished(
  weekKey: string,
  standingsSvg: string,
  breakdownSvg?: string,
  vibesSvg?: string,
): Promise<{ sent: boolean }> {
  const webhookUrl = getDiscordWebhookUrl()
  if (!webhookUrl) {
    console.log('[discord] publish skipped: no webhook URL configured')
    return { sent: false }
  }

  const weekLabel = weekNumberLabel(weekKey)
  const roleId = getDiscordRoleId()
  const mention = roleId ? `<@&${roleId}> ` : ''
  const standingsFilename = `standings-${weekKey.toLowerCase()}.png`
  const breakdownFilename = `standings-breakdown-${weekKey.toLowerCase()}.png`
  const vibesFilename = `standings-vibes-${weekKey.toLowerCase()}.png`
  const hasBreakdown = Boolean(breakdownSvg?.trim())
  const hasVibes = Boolean(vibesSvg?.trim())

  console.log('[discord] publish started', {
    weekKey,
    weekLabel,
    hasBreakdown,
    hasVibes,
    standingsSvgChars: standingsSvg.length,
    breakdownSvgChars: breakdownSvg?.length ?? 0,
    vibesSvgChars: vibesSvg?.length ?? 0,
    roleConfigured: Boolean(roleId),
  })

  try {
    console.log('[discord] standings: rasterizing SVG to PNG…')
    const standingsPng = svgToPng(standingsSvg)
    const standingsContent = `${mention}**${weekLabel} standings are live!**`
    const standingsSent = await postWebhookImage(
      'standings',
      webhookUrl,
      standingsPng,
      standingsFilename,
      standingsContent,
      roleId || undefined,
    )
    if (!standingsSent) return { sent: false }

    if (hasBreakdown && breakdownSvg) {
      console.log('[discord] breakdown: rasterizing SVG to PNG…')
      const breakdownPng = svgToPng(breakdownSvg)
      const breakdownContent = `**${weekLabel} score breakdown**`
      const breakdownSent = await postWebhookImage(
        'breakdown',
        webhookUrl,
        breakdownPng,
        breakdownFilename,
        breakdownContent,
      )
      if (!breakdownSent) {
        console.error('[discord] breakdown failed after standings was sent successfully')
        return { sent: false }
      }
    } else {
      console.log('[discord] breakdown: skipped (no breakdown SVG)')
    }

    if (hasVibes && vibesSvg) {
      console.log('[discord] vibes: rasterizing SVG to PNG…')
      const vibesPng = svgToPng(vibesSvg)
      const vibesContent = `**${weekLabel} reading vibes**`
      const vibesSent = await postWebhookImage(
        'vibes',
        webhookUrl,
        vibesPng,
        vibesFilename,
        vibesContent,
      )
      if (!vibesSent) {
        console.error('[discord] vibes failed after earlier posts succeeded')
        return { sent: false }
      }
    } else {
      console.log('[discord] vibes: skipped (no vibes SVG)')
    }

    console.log('[discord] publish finished successfully')
    return { sent: true }
  } catch (e) {
    console.error('[discord] publish error before/during webhook post:', e)
    return { sent: false }
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
