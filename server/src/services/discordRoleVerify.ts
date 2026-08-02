/**
 * Discord role verification via a guild bot.
 * Webhooks alone cannot confirm a role exists on a server — Discord will still
 * accept the post and show @unknown-role. A bot in the guild can list roles.
 *
 * Token / guild come from Admin settings (encrypted in DB), with env fallback.
 */

import {
	getDiscordBotToken,
	getDiscordGuildId,
	normalizeDiscordRoleId,
} from './siteSettings.js'

const DISCORD_API = 'https://discord.com/api/v10'

export type DiscordRoleVerifyResult =
	| { ok: true; roleId: string; roleName: string; guildId: string }
	| { ok: false; error: string; roleId?: string; guildId?: string }

export function isDiscordRoleBotConfigured(): boolean {
	return Boolean(getDiscordBotToken())
}

async function discordGet<T>(
	path: string,
	opts?: { bot?: boolean },
): Promise<{ ok: true; data: T } | { ok: false; status: number; body: string }> {
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
	}
	if (opts?.bot) {
		const token = getDiscordBotToken()
		if (!token) {
			return { ok: false, status: 0, body: 'Discord bot token is not configured' }
		}
		headers.Authorization = `Bot ${token}`
	}

	const res = await fetch(`${DISCORD_API}${path}`, { headers })
	const body = await res.text()
	if (!res.ok) {
		return { ok: false, status: res.status, body: body.slice(0, 400) }
	}
	try {
		return { ok: true, data: JSON.parse(body) as T }
	} catch {
		return { ok: false, status: res.status, body: 'Invalid JSON from Discord' }
	}
}

/**
 * Resolve guild id from settings, or from a webhook URL (…/webhooks/{id}/{token}).
 */
export async function resolveGuildId(opts?: {
	webhookUrl?: string
	guildId?: string
}): Promise<{ ok: true; guildId: string } | { ok: false; error: string }> {
	const explicit = opts?.guildId?.trim()
	if (explicit) return { ok: true, guildId: explicit }

	const fromSettings = getDiscordGuildId()
	if (fromSettings) return { ok: true, guildId: fromSettings }

	const webhookUrl = opts?.webhookUrl?.trim()
	if (!webhookUrl) {
		return {
			ok: false,
			error:
				'No Discord guild ID configured. Pick a server in Admin → Settings (or keep a webhook so we can resolve it).',
		}
	}

	let parsed: URL
	try {
		parsed = new URL(webhookUrl)
	} catch {
		return { ok: false, error: 'Invalid Discord webhook URL.' }
	}

	const match = parsed.pathname.match(/\/api\/webhooks\/(\d+)\/([^/]+)/)
	if (!match) {
		return { ok: false, error: 'Could not parse webhook id/token from URL.' }
	}
	const [, id, token] = match
	const result = await discordGet<{ guild_id?: string | null }>(
		`/webhooks/${id}/${token}`,
	)
	if (!result.ok) {
		return {
			ok: false,
			error: `Could not read webhook from Discord (${result.status || 'no token'}).`,
		}
	}
	const guildId = result.data.guild_id?.trim()
	if (!guildId) {
		return {
			ok: false,
			error: 'Webhook has no guild_id (channel webhook missing server?).',
		}
	}
	return { ok: true, guildId }
}

/** @deprecated Prefer resolveGuildId */
export async function resolveGuildIdFromWebhook(
	webhookUrl: string,
): Promise<{ ok: true; guildId: string } | { ok: false; error: string }> {
	return resolveGuildId({ webhookUrl })
}

type DiscordRole = { id: string; name: string }

export async function listGuildRoles(
	guildId?: string,
): Promise<
	| { ok: true; guildId: string; roles: DiscordRole[] }
	| { ok: false; error: string }
> {
	if (!getDiscordBotToken()) {
		return {
			ok: false,
			error:
				'Save a Discord bot token first (Admin → Settings → Bot credentials), then try again.',
		}
	}
	const trimmed = guildId?.trim()
	const guild = trimmed
		? { ok: true as const, guildId: trimmed }
		: await resolveGuildId()
	if (!guild.ok) return guild

	const rolesRes = await discordGet<DiscordRole[]>(
		`/guilds/${guild.guildId}/roles`,
		{ bot: true },
	)
	if (!rolesRes.ok) {
		if (rolesRes.status === 401 || rolesRes.status === 403) {
			return {
				ok: false,
				error:
					'Discord bot cannot list roles — invite it to this server (use the invite link in Settings) and confirm the Guild ID matches.',
			}
		}
		return {
			ok: false,
			error: `Discord role lookup failed (${rolesRes.status}: ${rolesRes.body.slice(0, 120)}).`,
		}
	}
	return {
		ok: true,
		guildId: guild.guildId,
		roles: rolesRes.data.map((r) => ({ id: r.id, name: r.name })),
	}
}

/** Build an invite URL with bot + applications.commands scopes. */
export async function getDiscordBotInviteUrl(): Promise<
	| { ok: true; url: string; applicationId: string }
	| { ok: false; error: string }
> {
	const token = getDiscordBotToken()
	if (!token) {
		return {
			ok: false,
			error: 'Save a Discord bot token first.',
		}
	}
	const me = await discordGet<{ id: string; bot?: { id?: string } }>(
		'/oauth2/applications/@me',
		{ bot: true },
	)
	if (!me.ok) {
		// Fallback: /users/@me for the bot user, then try applications
		const user = await discordGet<{ id: string }>('/users/@me', { bot: true })
		if (!user.ok) {
			return {
				ok: false,
				error: `Could not read bot application (${me.status}). Check the token.`,
			}
		}
		// Bot user id is not the same as application id; applications/@me is required.
		return {
			ok: false,
			error:
				'Could not read the Discord application for this token. Re-check the bot token.',
		}
	}
	const applicationId = me.data.id
	// View Channel + Send Messages + Embed Links + Attach Files + Read History + Mention Everyone
	const permissions = '248832'
	const url = `https://discord.com/api/oauth2/authorize?client_id=${applicationId}&permissions=${permissions}&scope=bot%20applications.commands`
	return { ok: true, url, applicationId }
}

/**
 * Confirm `roleId` exists on the guild.
 */
export async function verifyDiscordRole(opts: {
	roleId: string
	webhookUrl?: string
	guildId?: string
}): Promise<DiscordRoleVerifyResult> {
	const roleId = normalizeDiscordRoleId(opts.roleId)
	if (!roleId) {
		return { ok: false, error: 'No Discord role ID provided.', roleId: '' }
	}
	if (!/^\d{5,30}$/.test(roleId)) {
		return {
			ok: false,
			error:
				'Role ID must be a numeric snowflake (Developer Mode → right-click role → Copy Role ID).',
			roleId,
		}
	}

	if (!getDiscordBotToken()) {
		return {
			ok: false,
			error:
				'Role check needs a Discord bot token in Admin → Settings. Without it we cannot verify roles before pinging.',
			roleId,
		}
	}

	const guild = opts.guildId
		? { ok: true as const, guildId: opts.guildId }
		: await resolveGuildId({ webhookUrl: opts.webhookUrl })
	if (!guild.ok) {
		return { ok: false, error: guild.error, roleId }
	}

	const listed = await listGuildRoles(guild.guildId)
	if (!listed.ok) {
		return { ok: false, error: listed.error, roleId, guildId: guild.guildId }
	}

	const role = listed.roles.find((r) => r.id === roleId)
	if (!role) {
		return {
			ok: false,
			error: `Role ${roleId} is not on this Discord server (would show as @unknown-role). Copy the Role ID from the same server as the bot.`,
			roleId,
			guildId: guild.guildId,
		}
	}

	return {
		ok: true,
		roleId,
		roleName: role.name,
		guildId: guild.guildId,
	}
}

/** @deprecated Prefer verifyDiscordRole */
export async function verifyDiscordRoleForWebhook(opts: {
	webhookUrl: string
	roleId: string
}): Promise<DiscordRoleVerifyResult> {
	return verifyDiscordRole(opts)
}

/**
 * Soft gate used before pinged sends.
 */
export async function assertDiscordRolePingAllowed(opts: {
	roleId: string
	webhookUrl?: string
	guildId?: string
}): Promise<{ ok: true; roleName: string } | { ok: false; error: string }> {
	const result = await verifyDiscordRole(opts)
	if (!result.ok) return { ok: false, error: result.error }
	return { ok: true, roleName: result.roleName }
}

/** @deprecated Prefer listBotGuilds from discordBotGuilds.ts */
export async function listBotGuilds(): Promise<
	| { ok: true; guilds: Array<{ id: string; name: string }> }
	| { ok: false; error: string }
> {
	const { listBotGuilds: list } = await import('./discordBotGuilds.js')
	const result = await list()
	if (!result.ok) return result
	return { ok: true, guilds: result.guilds }
}
