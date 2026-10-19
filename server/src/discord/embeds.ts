import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	type APIActionRowComponent,
	type APIButtonComponent,
} from 'discord.js'
import { type ProfileInput } from './profileText.js'
import {
	formatMinutes,
	pagesRead,
	type SprintView,
} from './sprintState.js'

export const EPHEMERAL = 'Ephemeral' as const

export const COLOR_INFO = 0x5865f2
export const COLOR_OK = 0x57f287
export const COLOR_END = 0xeb459e

const GRACE_MS = 5 * 60_000

export function siteUrl(): string {
	const configured = process.env.FRONTEND_URL?.trim().replace(/\/$/, '') ?? ''
	if (configured.startsWith('https://')) return configured
	return 'https://bookbaddies.net'
}

export function readerUrl(userId: string): string {
	return `${siteUrl()}/readers/${userId}`
}

function heading(view: SprintView, fallback: string): string {
	return view.title?.trim().slice(0, 256) || fallback
}

function stamp(ms: number): string {
	const sec = Math.floor(ms / 1000)
	return `<t:${sec}:F> (<t:${sec}:R>)`
}

function readerLine(person: SprintView['participants'][number]): string {
	const book = person.bookTitle.trim()
	const read = pagesRead(person)
	const parts = [book, `started on page ${person.startPage}`].filter(Boolean)
	if (read === 1) parts.push('1 page read')
	else if (read > 1) parts.push(`${read} pages read`)
	if (person.status === 'paused') parts.push('paused 💤')
	return `📖 **${person.username}** — ${parts.join(' · ')}`
}

function participantLines(view: SprintView): string {
	const people = view.participants.filter((person) => person.status !== 'left')
	if (people.length === 0) return 'Nobody is in the sprint right now 🌱'
	return people.slice(0, 20).map(readerLine).join('\n').slice(0, 1024)
}

export function sprintMessage(
	view: SprintView,
	now = Date.now(),
	separateClose = false,
): {
	content: string
	embeds: EmbedBuilder[]
	components: APIActionRowComponent<APIButtonComponent>[]
} {
	const endAt = view.endsAt ?? view.startsAt + view.durationMinutes * 60_000
	const length = formatMinutes(view.durationMinutes)
	const embed = new EmbedBuilder()
	const rows: ActionRowBuilder<ButtonBuilder>[] = []

	if (view.status === 'scheduled') {
		embed
			.setColor(COLOR_OK)
			.setTitle(heading(view, 'Sprint scheduled'))
			.addFields(
				{ name: '⏱️ Length', value: length, inline: true },
				{ name: '🌱 Starts at', value: stamp(view.startsAt) },
				{ name: '🏁 Ends', value: stamp(endAt) },
				{ name: '📚 Readers', value: participantLines(view) },
			)
		rows.push(
			new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder()
					.setCustomId('sp:join')
					.setLabel('Join')
					.setStyle(ButtonStyle.Success),
				new ButtonBuilder().setCustomId('sp:leave').setLabel('Leave').setStyle(ButtonStyle.Secondary),
				new ButtonBuilder().setCustomId('sp:end').setLabel('Cancel').setStyle(ButtonStyle.Danger),
			),
		)
	} else if (view.status === 'running') {
		embed
			.setColor(COLOR_INFO)
			.setTitle(heading(view, 'Reading sprint'))
			.addFields(
				{ name: '⏱️ Length', value: length, inline: true },
				{ name: '🌱 Starts at', value: stamp(view.startsAt) },
				{ name: '🏁 Runs until', value: stamp(endAt) },
				{ name: '📚 Readers', value: participantLines(view) },
			)
		rows.push(
			new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder()
					.setCustomId('sp:page')
					.setLabel('Update progress')
					.setStyle(ButtonStyle.Primary),
				new ButtonBuilder().setCustomId('sp:leave').setLabel('Leave').setStyle(ButtonStyle.Secondary),
			),
			new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder().setCustomId('sp:join').setLabel('Join').setStyle(ButtonStyle.Success),
				new ButtonBuilder().setCustomId('sp:pause').setLabel('Pause').setStyle(ButtonStyle.Secondary),
				new ButtonBuilder().setCustomId('sp:resume').setLabel('Resume').setStyle(ButtonStyle.Secondary),
				new ButtonBuilder().setCustomId('sp:switch').setLabel('Switch').setStyle(ButtonStyle.Secondary),
				new ButtonBuilder().setCustomId('sp:end').setLabel('End').setStyle(ButtonStyle.Danger),
			),
		)
	} else if (view.status === 'grace') {
		const graceEnd = endAt + GRACE_MS
		embed
			.setColor(COLOR_END)
			.setTitle(heading(view, 'Time is up'))
			.setDescription(
				separateClose
					? 'Set your last page on the message below. The leaderboard is posted once everyone has updated, or after 5 minutes.'
					: 'You have 5 minutes to set your last page.',
			)
			.addFields(
				{ name: '⏳ Closes', value: stamp(graceEnd) },
				{ name: '📚 Readers', value: participantLines(view) },
			)
		if (!separateClose) {
			rows.push(
				new ActionRowBuilder<ButtonBuilder>().addComponents(
					new ButtonBuilder()
						.setCustomId('sp:page')
						.setLabel('Update progress')
						.setStyle(ButtonStyle.Primary),
					new ButtonBuilder().setCustomId('sp:leave').setLabel('Leave').setStyle(ButtonStyle.Secondary),
				),
			)
		}
	} else {
		embed
			.setColor(COLOR_INFO)
			.setTitle(heading(view, 'Sprint finished'))
			.setDescription(`${length}. The leaderboard is posted with the results.`)
	}

	if (view.goal && view.status !== 'ended') {
		embed.addFields({ name: 'Goal', value: view.goal.slice(0, 1024) })
	}
	embed.setFooter({ text: `✨ Hosted by ${view.hostName}` }).setURL(siteUrl())

	return {
		content: '',
		embeds: [embed],
		components: rows.map((row) => row.toJSON() as APIActionRowComponent<APIButtonComponent>),
	}
}

const COMPONENTS_V2 = 1 << 15

export function graceAnnouncement(userIds: string[]): {
	flags: number
	components: unknown[]
	allowed_mentions: { parse: string[]; users: string[] }
} {
	const ids = userIds.slice(0, 40)
	const mentions = ids.map((id) => `<@${id}>`).join(' ')
	return {
		flags: COMPONENTS_V2,
		allowed_mentions: { parse: [], users: ids },
		components: [
			{
				type: 17,
				accent_color: COLOR_END,
				components: [
					{
						type: 10,
						content:
							'**Sprint ended**\nYou have 5 minutes to update your page. If everyone updates sooner, the leaderboard is posted right away.',
					},
					{
						type: 10,
						content: mentions ? `**Ping**\n${mentions}` : '**Ping**\nNobody still needs to update.',
					},
					{
						type: 1,
						components: [
							{ type: 2, style: 1, label: 'Update progress', custom_id: 'sp:page' },
							{ type: 2, style: 2, label: 'Leave', custom_id: 'sp:leave' },
						],
					},
				],
			},
		],
	}
}

export function leaderboardMessage(hasImage: boolean): {
	content: string
	flags: number
	components: unknown[]
	allowed_mentions: { parse: string[] }
} {
	const parts: unknown[] = [
		{ type: 10, content: '**Reading sprint ended**\nHere is the final leaderboard.' },
	]
	if (hasImage) {
		parts.push({ type: 12, items: [{ media: { url: 'attachment://sprint-results.png' } }] })
	}
	return {
		content: '',
		flags: COMPONENTS_V2,
		allowed_mentions: { parse: [] },
		components: [{ type: 17, accent_color: 0x57f287, components: parts }],
	}
}

export function card(title: string, description: string, color = COLOR_INFO): EmbedBuilder {
	return new EmbedBuilder()
		.setColor(color)
		.setAuthor({ name: 'Book Baddies', url: siteUrl() })
		.setTitle(title)
		.setDescription(description.slice(0, 4000))
		.setURL(siteUrl())
		.setFooter({ text: siteUrl().replace(/^https:\/\//, '') })
}

export function profileEmbed(profile: ProfileInput, title: string, description: string): EmbedBuilder {
	const embed = new EmbedBuilder()
		.setColor(COLOR_INFO)
		.setAuthor({ name: 'Book Baddies', url: siteUrl() })
		.setTitle(title)
		.setDescription(description)
		.setURL(profile.site ?? siteUrl())
		.setFooter({ text: siteUrl().replace(/^https:\/\//, '') })
		.addFields(
			{ name: 'Name', value: profile.username, inline: true },
			{ name: 'Team', value: profile.teamName || '—', inline: true },
			{ name: 'Email', value: profile.email || '—', inline: false },
			{ name: 'Pages read', value: String(profile.totalPages), inline: true },
			{ name: 'Time in sprints', value: formatMinutes(profile.totalMinutes), inline: true },
			{ name: 'Sprints joined', value: String(profile.sprintsJoined), inline: true },
			{ name: 'Sprints finished', value: String(profile.sprintsCompleted), inline: true },
			{ name: 'Library', value: `${profile.libraryCount} books`, inline: true },
		)
	if (profile.nametag) {
		embed.addFields({ name: 'Nametag', value: profile.nametag, inline: true })
	}
	if (profile.lastSprintPages != null && profile.lastSprintMinutes != null) {
		const book = profile.lastSprintBook ? ` — ${profile.lastSprintBook}` : ''
		embed.addFields({
			name: 'Last sprint',
			value: `${profile.lastSprintPages} pages in ${formatMinutes(profile.lastSprintMinutes)}${book}`.slice(0, 1024),
		})
	}
	if (profile.live) {
		embed.addFields({ name: 'Right now', value: profile.live.slice(0, 1024) })
	}
	return embed
}
