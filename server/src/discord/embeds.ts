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
	activeMinutes,
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

function stamp(ms: number): string {
	const sec = Math.floor(ms / 1000)
	return `<t:${sec}:F> (<t:${sec}:R>)`
}

function participantLines(view: SprintView, now: number): string {
	if (view.participants.length === 0) return 'Nobody has joined yet.'
	return view.participants
		.slice(0, 20)
		.map((person) => {
			const book = person.bookTitle || 'No book yet'
			const paused = person.status === 'paused' ? ' · paused' : ''
			return `**${person.username}** — page ${person.currentPage} of ${book} · ${pagesRead(person)} read${paused}`
		})
		.join('\n')
		.slice(0, 1024)
}

function leaderboard(view: SprintView): string {
	const end = view.endsAt ?? Date.now()
	const ranked = [...view.participants].sort((a, b) => pagesRead(b) - pagesRead(a))
	if (ranked.length === 0) return 'Nobody joined this sprint.'
	return ranked
		.slice(0, 15)
		.map((person, index) => {
			const minutes = formatMinutes(activeMinutes(person, view.startsAt, end))
			const book = person.bookTitle ? `\n${person.bookTitle}` : ''
			return `**#${index + 1} — ${person.username}**${book}\nRead **${pagesRead(person)}** pages\nStarted on page **${person.startPage}**\nTook part for **${minutes}**`
		})
		.join('\n\n')
		.slice(0, 4000)
}

export function sprintMessage(view: SprintView, now = Date.now()): {
	content: string
	embeds: EmbedBuilder[]
	components: APIActionRowComponent<APIButtonComponent>[]
} {
	const endAt = view.endsAt ?? view.startsAt + view.durationMinutes * 60_000
	const embed = new EmbedBuilder()
	const rows: ActionRowBuilder<ButtonBuilder>[] = []

	if (view.status === 'scheduled') {
		embed
			.setColor(COLOR_OK)
			.setTitle('READING SPRINT ANNOUNCED')
			.addFields(
				{ name: 'Start time', value: stamp(view.startsAt), inline: false },
				{ name: 'End time', value: stamp(endAt), inline: false },
				{ name: 'Host', value: view.hostName, inline: false },
				{ name: 'Sprint participants', value: participantLines(view, now) },
			)
		rows.push(
			new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder()
					.setCustomId('sp:join')
					.setLabel('Join Sprint')
					.setStyle(ButtonStyle.Success),
				new ButtonBuilder().setCustomId('sp:end').setLabel('Cancel').setStyle(ButtonStyle.Danger),
			),
		)
	} else if (view.status === 'running') {
		embed
			.setColor(COLOR_INFO)
			.setTitle('READING TIME STARTED')
			.setDescription('Time to read.')
			.addFields(
				{ name: 'The sprint will run until', value: stamp(endAt) },
				{ name: 'Sprint participants', value: participantLines(view, now) },
			)
		rows.push(
			new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder()
					.setCustomId('sp:page')
					.setLabel('Update Progress')
					.setStyle(ButtonStyle.Primary),
			),
			new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder().setCustomId('sp:join').setLabel('Join').setStyle(ButtonStyle.Success),
				new ButtonBuilder().setCustomId('sp:pause').setLabel('Pause').setStyle(ButtonStyle.Secondary),
				new ButtonBuilder().setCustomId('sp:resume').setLabel('Resume').setStyle(ButtonStyle.Secondary),
				new ButtonBuilder().setCustomId('sp:switch').setLabel('Switch book').setStyle(ButtonStyle.Secondary),
				new ButtonBuilder().setCustomId('sp:end').setLabel('End').setStyle(ButtonStyle.Danger),
			),
		)
	} else if (view.status === 'grace') {
		const graceEnd = endAt + GRACE_MS
		embed
			.setColor(COLOR_END)
			.setTitle('READING SPRINT ENDED')
			.setDescription('You have 5 minutes to update your page numbers.\nPress Update Progress with the page you finished on.')
			.addFields(
				{ name: 'Update window', value: stamp(graceEnd) },
				{ name: 'Sprint participants', value: participantLines(view, now) },
			)
		rows.push(
			new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder()
					.setCustomId('sp:page')
					.setLabel('Update Progress')
					.setStyle(ButtonStyle.Primary),
			),
		)
	} else {
		embed
			.setColor(COLOR_INFO)
			.setTitle('Reading Sprint Ended')
			.setDescription(`The reading sprint has ended.\n**Duration:** ${formatMinutes(view.durationMinutes)}\n\n${leaderboard(view)}`)
	}

	if (view.goal && view.status !== 'ended') {
		embed.addFields({ name: 'Goal', value: view.goal.slice(0, 1024) })
	}
	embed.setFooter({ text: 'Book Baddies' }).setURL(siteUrl())

	const content =
		view.status === 'scheduled'
			? '**READING SPRINT ANNOUNCED**'
			: view.status === 'running'
				? '**READING TIME STARTED**'
				: view.status === 'grace'
					? '**READING SPRINT ENDED**'
					: '**Reading Sprint Ended**'

	return {
		content,
		embeds: [embed],
		components: rows.map((row) => row.toJSON() as APIActionRowComponent<APIButtonComponent>),
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
