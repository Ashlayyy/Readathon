import {
	createBotTransport,
	createWebhookTransport,
	type DiscordSendOutcome,
	type DiscordTransport,
} from './transports.js'
import {
	getDiscordBotToken,
	getDiscordChannelConfig,
	getDiscordDeliveryMode,
	getDiscordPrimaryGuildId,
	resolveDiscordGuildConfig,
	type DiscordWebhookChannel,
} from '../services/siteSettings.js'

export function resolveStandingsTransport(
	channel: DiscordWebhookChannel,
	guildId?: string | null,
):
	| { ok: true; transport: DiscordTransport; roleId: string; guildId: string }
	| { ok: false; error: string } {
	const resolvedGuild =
		(guildId ?? '').trim() || getDiscordPrimaryGuildId()
	const mode = getDiscordDeliveryMode(channel, resolvedGuild || null)
	const cfg = getDiscordChannelConfig(channel, resolvedGuild || null)
	if (mode === 'bot') {
		const token = getDiscordBotToken()
		if (!token) {
			return {
				ok: false,
				error:
					'Bot delivery mode is on but no Discord bot token is configured (Admin → Settings).',
			}
		}
		if (!cfg.channelId) {
			return {
				ok: false,
				error: `No ${channel} Discord channel ID configured for this server (save settings first).`,
			}
		}
		if (!resolvedGuild) {
			return {
				ok: false,
				error: 'No Discord server selected. Pick a guild in Settings.',
			}
		}
		return {
			ok: true,
			transport: createBotTransport(token, cfg.channelId),
			roleId: cfg.roleId,
			guildId: resolvedGuild,
		}
	}
	if (!cfg.webhookUrl) {
		return {
			ok: false,
			error: `No ${channel} Discord webhook URL configured for this server (save settings first).`,
		}
	}
	return {
		ok: true,
		transport: createWebhookTransport(cfg.webhookUrl),
		roleId: cfg.roleId,
		guildId: resolvedGuild,
	}
}

export async function deliverySendText(opts: {
	channel: DiscordWebhookChannel
	content: string
	roleId?: string
	guildId?: string | null
}): Promise<DiscordSendOutcome> {
	const resolved = resolveStandingsTransport(opts.channel, opts.guildId)
	if (!resolved.ok) return { ok: false, error: resolved.error }
	return resolved.transport.sendText({
		content: opts.content,
		roleId: opts.roleId,
	})
}

export async function deliverySendImage(opts: {
	channel: DiscordWebhookChannel
	content: string
	png: Buffer
	filename: string
	roleId?: string
	guildId?: string | null
}): Promise<DiscordSendOutcome> {
	const resolved = resolveStandingsTransport(opts.channel, opts.guildId)
	if (!resolved.ok) return { ok: false, error: resolved.error }
	return resolved.transport.sendImage({
		content: opts.content,
		png: opts.png,
		filename: opts.filename,
		roleId: opts.roleId,
	})
}

/** Fire-and-forget realm chat — follows primary guild production delivery mode. */
export function deliverySendTeamChat(
	teamId: string,
	message: string,
	imageUrl?: string,
): Promise<DiscordSendOutcome> {
	const primaryId = getDiscordPrimaryGuildId()
	const cfg = resolveDiscordGuildConfig(primaryId)
	if (!cfg) {
		return Promise.resolve({
			ok: false,
			error: 'No primary Discord server configured for realm chat',
		})
	}
	const mode = cfg.productionDeliveryMode
	const cover = imageUrl?.trim() || undefined
	if (mode === 'bot') {
		const channelId = cfg.teamChatChannelIds[teamId]?.trim()
		if (!channelId) {
			return Promise.resolve({
				ok: false,
				error: `No realm chat channel ID for team ${teamId}`,
			})
		}
		const token = getDiscordBotToken()
		if (!token) {
			return Promise.resolve({
				ok: false,
				error: 'No Discord bot token configured',
			})
		}
		return createBotTransport(token, channelId).sendText({
			content: message,
			imageUrl: cover,
		})
	}
	const webhookUrl = cfg.teamChatWebhookUrls[teamId]?.trim()
	if (!webhookUrl) {
		return Promise.resolve({
			ok: false,
			error: `No realm chat webhook for team ${teamId}`,
		})
	}
	return createWebhookTransport(webhookUrl).sendText({
		content: message,
		imageUrl: cover,
	})
}

export function isDiscordChannelConfigured(
	channel: DiscordWebhookChannel,
	guildId?: string | null,
): boolean {
	return resolveStandingsTransport(channel, guildId).ok
}
