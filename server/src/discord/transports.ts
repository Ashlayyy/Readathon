const DISCORD_API = 'https://discord.com/api/v10'

export type DiscordDeliveryMode = 'webhook' | 'bot'

export type DiscordTextSendOpts = {
	content: string
	roleId?: string
}

export type DiscordImageSendOpts = {
	content: string
	png: Buffer
	filename: string
	roleId?: string
}

export type DiscordSendOk = { ok: true }
export type DiscordSendFail = { ok: false; error: string }
export type DiscordSendOutcome = DiscordSendOk | DiscordSendFail

export type DiscordTransport = {
	sendText: (opts: DiscordTextSendOpts) => Promise<DiscordSendOutcome>
	sendImage: (opts: DiscordImageSendOpts) => Promise<DiscordSendOutcome>
}

function buildAllowedMentions(roleId?: string): {
	parse?: string[]
	roles?: string[]
} {
	if (roleId) return { roles: [roleId] }
	return { parse: [] }
}

export function webhookUrlWithWait(webhookUrl: string): string {
	return webhookUrl.includes('?')
		? `${webhookUrl}&wait=true`
		: `${webhookUrl}?wait=true`
}

export function createWebhookTransport(webhookUrl: string): DiscordTransport {
	return {
		async sendText(opts) {
			const payload = {
				content: opts.content,
				allowed_mentions: buildAllowedMentions(opts.roleId),
			}
			try {
				const res = await fetch(webhookUrlWithWait(webhookUrl), {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(payload),
				})
				if (!res.ok) {
					const body = await res.text()
					return {
						ok: false,
						error: `Discord webhook returned ${res.status}: ${body.slice(0, 200)}`,
					}
				}
				return { ok: true }
			} catch (e) {
				return {
					ok: false,
					error: e instanceof Error ? e.message : 'Webhook send failed',
				}
			}
		},

		async sendImage(opts) {
			const payload = {
				content: opts.content,
				embeds: [{ image: { url: `attachment://${opts.filename}` } }],
				attachments: [{ id: 0, filename: opts.filename }],
				allowed_mentions: buildAllowedMentions(opts.roleId),
			}
			const form = new FormData()
			form.append('payload_json', JSON.stringify(payload))
			form.append(
				'files[0]',
				new Blob([Uint8Array.from(opts.png)], { type: 'image/png' }),
				opts.filename,
			)
			try {
				const res = await fetch(webhookUrlWithWait(webhookUrl), {
					method: 'POST',
					body: form,
				})
				if (!res.ok) {
					const body = await res.text()
					return {
						ok: false,
						error: `Discord webhook returned ${res.status}: ${body.slice(0, 200)}`,
					}
				}
				return { ok: true }
			} catch (e) {
				return {
					ok: false,
					error: e instanceof Error ? e.message : 'Webhook image send failed',
				}
			}
		},
	}
}

export function createBotTransport(
	botToken: string,
	channelId: string,
): DiscordTransport {
	const auth = { Authorization: `Bot ${botToken}` }

	return {
		async sendText(opts) {
			const payload = {
				content: opts.content,
				allowed_mentions: buildAllowedMentions(opts.roleId),
			}
			try {
				const res = await fetch(
					`${DISCORD_API}/channels/${channelId}/messages`,
					{
						method: 'POST',
						headers: {
							...auth,
							'Content-Type': 'application/json',
						},
						body: JSON.stringify(payload),
					},
				)
				if (!res.ok) {
					const body = await res.text()
					return {
						ok: false,
						error: `Discord bot returned ${res.status}: ${body.slice(0, 200)}`,
					}
				}
				return { ok: true }
			} catch (e) {
				return {
					ok: false,
					error: e instanceof Error ? e.message : 'Bot send failed',
				}
			}
		},

		async sendImage(opts) {
			const payload = {
				content: opts.content,
				embeds: [{ image: { url: `attachment://${opts.filename}` } }],
				attachments: [{ id: 0, filename: opts.filename }],
				allowed_mentions: buildAllowedMentions(opts.roleId),
			}
			const form = new FormData()
			form.append('payload_json', JSON.stringify(payload))
			form.append(
				'files[0]',
				new Blob([Uint8Array.from(opts.png)], { type: 'image/png' }),
				opts.filename,
			)
			try {
				const res = await fetch(
					`${DISCORD_API}/channels/${channelId}/messages`,
					{
						method: 'POST',
						headers: auth,
						body: form,
					},
				)
				if (!res.ok) {
					const body = await res.text()
					return {
						ok: false,
						error: `Discord bot returned ${res.status}: ${body.slice(0, 200)}`,
					}
				}
				return { ok: true }
			} catch (e) {
				return {
					ok: false,
					error: e instanceof Error ? e.message : 'Bot image send failed',
				}
			}
		},
	}
}
