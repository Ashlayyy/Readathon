import {
	AttachmentBuilder,
	ChannelType,
	ModalBuilder,
	SlashCommandBuilder,
	TextInputBuilder,
	TextInputStyle,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	type ButtonInteraction,
	type ChatInputCommandInteraction,
	type ModalSubmitInteraction,
	type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js'
import {
	formatBookList,
	recallSearch,
	rememberSearch,
	searchBooks,
} from './books.js'
import {
	addHitToLibrary,
	addLibraryBook,
	dropLibraryBook,
	findDiscordMember,
	formatLibrary,
	libraryBooks,
	registerDiscordMember,
	saveReview,
	updateLibraryBook,
} from './members.js'
import {
	beginSprint,
	endChannelSprint,
	joinSprint,
	leaveSprint,
	pauseSprint,
	resumeSprint,
	sprintSeat,
	switchSprintBook,
	updateSprintPage,
} from './sprint.js'
import { parseJoinWait, parseSprintDuration } from './sprintState.js'
import { card, EPHEMERAL, readerUrl, siteUrl } from './embeds.js'
import { loadSiteCard, renderProfileCardPng } from './profileCard.js'
import { getConfig } from '../services/prompts.js'

type MemberInteraction = ChatInputCommandInteraction | ButtonInteraction | ModalSubmitInteraction

const HELP = [
	'`/sprint` — start a reading sprint in this channel',
	'`/join` — join the sprint that is already there',
	'On the sprint message: Update progress, Pause, Resume, Switch, Leave',
	'`/register` — email and team, then a link to the website',
	'`/profile` — pages, time, and your team',
	'`/searchbook` `/library` `/review` `/recommend`',
	'`/avatar` `/background` `/color` `/nametag` `/settings`',
	'`/guide` `/links`',
	'Admins use `/bookbaddies`.',
].join('\n')

const GUIDE = [
	'1. Run `/sprint` with a duration. Under 12 is hours, otherwise minutes. `5m` is 5 minutes and `2h` is 2 hours. Joining wait defaults to 60s, and can be `90s` or `2m`, up to 5 minutes.',
	'2. Press **Join**, or run `/join`. Starting a sprint does not add you.',
	'3. Press **Update progress** when you turn pages. The card keeps your start page.',
	'4. **Pause** stops the clock. **Resume** starts it again. **Leave** asks for your page and takes you out. **Join** puts you back where you left off.',
	'5. When time is up, everyone still in the sprint gets 5 minutes to set a last page. The leaderboard is posted as soon as everyone has updated.',
].join('\n')

function displayName(user: { globalName?: string | null; username: string }): string {
	return user.globalName || user.username
}

async function reply(interaction: MemberInteraction, content: string, title = 'Book Baddies'): Promise<void> {
	const embeds = [card(title, content)]
	if (interaction.isButton() && (interaction.deferred || interaction.replied)) {
		await interaction.followUp({ embeds, flags: EPHEMERAL })
		return
	}
	if (interaction.deferred && !interaction.replied) {
		await interaction.editReply({ embeds })
		return
	}
	if (interaction.replied) {
		await interaction.followUp({ embeds, flags: EPHEMERAL })
		return
	}
	await interaction.reply({ embeds, flags: EPHEMERAL })
}

async function deferProfile(
	interaction: ChatInputCommandInteraction | ModalSubmitInteraction,
): Promise<void> {
	await interaction.deferReply({ flags: 'IsComponentsV2' as unknown as 'Ephemeral' })
}

async function ackButton(interaction: ButtonInteraction): Promise<void> {
	if (!interaction.deferred && !interaction.replied) {
		await interaction.deferUpdate()
	}
}

async function requireMember(interaction: MemberInteraction) {
	const member = await findDiscordMember(interaction.user.id)
	if (!member) {
		await reply(interaction, 'Use `/register` first. That is where your sprint pages are saved.')
		return null
	}
	if (member.username !== displayName(interaction.user)) {
		member.username = displayName(interaction.user)
		await member.save()
	}
	return member
}

function channelIdFrom(
	interaction: ChatInputCommandInteraction,
): string | null {
	const chosen = interaction.options.getChannel('channel')
	if (chosen) return chosen.id
	return interaction.channelId
}

function parseOptionalPage(raw: string | null, fallback: number): number | null {
	const text = (raw ?? '').trim()
	if (!text) return fallback
	if (!/^\d+$/.test(text)) return null
	const page = Number(text)
	if (page > 1_000_000) return null
	return page
}

const KEEP_CURRENT = 'Leave empty to keep what you already have.'

function sprintModal(customId: string, title: string, fields: TextInputBuilder[]) {
	const modal = new ModalBuilder().setCustomId(customId).setTitle(title)
	for (const field of fields) {
		modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(field))
	}
	return modal
}

function textLabel(
	customId: string,
	label: string,
	value: string,
	style: TextInputStyle,
	maxLength: number,
) {
	const component: {
		type: 4
		custom_id: string
		style: TextInputStyle
		required: false
		max_length: number
		placeholder: string
		value?: string
	} = {
		type: 4,
		custom_id: customId,
		style,
		required: false,
		max_length: maxLength,
		placeholder: KEEP_CURRENT,
	}
	const current = value.trim()
	if (current) component.value = current.slice(0, maxLength)
	return {
		type: 18 as const,
		label,
		description: KEEP_CURRENT,
		component,
	}
}

function discordAvatar(user: { displayAvatarURL: (options: { extension: 'png'; size: 256 }) => string }): string {
	return user.displayAvatarURL({ extension: 'png', size: 256 })
}

async function replyWithCard(
	interaction: MemberInteraction,
	member: {
		username: string
		nametag?: string | null
		color?: string | null
		backgroundUrl?: string | null
		avatarUrl?: string | null
		genres?: string | null
		authors?: string | null
		bio?: string | null
		totalPages?: number | null
		totalMinutes?: number | null
		sprintsCompleted?: number | null
		siteUserId?: string | null
		discordUserId?: string | null
		library?: Iterable<{ author?: string | null }> | null
	},
	fallbackAvatar: string,
	page: 0 | 1 = 0,
	editable?: boolean,
): Promise<void> {
	const libraryAuthors = [...(member.library ?? [])]
		.map((book) => book.author?.trim() || '')
		.filter(Boolean)
	const authors = member.authors?.trim() || [...new Set(libraryAuthors)].slice(0, 8).join(', ')
	const png = await renderProfileCardPng({
		name: member.username,
		nametag: member.nametag ?? null,
		color: member.color ?? null,
		backgroundUrl: member.backgroundUrl ?? null,
		avatarUrl: member.avatarUrl || fallbackAvatar,
		genres: member.genres ?? null,
		authors,
		bio: member.bio ?? null,
		pages: member.totalPages ?? 0,
		minutes: member.totalMinutes ?? 0,
		sprintsDone: member.sprintsCompleted ?? 0,
		page,
		site: page === 1 ? await loadSiteCard(member.siteUserId) : null,
	})
	if (page === 0 && member.discordUserId) {
		const other = {
			name: member.username,
			nametag: member.nametag ?? null,
			color: member.color ?? null,
			backgroundUrl: member.backgroundUrl ?? null,
			avatarUrl: member.avatarUrl || fallbackAvatar,
			genres: member.genres ?? null,
			authors,
			bio: member.bio ?? null,
			pages: member.totalPages ?? 0,
			minutes: member.totalMinutes ?? 0,
			sprintsDone: member.sprintsCompleted ?? 0,
			page: 1 as const,
			site: null as Awaited<ReturnType<typeof loadSiteCard>> | null,
		}
		void loadSiteCard(member.siteUserId).then((site) => renderProfileCardPng({ ...other, site }))
	}
	const link = member.siteUserId ? readerUrl(member.siteUserId) : siteUrl()
	const titleName = member.nametag || member.username
	const files = [new AttachmentBuilder(png, { name: 'profile.png' })]
	const profileId = member.discordUserId || ''
	const canEdit = editable ?? interaction.user.id === profileId
	const accent = member.color ? Number.parseInt(member.color.slice(1), 16) : 0x6d28d9
	const cardParts: Array<Record<string, unknown>> = [
		{ type: 10, content: `**${titleName}'s Profile**\nPage ${page + 1}/2` },
		{ type: 12, items: [{ media: { url: 'attachment://profile.png' } }] },
	]
	if (canEdit) {
		cardParts.push({
			type: 9,
			components: [{ type: 10, content: '**Customize**\nEdit and customize your profile' }],
			accessory: {
				type: 2,
				style: 3,
				label: 'Edit',
				custom_id: `pf:edit:${profileId}`,
			},
		})
	}
	const components = [
		{
			type: 17,
			accent_color: accent,
			components: cardParts,
		},
		new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId(`pf:pg:0:${profileId}:${canEdit ? '1' : '0'}`)
				.setLabel('◀')
				.setStyle(ButtonStyle.Secondary)
				.setDisabled(page === 0 || !profileId),
			new ButtonBuilder()
				.setCustomId(`pf:pg:1:${profileId}:${canEdit ? '1' : '0'}`)
				.setLabel('▶')
				.setStyle(ButtonStyle.Primary)
				.setDisabled(page === 1 || !profileId),
			new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(link).setLabel('Open profile on website'),
		),
	]
	const payload = { components, files, flags: 'IsComponentsV2' as const }
	if (interaction.deferred || interaction.replied) {
		await interaction.editReply(payload)
		return
	}
	await interaction.reply(payload)
}

function shortInput(customId: string, label: string, required: boolean) {
	return new TextInputBuilder()
		.setCustomId(customId)
		.setLabel(label)
		.setStyle(TextInputStyle.Short)
		.setRequired(required)
		.setMaxLength(200)
}

export const sprintCommand = new SlashCommandBuilder()
	.setName('sprint')
	.setDescription('Start a reading sprint in this channel')
	.addStringOption((option) =>
		option
			.setName('duration')
			.setDescription('Under 12 is hours. 12 or more is minutes. Or write 5m or 2h.')
			.setRequired(true)
			.setMaxLength(20),
	)
	.addRoleOption((option) =>
		option
			.setName('ping_role')
			.setDescription('Role to mention when the sprint is announced.'),
	)
	.addStringOption((option) =>
		option
			.setName('joining_wait_time')
			.setDescription('Wait before reading starts. 60s or 2m. Max 5 minutes. Default 60s.')
			.setMaxLength(20),
	)
	.addStringOption((option) =>
		option.setName('custom_title').setDescription('Optional title for the sprint.').setMaxLength(100),
	)
	.addChannelOption((option) =>
		option
			.setName('channel')
			.setDescription('Where to post the sprint. Defaults to this channel')
			.addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
	)

export const joinCommand = new SlashCommandBuilder()
	.setName('join')
	.setDescription('Join the reading sprint in this channel')
	.addStringOption((option) =>
		option.setName('book').setDescription('The book you are reading').setMaxLength(200),
	)
	.addIntegerOption((option) =>
		option
			.setName('start_page')
			.setDescription('The page you are on')
			.setMinValue(0)
			.setMaxValue(1_000_000),
	)

export const registerCommand = new SlashCommandBuilder()
	.setName('register')
	.setDescription('Save your reader profile: email and team')
	.addStringOption((option) =>
		option.setName('email').setDescription('Your email, the one on the website').setRequired(true).setMaxLength(200),
	)
	.addStringOption((option) => {
		option.setName('team').setDescription('Your team').setRequired(true)
		const teams = getConfig().teams.slice(0, 25)
		if (teams.length === 0) {
			option.addChoices({ name: 'No team yet', value: 'none' })
		} else {
			for (const team of teams) {
				const icon = 'icon' in team && team.icon ? `${team.icon} ` : ''
				option.addChoices({ name: `${icon}${team.name}`.slice(0, 100), value: team.id })
			}
		}
		return option
	})

export const profileCommand = new SlashCommandBuilder()
	.setName('profile')
	.setDescription('Show pages read, sprint time, and library')
	.addUserOption((option) =>
		option.setName('user').setDescription('Whose profile to show'),
	)

export const searchbookCommand = new SlashCommandBuilder()
	.setName('searchbook')
	.setDescription('Search for a book')
	.addStringOption((option) =>
		option.setName('book').setDescription('Title').setRequired(true).setMaxLength(200),
	)
	.addStringOption((option) =>
		option.setName('author').setDescription('Author').setMaxLength(200),
	)

export const libraryCommand = new SlashCommandBuilder()
	.setName('library')
	.setDescription('Your reading library')
	.addSubcommand((sub) => sub.setName('view').setDescription('Show your books'))
	.addSubcommand((sub) =>
		sub
			.setName('add')
			.setDescription('Add a book')
			.addStringOption((option) =>
				option.setName('title').setDescription('Title').setRequired(true).setMaxLength(200),
			)
			.addStringOption((option) =>
				option.setName('author').setDescription('Author').setMaxLength(200),
			)
			.addStringOption((option) =>
				option
					.setName('status')
					.setDescription('Where it sits in your library')
					.addChoices(
						{ name: 'Want to read', value: 'want' },
						{ name: 'Reading', value: 'reading' },
						{ name: 'Finished', value: 'finished' },
					),
			),
	)
	.addSubcommand((sub) =>
		sub
			.setName('progress')
			.setDescription('Update the page you are on')
			.addStringOption((option) =>
				option.setName('title').setDescription('Title').setRequired(true).setMaxLength(200),
			)
			.addIntegerOption((option) =>
				option.setName('page').setDescription('Current page').setRequired(true).setMinValue(0).setMaxValue(1_000_000),
			),
	)
	.addSubcommand((sub) =>
		sub
			.setName('drop')
			.setDescription('Remove a book')
			.addStringOption((option) =>
				option.setName('title').setDescription('Title').setRequired(true).setMaxLength(200),
			),
	)
	.addSubcommand((sub) =>
		sub
			.setName('rate')
			.setDescription('Rate a book in your library')
			.addStringOption((option) =>
				option.setName('title').setDescription('Title').setRequired(true).setMaxLength(200),
			)
			.addIntegerOption((option) =>
				option.setName('stars').setDescription('1 to 5').setRequired(true).setMinValue(1).setMaxValue(5),
			),
	)

export const reviewCommand = new SlashCommandBuilder()
	.setName('review')
	.setDescription('Write a short review')
	.addStringOption((option) =>
		option.setName('title').setDescription('Book title').setRequired(true).setMaxLength(200),
	)
	.addIntegerOption((option) =>
		option.setName('stars').setDescription('1 to 5').setRequired(true).setMinValue(1).setMaxValue(5),
	)
	.addStringOption((option) =>
		option.setName('text').setDescription('What you thought').setMaxLength(1000),
	)
	.addStringOption((option) =>
		option.setName('author').setDescription('Author').setMaxLength(200),
	)

export const recommendCommand = new SlashCommandBuilder()
	.setName('recommend')
	.setDescription('Suggest a few books')
	.addStringOption((option) =>
		option.setName('genre').setDescription('A genre or subject to search').setMaxLength(80),
	)

export const helpCommand = new SlashCommandBuilder()
	.setName('help')
	.setDescription('List Book Baddies commands')

export const guideCommand = new SlashCommandBuilder()
	.setName('guide')
	.setDescription('How reading sprints work')

export const linksCommand = new SlashCommandBuilder()
	.setName('links')
	.setDescription('Links for the readathon site')

export const avatarCommand = new SlashCommandBuilder()
	.setName('avatar')
	.setDescription('Set or show the picture on your profile card')
	.addUserOption((option) => option.setName('user').setDescription('Whose card to show'))
	.addAttachmentOption((option) =>
		option.setName('image').setDescription('Picture to use on your card'),
	)

export const backgroundCommand = new SlashCommandBuilder()
	.setName('background')
	.setDescription('Set the image on your profile')
	.addStringOption((option) =>
		option.setName('url').setDescription('https image URL').setMaxLength(300),
	)
	.addBooleanOption((option) =>
		option.setName('clear').setDescription('Remove the current background'),
	)

export const colorCommand = new SlashCommandBuilder()
	.setName('color')
	.setDescription('Set your profile color')
	.addStringOption((option) =>
		option.setName('hex').setDescription('Like #c45c26').setRequired(true).setMaxLength(7),
	)

export const nametagCommand = new SlashCommandBuilder()
	.setName('nametag')
	.setDescription('Set the short line under your name')
	.addStringOption((option) =>
		option.setName('text').setDescription('Up to 32 characters').setMaxLength(32),
	)
	.addBooleanOption((option) => option.setName('clear').setDescription('Remove your nametag'))

export const settingsCommand = new SlashCommandBuilder()
	.setName('settings')
	.setDescription('Your color and nametag')

export const memberCommandBodies: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [
	sprintCommand,
	joinCommand,
	registerCommand,
	profileCommand,
	searchbookCommand,
	libraryCommand,
	reviewCommand,
	recommendCommand,
	helpCommand,
	guideCommand,
	linksCommand,
	avatarCommand,
	backgroundCommand,
	colorCommand,
	nametagCommand,
	settingsCommand,
].map((command) => command.toJSON())

async function handleSprint(interaction: ChatInputCommandInteraction): Promise<void> {
	const member = await requireMember(interaction)
	if (!member) return
	const channelId = channelIdFrom(interaction)
	if (!channelId) {
		await reply(interaction, 'Run this in a channel, or pick one.', 'Sprint')
		return
	}
	const parsed = parseSprintDuration(interaction.options.getString('duration', true))
	if (!parsed.ok) {
		await reply(interaction, parsed.error, 'Sprint')
		return
	}
	const waitRaw = interaction.options.getString('joining_wait_time')
	const wait = waitRaw ? parseJoinWait(waitRaw) : { ok: true as const, seconds: 60 }
	if (!wait.ok) {
		await reply(interaction, wait.error, 'Sprint')
		return
	}
	await interaction.deferReply({ flags: EPHEMERAL })
	const result = await beginSprint({
		guildId: interaction.guildId!,
		channelId,
		hostId: interaction.user.id,
		hostName: displayName(interaction.user),
		durationMinutes: parsed.minutes,
		goal: null,
		title: interaction.options.getString('custom_title'),
		pingRoleId: interaction.options.getRole('ping_role')?.id ?? null,
		waitSeconds: wait.seconds,
	})
	await interaction.editReply({ embeds: [card('Reading sprint', result.reply)] })
}

async function handleJoin(interaction: ChatInputCommandInteraction): Promise<void> {
	const member = await requireMember(interaction)
	if (!member) return
	if (!interaction.channelId) {
		await reply(interaction, 'Run this in the sprint channel.', 'Join')
		return
	}
	const result = await joinSprint({
		channelId: interaction.channelId,
		userId: interaction.user.id,
		username: displayName(interaction.user),
		bookTitle: interaction.options.getString('book') ?? '',
		startPage: interaction.options.getInteger('start_page') ?? 0,
	})
	await reply(interaction, result.reply, 'Join sprint')
}

const MEMBER_COMMANDS = new Set([
	'sprint',
	'join',
	'register',
	'profile',
	'searchbook',
	'library',
	'review',
	'recommend',
	'help',
	'guide',
	'links',
	'avatar',
	'background',
	'color',
	'nametag',
	'settings',
])

export async function handleMemberCommand(interaction: ChatInputCommandInteraction): Promise<void> {
	if (!MEMBER_COMMANDS.has(interaction.commandName)) return
	if (!interaction.guildId) {
		await reply(interaction, 'Use this in the server, not in a DM.')
		return
	}
	const name = interaction.commandName
	if (name === 'sprint') return handleSprint(interaction)
	if (name === 'join') return handleJoin(interaction)
	if (name === 'help') return reply(interaction, HELP, 'Commands')
	if (name === 'guide') return reply(interaction, GUIDE, 'How a sprint works')
	if (name === 'links') {
		const base = siteUrl()
		return reply(interaction, `Website: ${base}\nStandings: ${base}/`, 'Links')
	}
	if (name === 'avatar') {
		const user = interaction.options.getUser('user') ?? interaction.user
		const record = user.id === interaction.user.id ? await requireMember(interaction) : await findDiscordMember(user.id)
		if (!record) {
			await reply(interaction, `${displayName(user)} has not registered.`, 'Profile')
			return
		}
		const image = interaction.options.getAttachment('image')
		if (image && user.id === interaction.user.id) {
			if (!image.contentType?.startsWith('image/') || !image.url.startsWith('https://')) {
				await reply(interaction, 'Attach an image.', 'Avatar')
				return
			}
			record.avatarUrl = image.url
			await record.save()
		}
		await deferProfile(interaction)
		await replyWithCard(interaction, record, discordAvatar(user))
		return
	}
	if (name === 'register') {
		const email = interaction.options.getString('email', true).trim()
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			await reply(interaction, 'That email does not look right.', 'Register')
			return
		}
		const teamId = interaction.options.getString('team', true)
		const team = getConfig().teams.find((item) => item.id === teamId)
		if (!team) {
			await reply(interaction, 'Pick a team from the list.', 'Register')
			return
		}
		const result = await registerDiscordMember(interaction.user.id, displayName(interaction.user), {
			email,
			teamId: team.id,
			teamName: team.name,
		})
		await deferProfile(interaction)
		await replyWithCard(interaction, result.member, discordAvatar(interaction.user))
		return
	}
	if (name === 'profile') {
		await deferProfile(interaction)
		const user = interaction.options.getUser('user') ?? interaction.user
		const member = await findDiscordMember(user.id)
		if (!member) {
			await interaction.editReply({
				embeds: [
					card(
						'Profile',
						user.id === interaction.user.id
							? 'Use `/register` first.'
							: `${displayName(user)} has not registered.`,
					),
				],
			})
			return
		}
		await replyWithCard(interaction, member, discordAvatar(user))
		return
	}

	const member = await requireMember(interaction)
	if (!member) return

	if (name === 'searchbook') {
		await interaction.deferReply({ flags: EPHEMERAL })
		try {
			const hits = await searchBooks({
				title: interaction.options.getString('book', true),
				author: interaction.options.getString('author') ?? undefined,
			})
			rememberSearch(interaction.user.id, hits)
			const row = new ActionRowBuilder<ButtonBuilder>()
			hits.slice(0, 5).forEach((_, index) => {
				row.addComponents(
					new ButtonBuilder()
						.setCustomId(`bk:add:${index}`)
						.setLabel(`Add ${index + 1}`)
						.setStyle(ButtonStyle.Secondary),
				)
			})
			await interaction.editReply({
				embeds: [card('Books', formatBookList(hits))],
				components: hits.length ? [row] : [],
			})
		} catch (error) {
			await interaction.editReply({
				embeds: [card('Books', error instanceof Error ? error.message : 'Book search failed.')],
			})
		}
		return
	}

	if (name === 'library') {
		const sub = interaction.options.getSubcommand()
		if (sub === 'view') {
			await reply(interaction, formatLibrary(libraryBooks(member)))
			return
		}
		if (sub === 'add') {
			const status = interaction.options.getString('status')
			const result = await addLibraryBook(interaction.user.id, {
				title: interaction.options.getString('title', true),
				author: interaction.options.getString('author') ?? '',
				status: status === 'reading' || status === 'finished' || status === 'want' ? status : 'want',
			})
			await reply(interaction, result.ok ? `Added **${result.title}**.` : result.error)
			return
		}
		if (sub === 'progress') {
			const result = await updateLibraryBook(interaction.user.id, interaction.options.getString('title', true), {
				page: interaction.options.getInteger('page', true),
				status: 'reading',
			})
			await reply(interaction, result.ok ? `Updated **${result.title}**.` : result.error)
			return
		}
		if (sub === 'drop') {
			const result = await dropLibraryBook(interaction.user.id, interaction.options.getString('title', true))
			await reply(interaction, result.ok ? `Removed **${result.title}**.` : result.error)
			return
		}
		if (sub === 'rate') {
			const result = await updateLibraryBook(interaction.user.id, interaction.options.getString('title', true), {
				rating: interaction.options.getInteger('stars', true),
				status: 'finished',
			})
			await reply(interaction, result.ok ? `Rated **${result.title}**.` : result.error)
		}
		return
	}

	if (name === 'review') {
		const result = await saveReview(interaction.user.id, {
			title: interaction.options.getString('title', true),
			author: interaction.options.getString('author') ?? undefined,
			rating: interaction.options.getInteger('stars', true),
			review: interaction.options.getString('text') ?? undefined,
		})
		await reply(interaction, result.ok ? `Saved your review of **${result.title}**.` : result.error)
		return
	}

	if (name === 'recommend') {
		await interaction.deferReply({ flags: EPHEMERAL })
		const genre = interaction.options.getString('genre')?.trim()
		const author = libraryBooks(member).find((book) => book.author)?.author
		if (!genre && !author) {
			await interaction.editReply({
				embeds: [card('Recommend', 'Add a book with an author, or pass a genre. `/recommend genre:fantasy`')],
			})
			return
		}
		try {
			const hits = await searchBooks(genre ? { subject: genre } : { author })
			const owned = new Set(libraryBooks(member).map((book) => book.title.toLowerCase()))
			const fresh = hits.filter((hit) => !owned.has(hit.title.toLowerCase()))
			rememberSearch(interaction.user.id, fresh)
			await interaction.editReply({ embeds: [card('Recommend', formatBookList(fresh))] })
		} catch (error) {
			await interaction.editReply({
				embeds: [card('Recommend', error instanceof Error ? error.message : 'Could not load recommendations.')],
			})
		}
		return
	}

	if (name === 'background') {
		if (interaction.options.getBoolean('clear')) {
			member.backgroundUrl = null
			await member.save()
			await deferProfile(interaction)
			await replyWithCard(interaction, member, discordAvatar(interaction.user))
			return
		}
		const url = interaction.options.getString('url')?.trim() ?? ''
		if (!/^https:\/\/\S+$/i.test(url)) {
			await reply(interaction, 'Give an https image URL, or set clear to true.')
			return
		}
		member.backgroundUrl = url
		await member.save()
		await deferProfile(interaction)
		await replyWithCard(interaction, member, discordAvatar(interaction.user))
		return
	}

	if (name === 'color') {
		const raw = interaction.options.getString('hex', true).trim()
		const hex = raw.startsWith('#') ? raw : `#${raw}`
		if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
			await reply(interaction, 'Use a color like `#c45c26`.')
			return
		}
		member.color = hex.toLowerCase()
		await member.save()
		await deferProfile(interaction)
		await replyWithCard(interaction, member, discordAvatar(interaction.user))
		return
	}

	if (name === 'nametag') {
		if (interaction.options.getBoolean('clear')) {
			member.nametag = null
			await member.save()
			await deferProfile(interaction)
			await replyWithCard(interaction, member, discordAvatar(interaction.user))
			return
		}
		const text = interaction.options.getString('text')?.trim() ?? ''
		if (!text || text.length > 32) {
			await reply(interaction, 'Give a nametag up to 32 characters, or set clear to true.')
			return
		}
		member.nametag = text
		await member.save()
		await deferProfile(interaction)
		await replyWithCard(interaction, member, discordAvatar(interaction.user))
		return
	}

	if (name === 'settings') {
		await reply(
			interaction,
			[`Color: ${member.color || 'default'}`, `Nametag: ${member.nametag || 'none'}`].join('\n'),
			'Settings',
		)
	}
}

export async function handleMemberComponent(
	interaction: ButtonInteraction | ModalSubmitInteraction,
): Promise<void> {
	if (interaction.isButton() && interaction.customId.startsWith('pf:pg:')) {
		const [, , pageRaw, userId, ownRaw] = interaction.customId.split(':')
		const page = pageRaw === '1' ? 1 : 0
		const editable = ownRaw === undefined ? userId === interaction.user.id : ownRaw === '1'
		await interaction.deferUpdate()
		const record = userId ? await findDiscordMember(userId) : null
		if (!record) {
			await interaction.followUp({
				flags: EPHEMERAL,
				embeds: [card('Profile', 'That profile could not be opened.')],
			})
			return
		}
		const avatar = userId === interaction.user.id ? discordAvatar(interaction.user) : record.avatarUrl || ''
		await replyWithCard(interaction, record, avatar, page, editable)
		return
	}
	if (interaction.isButton() && /^pf:edit(?::\d+)?$/.test(interaction.customId)) {
		const ownerId = interaction.customId.slice('pf:edit:'.length)
		if (ownerId && ownerId !== interaction.user.id) {
			await reply(interaction, 'You can only edit your own profile.')
			return
		}
		const member = await requireMember(interaction)
		if (!member) return
		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId('pf:edit:look')
				.setLabel('Color and avatar')
				.setStyle(ButtonStyle.Primary),
			new ButtonBuilder()
				.setCustomId('pf:edit:text')
				.setLabel('Name, genres, and bio')
				.setStyle(ButtonStyle.Secondary),
		)
		await interaction.reply({
			flags: EPHEMERAL,
			embeds: [
				card(
					'Edit profile',
					[
						'Choose what to change.',
						'',
						'**Color and avatar** sets the card color and picture.',
						'**Name, genres, and bio** opens the profile form.',
						'',
						KEEP_CURRENT,
					].join('\n'),
				),
			],
			components: [row],
		})
		return
	}
	if (interaction.isButton() && interaction.customId === 'pf:edit:text') {
		const member = await requireMember(interaction)
		if (!member) return
		await interaction.showModal({
			custom_id: 'pf:edit:m',
			title: 'Edit your profile',
			components: [
				textLabel('nametag', 'Display name', member.nametag ?? '', TextInputStyle.Short, 32),
				textLabel('genres', 'Preferred genres', member.genres ?? '', TextInputStyle.Short, 200),
				textLabel('authors', 'Favorite authors', member.authors ?? '', TextInputStyle.Short, 200),
				textLabel('bio', 'Bio', member.bio ?? '', TextInputStyle.Paragraph, 300),
			],
		})
		return
	}
	if (interaction.isButton() && interaction.customId === 'pf:edit:look') {
		const member = await requireMember(interaction)
		if (!member) return
		await interaction.showModal({
			custom_id: 'pf:edit:look:m',
			title: 'Color and avatar',
			components: [
				textLabel('color', 'Color', member.color ?? '', TextInputStyle.Short, 7),
				{
					type: 18,
					label: 'Avatar',
					description: 'Leave empty to keep your current picture.',
					component: {
						type: 19,
						custom_id: 'avatar',
						required: false,
						min_values: 0,
						max_values: 1,
						file_types: ['image'],
					},
				},
			],
		})
		return
	}
	if (interaction.isModalSubmit() && interaction.customId === 'pf:edit:m') {
		const member = await requireMember(interaction)
		if (!member) return
		const nametag = interaction.fields.getTextInputValue('nametag').trim()
		const genres = interaction.fields.getTextInputValue('genres').trim()
		const authors = interaction.fields.getTextInputValue('authors').trim()
		const bio = interaction.fields.getTextInputValue('bio').trim()
		let changed = false
		if (nametag && nametag.slice(0, 32) !== (member.nametag ?? '')) {
			member.nametag = nametag.slice(0, 32)
			changed = true
		}
		if (genres && genres.slice(0, 200) !== (member.genres ?? '')) {
			member.genres = genres.slice(0, 200)
			changed = true
		}
		if (authors && authors.slice(0, 200) !== (member.authors ?? '')) {
			member.authors = authors.slice(0, 200)
			changed = true
		}
		if (bio && bio.slice(0, 300) !== (member.bio ?? '')) {
			member.bio = bio.slice(0, 300)
			changed = true
		}
		if (!changed) {
			await reply(interaction, `Nothing changed. ${KEEP_CURRENT}`)
			return
		}
		await member.save()
		await deferProfile(interaction)
		await replyWithCard(interaction, member, discordAvatar(interaction.user))
		return
	}
	if (interaction.isModalSubmit() && interaction.customId === 'pf:edit:look:m') {
		const member = await requireMember(interaction)
		if (!member) return
		const raw = interaction.fields.getTextInputValue('color').trim()
		let nextColor: string | null = null
		if (raw) {
			const hex = raw.startsWith('#') ? raw : `#${raw}`
			if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
				await reply(interaction, 'Use a color like `#c45c26`. Leave it empty to keep your current color.')
				return
			}
			nextColor = hex.toLowerCase()
		}
		let nextAvatar: string | null = null
		try {
			const file = interaction.fields.getUploadedFiles('avatar')?.first()
			if (file) {
				if (!file.contentType?.startsWith('image/') || !file.url.startsWith('https://')) {
					await reply(interaction, 'Attach an image, or leave it empty to keep your current picture.')
					return
				}
				nextAvatar = file.url
			}
		} catch {
			nextAvatar = null
		}
		if (nextColor && nextColor !== (member.color ?? '')) member.color = nextColor
		else nextColor = null
		if (nextAvatar && nextAvatar !== (member.avatarUrl ?? '')) member.avatarUrl = nextAvatar
		else nextAvatar = null
		if (!nextColor && !nextAvatar) {
			await reply(interaction, `Nothing changed. ${KEEP_CURRENT}`)
			return
		}
		await member.save()
		await deferProfile(interaction)
		await replyWithCard(interaction, member, discordAvatar(interaction.user))
		return
	}
	if (!interaction.guildId || !interaction.channelId) {
		await reply(interaction, 'Use this in the server.')
		return
	}
	const customId = interaction.customId
	if (customId.startsWith('bk:add:')) {
		const member = await requireMember(interaction)
		if (!member) return
		const index = Number(customId.slice('bk:add:'.length))
		const hits = recallSearch(interaction.user.id)
		const hit = hits?.[index]
		if (!hit) {
			await reply(interaction, 'That search expired. Run `/searchbook` again.')
			return
		}
		const result = await addHitToLibrary(interaction.user.id, hit)
		await reply(interaction, result.ok ? `Added **${result.title}** to your library.` : result.error)
		return
	}

	if (!customId.startsWith('sp:')) return
	const channelId = interaction.channelId

	if (interaction.isButton() && customId === 'sp:join') {
		const seat = await sprintSeat(channelId, interaction.user.id)
		if (seat === 'left') {
			await ackButton(interaction)
			const member = await requireMember(interaction)
			if (!member) return
			const result = await joinSprint({
				channelId,
				userId: interaction.user.id,
				username: displayName(interaction.user),
				bookTitle: '',
				startPage: 0,
			})
			await interaction.followUp({ embeds: [card('Sprint', result.reply)], flags: EPHEMERAL })
			return
		}
		if (seat === 'in') {
			await reply(interaction, 'You are already in this sprint.')
			return
		}
		await interaction.showModal(
			sprintModal('sp:join:m', 'Join the sprint', [
				shortInput('book', 'Book', false),
				shortInput('start_page', 'Starting page', false),
			]),
		)
		return
	}
	if (interaction.isButton() && customId === 'sp:leave') {
		await interaction.showModal(
			sprintModal('sp:leave:m', 'Leave the sprint', [shortInput('page', 'Current page', true)]),
		)
		return
	}
	if (interaction.isButton() && customId === 'sp:page') {
		await interaction.showModal(
			sprintModal('sp:page:m', 'Update your page', [shortInput('page', 'Current page', true)]),
		)
		return
	}
	if (interaction.isButton() && customId === 'sp:switch') {
		await interaction.showModal(
			sprintModal('sp:switch:m', 'Switch book', [
				shortInput('book', 'New book', true),
				shortInput('start_page', 'Starting page', false),
			]),
		)
		return
	}
	if (interaction.isButton() && (customId === 'sp:pause' || customId === 'sp:resume' || customId === 'sp:end')) {
		await ackButton(interaction)
	}

	const member = await requireMember(interaction)
	if (!member) return
	const name = displayName(interaction.user)

	if (interaction.isButton() && customId === 'sp:pause') {
		const result = await pauseSprint({ channelId, userId: interaction.user.id, username: name })
		await interaction.followUp({ embeds: [card('Sprint', result.reply)], flags: EPHEMERAL })
		return
	}
	if (interaction.isButton() && customId === 'sp:resume') {
		const result = await resumeSprint({ channelId, userId: interaction.user.id, username: name })
		await interaction.followUp({ embeds: [card('Sprint', result.reply)], flags: EPHEMERAL })
		return
	}
	if (interaction.isButton() && customId === 'sp:end') {
		const result = await endChannelSprint(channelId, interaction.user.id)
		if (!result.ok || !result.quiet) {
			await interaction.followUp({ embeds: [card('Sprint', result.reply)], flags: EPHEMERAL })
		}
		return
	}

	if (!interaction.isModalSubmit()) return
	if (!interaction.deferred && !interaction.replied) {
		await interaction.deferReply({ flags: EPHEMERAL })
	}
	if (customId === 'sp:join:m') {
		const startPage = parseOptionalPage(interaction.fields.getTextInputValue('start_page'), 0)
		if (startPage == null) {
			await reply(interaction, 'Starting page needs to be a whole number.')
			return
		}
		const result = await joinSprint({
			channelId,
			userId: interaction.user.id,
			username: name,
			bookTitle: interaction.fields.getTextInputValue('book'),
			startPage,
		})
		await reply(interaction, result.reply)
		return
	}
	if (customId === 'sp:page:m') {
		const page = parseOptionalPage(interaction.fields.getTextInputValue('page'), -1)
		if (page == null || page < 0) {
			await reply(interaction, 'Enter a page number.')
			return
		}
		const result = await updateSprintPage({
			channelId,
			userId: interaction.user.id,
			username: name,
			page,
		})
		await reply(interaction, result.reply)
		return
	}
	if (customId === 'sp:leave:m') {
		const page = parseOptionalPage(interaction.fields.getTextInputValue('page'), -1)
		if (page == null || page < 0) {
			await reply(interaction, 'Enter a page number.')
			return
		}
		const result = await leaveSprint({
			channelId,
			userId: interaction.user.id,
			username: name,
			page,
		})
		await reply(interaction, result.reply)
		return
	}
	if (customId === 'sp:switch:m') {
		const startPage = parseOptionalPage(interaction.fields.getTextInputValue('start_page'), 0)
		if (startPage == null) {
			await reply(interaction, 'Starting page needs to be a whole number.')
			return
		}
		const result = await switchSprintBook({
			channelId,
			userId: interaction.user.id,
			username: name,
			bookTitle: interaction.fields.getTextInputValue('book'),
			startPage,
		})
		await reply(interaction, result.reply)
	}
}
