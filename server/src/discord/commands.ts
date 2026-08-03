import {
	ChatInputCommandInteraction,
	REST,
	Routes,
	SlashCommandBuilder,
} from 'discord.js'
import {
	getDiscordBotCommandRoleIds,
	getDiscordChannelConfig,
	getDiscordDeliveryMode,
	getDiscordGuildConfigs,
	getDiscordPrimaryGuildId,
	getSiteSettingsAdminSync,
	getSiteSettingsSync,
} from '../services/siteSettings.js'
import { verifyDiscordRole } from '../services/discordRoleVerify.js'
import { sendDiscordChannelMessage } from '../services/discord.js'
import { APP_VERSION } from '../lib/version.js'

export const readathonCommandBody = new SlashCommandBuilder()
	.setName('readathon')
	.setDescription('Readathon admin commands (primary server only)')
	.addSubcommand((s) =>
		s.setName('status').setDescription('Show live site / Discord delivery status'),
	)
	.addSubcommand((s) =>
		s
			.setName('standings')
			.setDescription('Link to the current standings page'),
	)
	.addSubcommand((s) =>
		s
			.setName('ping-test')
			.setDescription('Send a test message to the primary test Discord channel'),
	)
	.addSubcommand((s) =>
		s
			.setName('verify-role')
			.setDescription('Verify a Discord role ID exists on the primary guild')
			.addStringOption((o) =>
				o
					.setName('role_id')
					.setDescription('Role snowflake (or leave empty to check ping roles)')
					.setRequired(false),
			),
	)
	.toJSON()

export function memberHasBotCommandRole(
	memberRoleIds: readonly string[],
	guildId?: string | null,
): boolean {
	const allowed = getDiscordBotCommandRoleIds(guildId)
	if (allowed.length === 0) return false
	const set = new Set(memberRoleIds)
	return allowed.some((id) => set.has(id))
}

function memberRoleIdsFromInteraction(
	interaction: ChatInputCommandInteraction,
): string[] {
	const member = interaction.member
	if (!member) return []
	if ('cache' in member.roles) {
		return [...member.roles.cache.keys()]
	}
	const roles = member.roles as string[] | { cache: Map<string, unknown> }
	if (Array.isArray(roles)) return roles
	return []
}

/** Slash commands only run on the configured primary guild. */
export async function assertPrimaryGuild(
	interaction: ChatInputCommandInteraction,
): Promise<string | null> {
	const primary = getDiscordPrimaryGuildId()
	if (!primary) {
		await interaction.reply({
			content:
				'No primary Discord server is set. Pick one under Admin → Settings → Discord.',
			ephemeral: true,
		})
		return null
	}
	if (interaction.guildId !== primary) {
		await interaction.reply({
			content: `Readathon admin commands only work on the **primary** server (\`${primary}\`).`,
			ephemeral: true,
		})
		return null
	}
	return primary
}

export async function assertInteractionAllowed(
	interaction: ChatInputCommandInteraction,
	primaryGuildId: string,
): Promise<boolean> {
	const allowed = getDiscordBotCommandRoleIds(primaryGuildId)
	if (allowed.length === 0) {
		await interaction.reply({
			content:
				'No bot command roles configured for the primary server. Add them under Admin → Settings → Discord (Step 3 on the primary).',
			ephemeral: true,
		})
		return false
	}
	const memberRoles = memberRoleIdsFromInteraction(interaction)
	if (!memberHasBotCommandRole(memberRoles, primaryGuildId)) {
		await interaction.reply({
			content: 'You need an allowed admin role to use Readathon bot commands.',
			ephemeral: true,
		})
		return false
	}
	return true
}

export async function handleReadathonCommand(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	const primary = await assertPrimaryGuild(interaction)
	if (!primary) return
	if (!(await assertInteractionAllowed(interaction, primary))) return

	const sub = interaction.options.getSubcommand()
	if (sub === 'status') {
		const publicSettings = getSiteSettingsSync()
		const admin = getSiteSettingsAdminSync()
		const configs = getDiscordGuildConfigs()
		const testMode = getDiscordDeliveryMode('test', primary)
		const prodMode = getDiscordDeliveryMode('production', primary)
		const test = getDiscordChannelConfig('test', primary)
		const prod = getDiscordChannelConfig('production', primary)
		const lines = [
			`**Readathon status** (v${APP_VERSION})`,
			`Site: ${publicSettings.downtimeMode ? 'downtime' : 'live'}`,
			`Configured servers: **${Object.keys(configs).length}**`,
			`Primary guild: \`${primary}\``,
			`Delivery — test: **${testMode}** · prod: **${prodMode}**`,
			`Bot token: ${admin.discordBotTokenConfigured ? 'configured' : 'missing'}`,
			`Command roles (primary): ${getDiscordBotCommandRoleIds(primary).length}`,
			`Test: ${testMode === 'bot' ? `channel ${test.channelId || '—'}` : `webhook ${test.webhookUrl ? 'set' : '—'}`}`,
			`Prod: ${prodMode === 'bot' ? `channel ${prod.channelId || '—'}` : `webhook ${prod.webhookUrl ? 'set' : '—'}`}`,
		]
		await interaction.reply({ content: lines.join('\n'), ephemeral: true })
		return
	}

	if (sub === 'standings') {
		const base =
			process.env.FRONTEND_URL?.replace(/\/$/, '') || 'http://localhost:5173'
		await interaction.reply({
			content: `Current standings: ${base}/`,
			ephemeral: true,
		})
		return
	}

	if (sub === 'ping-test') {
		await interaction.deferReply({ ephemeral: true })
		const result = await sendDiscordChannelMessage({
			channel: 'test',
			withPing: false,
			kind: 'test',
			guildId: primary,
		})
		if (!result.sent) {
			await interaction.editReply(
				result.error ?? 'Failed to send test message.',
			)
			return
		}
		await interaction.editReply(
			`Test message sent to the primary server’s test channel (\`${primary}\`).`,
		)
		return
	}

	if (sub === 'verify-role') {
		await interaction.deferReply({ ephemeral: true })
		const raw = interaction.options.getString('role_id')?.trim()
		const test = getDiscordChannelConfig('test', primary)
		const prod = getDiscordChannelConfig('production', primary)
		const commandRoles = getDiscordBotCommandRoleIds(primary)
		const ids = raw
			? [raw]
			: [test.roleId, prod.roleId, ...commandRoles].filter(Boolean)
		if (ids.length === 0) {
			await interaction.editReply('No role ID provided or configured.')
			return
		}
		const lines: string[] = []
		for (const id of [...new Set(ids)]) {
			const check = await verifyDiscordRole({ roleId: id, guildId: primary })
			if (check.ok) {
				lines.push(`✅ \`${check.roleId}\` — **${check.roleName}**`)
			} else {
				lines.push(`❌ \`${id}\` — ${check.error}`)
			}
		}
		await interaction.editReply(lines.join('\n'))
	}
}

export async function registerGuildCommands(opts: {
	token: string
	applicationId: string
	guildId: string
}): Promise<void> {
	const rest = new REST({ version: '10' }).setToken(opts.token)
	await rest.put(
		Routes.applicationGuildCommands(opts.applicationId, opts.guildId),
		{ body: [readathonCommandBody] },
	)
}

/** Remove guild slash commands (used when clearing non-primary servers). */
export async function clearGuildCommands(opts: {
	token: string
	applicationId: string
	guildId: string
}): Promise<void> {
	const rest = new REST({ version: '10' }).setToken(opts.token)
	await rest.put(
		Routes.applicationGuildCommands(opts.applicationId, opts.guildId),
		{ body: [] },
	)
}
