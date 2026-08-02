import {
	Client,
	Events,
	GatewayIntentBits,
	Partials,
} from 'discord.js'
import {
	getDiscordBotToken,
	getDiscordPrimaryGuildId,
	onDiscordBotSettingsChanged,
} from '../services/siteSettings.js'
import {
	handleReadathonCommand,
	registerGuildCommands,
} from './commands.js'

let client: Client | null = null
let starting: Promise<void> | null = null
let restartTimer: ReturnType<typeof setTimeout> | null = null

export function getDiscordBotClient(): Client | null {
	return client
}

export function getDiscordGatewayStatus(): {
	ready: boolean
	user: string | null
	userId: string | null
} {
	const ready = Boolean(client?.isReady())
	return {
		ready,
		user: client?.user?.tag ?? null,
		userId: client?.user?.id ?? null,
	}
}

export async function stopDiscordGateway(): Promise<void> {
	if (restartTimer) {
		clearTimeout(restartTimer)
		restartTimer = null
	}
	const current = client
	client = null
	if (current) {
		current.removeAllListeners()
		current.destroy()
	}
}

async function startDiscordGatewayInner(): Promise<void> {
	const token = getDiscordBotToken()
	if (!token) {
		console.log('[discord] gateway: no bot token — skipping')
		return
	}
	if (!getDiscordPrimaryGuildId()) {
		console.log(
			'[discord] gateway: bot token set but no primary guild — commands register once guilds are configured',
		)
	}

	await stopDiscordGateway()

	const next = new Client({
		intents: [GatewayIntentBits.Guilds],
		partials: [Partials.Channel],
	})

	next.once(Events.ClientReady, async (readyClient) => {
		console.log(
			`[discord] gateway ready as ${readyClient.user.tag} (${readyClient.user.id})`,
		)
		const appId = readyClient.application?.id
		const { getDiscordGuildConfigs, getDiscordPrimaryGuildId } = await import(
			'../services/siteSettings.js'
		)
		const configs = getDiscordGuildConfigs()
		const ids = new Set(Object.keys(configs))
		const primary = getDiscordPrimaryGuildId()
		if (primary) ids.add(primary)
		if (appId && ids.size > 0) {
			for (const gId of ids) {
				try {
					await registerGuildCommands({
						token,
						applicationId: appId,
						guildId: gId,
					})
					console.log(`[discord] registered /readathon commands on guild ${gId}`)
				} catch (e) {
					console.error(
						`[discord] failed to register slash commands on ${gId}:`,
						e,
					)
				}
			}
		} else if (!ids.size) {
			console.log(
				'[discord] gateway: no configured guilds — slash commands not registered',
			)
		}
	})

	next.on(Events.InteractionCreate, async (interaction) => {
		if (!interaction.isChatInputCommand()) return
		if (interaction.commandName !== 'readathon') return
		try {
			await handleReadathonCommand(interaction)
		} catch (e) {
			console.error('[discord] command handler error:', e)
			const msg = 'Something went wrong running that command.'
			if (interaction.deferred || interaction.replied) {
				await interaction.followUp({ content: msg, ephemeral: true }).catch(() => {})
			} else {
				await interaction.reply({ content: msg, ephemeral: true }).catch(() => {})
			}
		}
	})

	next.on(Events.Error, (err) => {
		console.error('[discord] client error:', err)
	})

	client = next
	await next.login(token)
}

export async function startDiscordGateway(): Promise<void> {
	if (starting) return starting
	starting = startDiscordGatewayInner()
		.catch((e) => {
			console.error('[discord] gateway failed to start:', e)
			client = null
		})
		.finally(() => {
			starting = null
		})
	return starting
}

export function scheduleDiscordGatewayRestart(): void {
	if (restartTimer) clearTimeout(restartTimer)
	restartTimer = setTimeout(() => {
		restartTimer = null
		void startDiscordGateway()
	}, 750)
}

export function wireDiscordGatewaySettingsHook(): void {
	onDiscordBotSettingsChanged(() => {
		scheduleDiscordGatewayRestart()
	})
}
