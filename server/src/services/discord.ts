import { getDiscordRoleId, getDiscordWebhookUrl } from './siteSettings.js'
import { svgToPng } from './svgToPng.js'

function weekNumberLabel(weekKey: string): string {
  const match = weekKey.match(/W(\d+)$/i)
  if (!match) return weekKey
  return `Week ${parseInt(match[1]!, 10)}`
}

async function postWebhookImage(
  webhookUrl: string,
  png: Buffer,
  filename: string,
  content?: string,
): Promise<boolean> {
  const form = new FormData()
  if (content) {
    form.append('payload_json', JSON.stringify({ content }))
  }

  form.append(
    'files[0]',
    new Blob([new Uint8Array(png)], { type: 'image/png' }),
    filename,
  )

  const res = await fetch(webhookUrl, {
    method: 'POST',
    body: form,
  })

  if (!res.ok) {
    const body = await res.text()
    console.error('[discord] Webhook failed:', res.status, body)
    return false
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
    console.log('[discord] standings PNG bytes:', standingsPng.length)
    const standingsSent = await postWebhookImage(
      webhookUrl,
      standingsPng,
      standingsFilename,
      `${mention}**${weekLabel} standings are live!**`,
    )
    if (!standingsSent) return { sent: false }

    if (breakdownSvg?.trim()) {
      const breakdownPng = svgToPng(breakdownSvg)
      console.log('[discord] breakdown PNG bytes:', breakdownPng.length)
      const breakdownSent = await postWebhookImage(
        webhookUrl,
        breakdownPng,
        breakdownFilename,
      )
      if (!breakdownSent) {
        console.error('[discord] Breakdown image webhook failed after standings was sent')
      }
    }

    return { sent: true }
  } catch (e) {
    console.error('[discord] Webhook error:', e)
    return { sent: false }
  }
}
