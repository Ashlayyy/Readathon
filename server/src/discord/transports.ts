import {
	isDiscordInvalidImageUrlError,
} from './coverImageUrl.js'

const DISCORD_API = 'https://discord.com/api/v10'

export type DiscordDeliveryMode = 'webhook' | 'bot'

export type DiscordTextSendOpts = {
	content: string
	roleId?: string
	/** Public image URL for an embed (e.g. book cover). Skipped when empty. */
	imageUrl?: string
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

async function postJsonMessage(
	url: string,
	headers: Record<string, string>,
	opts: DiscordTextSendOpts,
	errorPrefix: string,
): Promise<DiscordSendOutcome> {
	const buildPayload = (includeImage: boolean): Record<string, unknown> => {
		const payload: Record<string, unknown> = {
			content: opts.content,
			allowed_mentions: buildAllowedMentions(opts.roleId),
		}
		const imageUrl = includeImage ? opts.imageUrl?.trim() : undefined
		if (imageUrl) {
			payload.embeds = [{ image: { url: imageUrl } }]
		}
		return payload
	}

	const attempt = async (includeImage: boolean): Promise<DiscordSendOutcome> => {
		try {
			const res = await fetch(url, {
				method: 'POST',
				headers: {
					...headers,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(buildPayload(includeImage)),
			})
			if (!res.ok) {
				const body = await res.text()
				return {
					ok: false,
					error: `${errorPrefix} ${res.status}: ${body.slice(0, 200)}`,
				}
			}
			return { ok: true }
		} catch (e) {
			return {
				ok: false,
				error: e instanceof Error ? e.message : `${errorPrefix} send failed`,
			}
		}
	}

	const imageUrl = opts.imageUrl?.trim()
	const first = await attempt(Boolean(imageUrl))
	if (first.ok) return first

	// Cover URL rejected → still deliver the realm-chat text without the embed.
	if (imageUrl && isDiscordInvalidImageUrlError(first.error)) {
		console.warn(
			`[discord] embed image rejected (${imageUrl.slice(0, 120)}); retrying text-only`,
		)
		return attempt(false)
	}
	return first
}

export function createWebhookTransport(webhookUrl: string): DiscordTransport {
	return {
		async sendText(opts) {
			return postJsonMessage(
				webhookUrlWithWait(webhookUrl),
				{},
				opts,
				'Discord webhook returned',
			)
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
			return postJsonMessage(
				`${DISCORD_API}/channels/${channelId}/messages`,
				auth,
				opts,
				'Discord bot returned',
			)
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
