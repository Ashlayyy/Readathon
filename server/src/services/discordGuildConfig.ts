/**
 * Multi-guild Discord settings helpers.
 * Flat SiteSettings discord fields are projections of the primary guild.
 */
import type { DiscordDeliveryMode } from './siteSettingsTypes.js'

export type { DiscordDeliveryMode }

export type DiscordGuildConfig = {
	guildId: string
	name: string
	testDeliveryMode: DiscordDeliveryMode
	productionDeliveryMode: DiscordDeliveryMode
	testWebhookUrl: string
	testRoleId: string
	productionWebhookUrl: string
	productionRoleId: string
	testChannelId: string
	productionChannelId: string
	botCommandRoleIds: string[]
	teamChatWebhookUrls: Record<string, string>
	teamChatChannelIds: Record<string, string>
}

export function emptyGuildConfig(
	guildId: string,
	name = '',
): DiscordGuildConfig {
	return {
		guildId,
		name,
		testDeliveryMode: 'webhook',
		productionDeliveryMode: 'webhook',
		testWebhookUrl: '',
		testRoleId: '',
		productionWebhookUrl: '',
		productionRoleId: '',
		testChannelId: '',
		productionChannelId: '',
		botCommandRoleIds: [],
		teamChatWebhookUrls: {},
		teamChatChannelIds: {},
	}
}

export function normalizeSnowflakeMap(raw: unknown): Record<string, string> {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
	const out: Record<string, string> = {}
	for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
		if (typeof value === 'string' && value.trim()) {
			out[key] = value.trim()
		}
	}
	return out
}

export function normalizeRoleIdList(raw: unknown): string[] {
	if (!Array.isArray(raw)) return []
	const seen = new Set<string>()
	const out: string[] = []
	for (const item of raw) {
		if (typeof item !== 'string') continue
		const id = item.trim()
		if (!/^\d{5,30}$/.test(id) || seen.has(id)) continue
		seen.add(id)
		out.push(id)
	}
	return out
}

function asMode(raw: unknown, fallback: DiscordDeliveryMode): DiscordDeliveryMode {
	return raw === 'bot' || raw === 'webhook' ? raw : fallback
}

export function normalizeGuildConfig(
	guildId: string,
	raw: unknown,
): DiscordGuildConfig | null {
	const id = guildId.trim()
	if (!/^\d{5,30}$/.test(id)) return null
	const src =
		raw && typeof raw === 'object' && !Array.isArray(raw)
			? (raw as Record<string, unknown>)
			: {}
	const base = emptyGuildConfig(id, String(src.name ?? '').trim())
	return {
		...base,
		name: String(src.name ?? '').trim() || base.name,
		testDeliveryMode: asMode(src.testDeliveryMode, 'webhook'),
		productionDeliveryMode: asMode(src.productionDeliveryMode, 'webhook'),
		testWebhookUrl: String(src.testWebhookUrl ?? '').trim(),
		testRoleId: String(src.testRoleId ?? '').trim(),
		productionWebhookUrl: String(src.productionWebhookUrl ?? '').trim(),
		productionRoleId: String(src.productionRoleId ?? '').trim(),
		testChannelId: String(src.testChannelId ?? '').trim(),
		productionChannelId: String(src.productionChannelId ?? '').trim(),
		botCommandRoleIds: normalizeRoleIdList(src.botCommandRoleIds),
		teamChatWebhookUrls: normalizeSnowflakeMap(src.teamChatWebhookUrls),
		teamChatChannelIds: normalizeSnowflakeMap(src.teamChatChannelIds),
	}
}

export function normalizeGuildConfigsMap(
	raw: unknown,
): Record<string, DiscordGuildConfig> {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
	const out: Record<string, DiscordGuildConfig> = {}
	for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
		const cfg = normalizeGuildConfig(key, {
			...(typeof value === 'object' && value && !Array.isArray(value)
				? (value as object)
				: {}),
			guildId: key,
		})
		if (cfg) out[cfg.guildId] = cfg
	}
	return out
}

export function cloneGuildConfigs(
	map: Record<string, DiscordGuildConfig>,
): Record<string, DiscordGuildConfig> {
	const out: Record<string, DiscordGuildConfig> = {}
	for (const [id, cfg] of Object.entries(map)) {
		out[id] = {
			...cfg,
			botCommandRoleIds: [...cfg.botCommandRoleIds],
			teamChatWebhookUrls: { ...cfg.teamChatWebhookUrls },
			teamChatChannelIds: { ...cfg.teamChatChannelIds },
		}
	}
	return out
}

/** Project flat legacy fields from a guild config. */
export function flatFieldsFromGuild(cfg: DiscordGuildConfig | null): {
	discordGuildId: string
	discordTestDeliveryMode: DiscordDeliveryMode
	discordProductionDeliveryMode: DiscordDeliveryMode
	discordDeliveryMode: DiscordDeliveryMode
	discordTestWebhookUrl: string
	discordTestRoleId: string
	discordProductionWebhookUrl: string
	discordProductionRoleId: string
	discordWebhookUrl: string
	discordRoleId: string
	discordTestChannelId: string
	discordProductionChannelId: string
	discordBotCommandRoleIds: string[]
	teamChatWebhookUrls: Record<string, string>
	teamChatChannelIds: Record<string, string>
} {
	if (!cfg) {
		return {
			discordGuildId: '',
			discordTestDeliveryMode: 'webhook',
			discordProductionDeliveryMode: 'webhook',
			discordDeliveryMode: 'webhook',
			discordTestWebhookUrl: '',
			discordTestRoleId: '',
			discordProductionWebhookUrl: '',
			discordProductionRoleId: '',
			discordWebhookUrl: '',
			discordRoleId: '',
			discordTestChannelId: '',
			discordProductionChannelId: '',
			discordBotCommandRoleIds: [],
			teamChatWebhookUrls: {},
			teamChatChannelIds: {},
		}
	}
	return {
		discordGuildId: cfg.guildId,
		discordTestDeliveryMode: cfg.testDeliveryMode,
		discordProductionDeliveryMode: cfg.productionDeliveryMode,
		discordDeliveryMode: cfg.productionDeliveryMode,
		discordTestWebhookUrl: cfg.testWebhookUrl,
		discordTestRoleId: cfg.testRoleId,
		discordProductionWebhookUrl: cfg.productionWebhookUrl,
		discordProductionRoleId: cfg.productionRoleId,
		discordWebhookUrl: cfg.productionWebhookUrl,
		discordRoleId: cfg.productionRoleId,
		discordTestChannelId: cfg.testChannelId,
		discordProductionChannelId: cfg.productionChannelId,
		discordBotCommandRoleIds: [...cfg.botCommandRoleIds],
		teamChatWebhookUrls: { ...cfg.teamChatWebhookUrls },
		teamChatChannelIds: { ...cfg.teamChatChannelIds },
	}
}

export function guildConfigFromLegacyFlat(doc: {
	discordGuildId?: string | null
	discordTestDeliveryMode?: string | null
	discordProductionDeliveryMode?: string | null
	discordDeliveryMode?: string | null
	discordTestWebhookUrl?: string | null
	discordTestRoleId?: string | null
	discordProductionWebhookUrl?: string | null
	discordProductionRoleId?: string | null
	discordWebhookUrl?: string | null
	discordRoleId?: string | null
	discordTestChannelId?: string | null
	discordProductionChannelId?: string | null
	discordBotCommandRoleIds?: unknown
	teamChatWebhookUrls?: unknown
	teamChatChannelIds?: unknown
}): DiscordGuildConfig | null {
	const guildId = (doc.discordGuildId ?? '').trim()
	if (!guildId) return null
	const legacyMode: DiscordDeliveryMode =
		doc.discordDeliveryMode === 'bot' ? 'bot' : 'webhook'
	const prodWebhook =
		(doc.discordProductionWebhookUrl ?? '').trim() ||
		(doc.discordWebhookUrl ?? '').trim()
	const prodRole =
		(doc.discordProductionRoleId ?? '').trim() || (doc.discordRoleId ?? '').trim()
	return {
		guildId,
		name: '',
		testDeliveryMode: asMode(doc.discordTestDeliveryMode, legacyMode),
		productionDeliveryMode: asMode(doc.discordProductionDeliveryMode, legacyMode),
		testWebhookUrl: (doc.discordTestWebhookUrl ?? '').trim(),
		testRoleId: (doc.discordTestRoleId ?? '').trim(),
		productionWebhookUrl: prodWebhook,
		productionRoleId: prodRole,
		testChannelId: (doc.discordTestChannelId ?? '').trim(),
		productionChannelId: (doc.discordProductionChannelId ?? '').trim(),
		botCommandRoleIds: normalizeRoleIdList(doc.discordBotCommandRoleIds),
		teamChatWebhookUrls: normalizeSnowflakeMap(doc.teamChatWebhookUrls),
		teamChatChannelIds: normalizeSnowflakeMap(doc.teamChatChannelIds),
	}
}
