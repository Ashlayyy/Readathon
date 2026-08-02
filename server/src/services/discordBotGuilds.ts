import {
	clearDiscordBotGuildsCache,
	getDiscordBotGuildsCache,
	getDiscordBotToken,
	getDiscordBotTokenEncFingerprint,
	setDiscordBotGuildsCache,
} from './siteSettings.js'

const DISCORD_API = 'https://discord.com/api/v10'

export type BotGuild = { id: string; name: string }

export type BotGuildsResult =
	| {
			ok: true
			guilds: BotGuild[]
			cached: boolean
			fetchedAt: string
	  }
	| { ok: false; error: string }

/** How long a successful Discord guild list is reused before re-fetch. */
const BOT_GUILDS_TTL_MS = 15 * 60 * 1000

type MemoryCache = {
	tokenKey: string
	guilds: BotGuild[]
	fetchedAtMs: number
}

let memory: MemoryCache | null = null

function cloneGuilds(guilds: BotGuild[]): BotGuild[] {
	return guilds.map((g) => ({ id: g.id, name: g.name }))
}

function isFresh(fetchedAtMs: number): boolean {
	return Date.now() - fetchedAtMs < BOT_GUILDS_TTL_MS
}

async function discordGetGuilds(): Promise<
	| { ok: true; data: Array<{ id: string; name: string }> }
	| { ok: false; status: number; body: string }
> {
	const token = getDiscordBotToken()
	if (!token) {
		return { ok: false, status: 0, body: 'Discord bot token is not configured' }
	}
	const res = await fetch(`${DISCORD_API}/users/@me/guilds?with_counts=false`, {
		headers: {
			Authorization: `Bot ${token}`,
			'Content-Type': 'application/json',
		},
	})
	const body = await res.text()
	if (!res.ok) return { ok: false, status: res.status, body }
	try {
		return { ok: true, data: JSON.parse(body) as Array<{ id: string; name: string }> }
	} catch {
		return { ok: false, status: res.status, body }
	}
}

/** Drop in-memory cache; persisted rows cleared separately via siteSettings. */
export function invalidateBotGuildsMemoryCache(): void {
	memory = null
}

/** Drop memory + persisted bot guild list (e.g. after token change). */
export async function invalidateBotGuildsCache(): Promise<void> {
	memory = null
	await clearDiscordBotGuildsCache()
}

/**
 * List guilds the bot is in. Uses memory + DB cache (15m TTL).
 * Pass `force: true` to hit Discord and refresh the cache.
 */
export async function listBotGuilds(opts?: {
	force?: boolean
}): Promise<BotGuildsResult> {
	if (!getDiscordBotToken()) {
		return { ok: false, error: 'Save a Discord bot token first.' }
	}

	const tokenKey = getDiscordBotTokenEncFingerprint()
	const force = Boolean(opts?.force)

	if (!force && memory && memory.tokenKey === tokenKey && isFresh(memory.fetchedAtMs)) {
		return {
			ok: true,
			guilds: cloneGuilds(memory.guilds),
			cached: true,
			fetchedAt: new Date(memory.fetchedAtMs).toISOString(),
		}
	}

	if (!force) {
		const persisted = getDiscordBotGuildsCache()
		if (persisted?.guilds?.length && persisted.tokenKey === tokenKey) {
			const fetchedAtMs = Date.parse(persisted.fetchedAt) || 0
			memory = {
				tokenKey,
				guilds: cloneGuilds(persisted.guilds),
				fetchedAtMs,
			}
			if (isFresh(fetchedAtMs)) {
				return {
					ok: true,
					guilds: cloneGuilds(persisted.guilds),
					cached: true,
					fetchedAt: persisted.fetchedAt,
				}
			}
			// Stale: serve immediately, refresh in background
			void refreshBotGuildsFromDiscord(tokenKey).catch((e) => {
				console.error('[discord] background bot guilds refresh failed:', e)
			})
			return {
				ok: true,
				guilds: cloneGuilds(persisted.guilds),
				cached: true,
				fetchedAt: persisted.fetchedAt,
			}
		}
	}

	return refreshBotGuildsFromDiscord(tokenKey)
}

async function refreshBotGuildsFromDiscord(tokenKey: string): Promise<BotGuildsResult> {
	const result = await discordGetGuilds()
	if (!result.ok) {
		if (memory && memory.tokenKey === tokenKey && memory.guilds.length) {
			return {
				ok: true,
				guilds: cloneGuilds(memory.guilds),
				cached: true,
				fetchedAt: new Date(memory.fetchedAtMs).toISOString(),
			}
		}
		const persisted = getDiscordBotGuildsCache()
		if (persisted?.guilds?.length && persisted.tokenKey === tokenKey) {
			return {
				ok: true,
				guilds: cloneGuilds(persisted.guilds),
				cached: true,
				fetchedAt: persisted.fetchedAt,
			}
		}
		return {
			ok: false,
			error: `Could not list bot guilds (${result.status}): ${result.body.slice(0, 160)}`,
		}
	}

	const guilds = result.data
		.map((g) => ({ id: g.id, name: g.name }))
		.sort((a, b) => a.name.localeCompare(b.name))
	const fetchedAtMs = Date.now()
	memory = { tokenKey, guilds: cloneGuilds(guilds), fetchedAtMs }
	const fetchedAt = new Date(fetchedAtMs).toISOString()
	try {
		await setDiscordBotGuildsCache({ guilds, fetchedAt, tokenKey })
	} catch (e) {
		console.error('[discord] failed to persist bot guilds cache:', e)
	}
	return { ok: true, guilds, cached: false, fetchedAt }
}
