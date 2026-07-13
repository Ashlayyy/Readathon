import { getDiscordWebhookUrl } from './siteSettings.js'
import { svgToPng } from './svgToPng.js'

function weekNumberLabel(weekKey: string): string {
  const match = weekKey.match(/W(\d+)$/i)
  if (!match) return weekKey
  return `Week ${parseInt(match[1]!, 10)}`
}

export async function notifyDiscordStandingsPublished(
  weekKey: string,
  standingsSvg: string,
  breakdownSvg?: string,
): Promise<{ sent: boolean }> {
  const webhookUrl = getDiscordWebhookUrl()
  if (!webhookUrl) return { sent: false }

  const content = `Standings for **${weekNumberLabel(weekKey)}**!`
  const standingsFilename = `standings-${weekKey.toLowerCase()}.png`
  const breakdownFilename = `standings-breakdown-${weekKey.toLowerCase()}.png`

  try {
    const form = new FormData()
    form.append('payload_json', JSON.stringify({ content }))

    const standingsPng = svgToPng(standingsSvg)
    form.append(
      'files[0]',
      new Blob([new Uint8Array(standingsPng)], { type: 'image/png' }),
      standingsFilename,
    )

    if (breakdownSvg?.trim()) {
      const breakdownPng = svgToPng(breakdownSvg)
      form.append(
        'files[1]',
        new Blob([new Uint8Array(breakdownPng)], { type: 'image/png' }),
        breakdownFilename,
      )
    }

    const res = await fetch(webhookUrl, {
      method: 'POST',
      body: form,
    })

    if (!res.ok) {
      const body = await res.text()
      console.error('[discord] Webhook failed:', res.status, body)
      return { sent: false }
    }
    return { sent: true }
  } catch (e) {
    console.error('[discord] Webhook error:', e)
    return { sent: false }
  }
}
