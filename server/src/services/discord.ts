import FormData from 'form-data'
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

function assertDiscordPng(png: Buffer, label: string): void {
  if (!isPngBuffer(png)) {
    throw new Error(`[discord] ${label} is not a valid PNG`)
  }
  if (png.length < 5000) {
    throw new Error(`[discord] ${label} PNG is too small (${png.length} bytes)`)
  }
}

async function postWebhookImage(
  webhookUrl: string,
  png: Buffer,
  filename: string,
  content: string,
): Promise<boolean> {
  assertDiscordPng(png, filename)

  const message = content.trim()
  if (!message) {
    throw new Error(`[discord] Refusing to post ${filename} with empty message content`)
  }

  const form = new FormData()
  form.append('payload_json', JSON.stringify({ content: message }))
  form.append('files[0]', png, {
    filename,
    contentType: 'image/png',
    knownLength: png.length,
  })

  const res = await fetch(webhookUrlWithWait(webhookUrl), {
    method: 'POST',
    // @ts-expect-error form-data stream body is accepted by Node fetch
    body: form,
    headers: form.getHeaders(),
  })

  const bodyText = await res.text()
  if (!res.ok) {
    console.error('[discord] Webhook failed:', res.status, bodyText)
    return false
  }

  try {
    const data = JSON.parse(bodyText) as {
      attachments?: Array<{ filename?: string; size?: number; width?: number; height?: number }>
    }
    const attachment = data.attachments?.[0]
    console.log('[discord] uploaded', filename, {
      bytes: png.length,
      discordSize: attachment?.size,
      width: attachment?.width,
      height: attachment?.height,
    })
    if (attachment?.size !== undefined && attachment.size < 5000) {
      console.error('[discord] Discord stored a suspiciously small attachment for', filename)
    }
  } catch {
    console.log('[discord] uploaded', filename, 'bytes:', png.length)
  }

  return true
}

export async function notifyDiscordStandingsPublished(
  weekKey: string,
  standingsSvg: string,
  breakdownSvg?: string,
): Promise<{ sent: boolean }> {
  const webhookUrl = getDiscordWebhookUrl()
  if (!webhookUrl) return { sent: false }

  const weekLabel = weekNumberLabel(weekKey)
  const roleId = getDiscordRoleId()
  const mention = roleId ? `<@&${roleId}> ` : ''
  const standingsFilename = `standings-${weekKey.toLowerCase()}.png`
  const breakdownFilename = `standings-breakdown-${weekKey.toLowerCase()}.png`

  try {
    const standingsPng = svgToPng(standingsSvg)
    const standingsSent = await postWebhookImage(
      webhookUrl,
      standingsPng,
      standingsFilename,
      `${mention}**${weekLabel} standings are live!**`,
    )
    if (!standingsSent) return { sent: false }

    if (breakdownSvg?.trim()) {
      const breakdownPng = svgToPng(breakdownSvg)
      const breakdownSent = await postWebhookImage(
        webhookUrl,
        breakdownPng,
        breakdownFilename,
        `**${weekLabel} score breakdown**`,
      )
      if (!breakdownSent) {
        console.error('[discord] Breakdown image webhook failed after standings was sent')
        return { sent: false }
      }
    }

    return { sent: true }
  } catch (e) {
    console.error('[discord] Webhook error:', e)
    return { sent: false }
  }
}
