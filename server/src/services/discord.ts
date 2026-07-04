function weekNumberLabel(weekKey: string): string {
  const match = weekKey.match(/W(\d+)$/i)
  if (!match) return weekKey
  return `Week ${parseInt(match[1]!, 10)}`
}

export async function notifyDiscordStandingsPublished(
  weekKey: string,
  svg: string,
): Promise<{ sent: boolean }> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL?.trim()
  if (!webhookUrl) return { sent: false }

  const content = weekNumberLabel(weekKey)

  try {
    const form = new FormData()
    form.append('payload_json', JSON.stringify({ content }))
    form.append('files[0]', new Blob([svg], { type: 'image/svg+xml' }), 'standings.svg')

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
