import { File } from 'node:buffer'
import { getDiscordRoleId, getDiscordWebhookUrl } from './siteSettings.js'
import { svgToPng, isPngBuffer } from './svgToPng.js'

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
}

function buildPayload(content: string, filename: string): WebhookPayload {
  return {
    content,
    embeds: [{ image: { url: `attachment://${filename}` } }],
    attachments: [{ id: 0, filename }],
  }
}

async function postWebhookImage(
  label: string,
  webhookUrl: string,
  png: Buffer,
  filename: string,
  content: string,
): Promise<boolean> {
  assertDiscordPng(png, filename)

  const message = content.trim()
  if (!message) {
    throw new Error(`[discord] ${label}: refusing to post ${filename} with empty message content`)
  }

  const payload = buildPayload(message, filename)
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
  form.append('files[0]', new File([png], filename, { type: 'image/png' }))

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
      const vibesContent = `**${weekLabel} reading vibes** (this week only — frozen at publish)`
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
