import { getDiscordBotToken } from '../services/siteSettings.js'

const DISCORD_API = 'https://discord.com/api/v10'

export type BotMessage = {
	content?: string
	components?: unknown[]
	flags?: number
	allowed_mentions?: { parse?: string[]; users?: string[]; roles?: string[] }
	embeds?: unknown[]
}

export async function botRequest(
	path: string,
	method: string,
	body?: unknown,
): Promise<{ ok: true; data: { id?: string } } | { ok: false; status: number; error: string }> {
	const token = getDiscordBotToken()
	if (!token) {
		return { ok: false, status: 0, error: 'No Discord bot token is configured.' }
	}
	try {
		const res = await fetch(`${DISCORD_API}${path}`, {
			method,
			headers: {
				Authorization: `Bot ${token}`,
				'Content-Type': 'application/json',
			},
			body: body === undefined ? undefined : JSON.stringify(body),
		})
		if (!res.ok) {
			const text = await res.text()
			return { ok: false, status: res.status, error: text.slice(0, 200) }
		}
		if (res.status === 204) return { ok: true, data: {} }
		const data = (await res.json()) as { id?: string }
		return { ok: true, data }
	} catch (error) {
		return {
			ok: false,
			status: 0,
			error: error instanceof Error ? error.message : 'Discord request failed',
		}
	}
}

export async function sendChannelMessage(
	channelId: string,
	message: BotMessage,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
	const result = await botRequest(`/channels/${channelId}/messages`, 'POST', message)
	if (!result.ok) return { ok: false, error: result.error }
	if (!result.data.id) return { ok: false, error: 'Discord did not return a message id.' }
	return { ok: true, id: result.data.id }
}

export async function sendChannelFile(
	channelId: string,
	message: BotMessage & { filename: string; png: Buffer },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
	const sent = await postFile(`/channels/${channelId}/messages`, 'POST', message)
	if (!sent.ok) return { ok: false, error: sent.error }
	if (!sent.id) return { ok: false, error: 'Discord did not return a message id.' }
	return { ok: true, id: sent.id }
}

export async function editChannelFile(
	channelId: string,
	messageId: string,
	message: BotMessage & { filename: string; png: Buffer },
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
	const edited = await postFile(
		`/channels/${channelId}/messages/${messageId}`,
		'PATCH',
		message,
	)
	if (!edited.ok) return { ok: false, status: edited.status, error: edited.error }
	return { ok: true }
}

async function postFile(
	path: string,
	method: string,
	message: BotMessage & { filename: string; png: Buffer },
): Promise<{ ok: true; id?: string } | { ok: false; status: number; error: string }> {
	const token = getDiscordBotToken()
	if (!token) return { ok: false, status: 0, error: 'No Discord bot token is configured.' }
	const { filename, png, ...payload } = message
	const form = new FormData()
	form.append(
		'payload_json',
		JSON.stringify({
			...payload,
			attachments: [{ id: 0, filename }],
		}),
	)
	form.append('files[0]', new File([new Uint8Array(png)], filename, { type: 'image/png' }))
	try {
		const res = await fetch(`${DISCORD_API}${path}`, {
			method,
			headers: { Authorization: `Bot ${token}` },
			body: form,
		})
		if (!res.ok) {
			const text = await res.text()
			return { ok: false, status: res.status, error: text.slice(0, 200) }
		}
		if (res.status === 204) return { ok: true }
		const data = (await res.json()) as { id?: string }
		return { ok: true, id: data.id }
	} catch (error) {
		return {
			ok: false,
			status: 0,
			error: error instanceof Error ? error.message : 'Discord request failed',
		}
	}
}

export async function editChannelMessage(
	channelId: string,
	messageId: string,
	message: BotMessage,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
	const result = await botRequest(
		`/channels/${channelId}/messages/${messageId}`,
		'PATCH',
		message,
	)
	if (!result.ok) return result
	return { ok: true }
}
