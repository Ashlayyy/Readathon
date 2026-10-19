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
	pauseSprint,
	resumeSprint,
	switchSprintBook,
	updateSprintPage,
} from './sprint.js'
import { card, EPHEMERAL, readerUrl, siteUrl } from './embeds.js'
import { renderProfileCardPng } from './profileCard.js'
import { getConfig } from '../services/prompts.js'

type MemberInteraction = ChatInputCommandInteraction | ButtonInteraction | ModalSubmitInteraction

const HELP = [
	'`/sprint` — start a reading sprint in this channel',
	'`/join` — join the sprint that is already there',
	'On the sprint message: Update Progress, Pause, Resume, Switch book',
	'`/register` — email and team, then a link to the website',
	'`/profile` — pages, time, and your team',
	'`/searchbook` `/library` `/review` `/recommend`',
	'`/avatar` `/background` `/color` `/nametag` `/settings`',
	'`/guide` `/links`',
	'Admins use `/bookbaddies`.',
].join('\n')

const GUIDE = [
	'1. Run `/sprint` and say how many minutes.',
	'2. Other people run `/join`, or press **Join Sprint**.',
	'3. Press **Update Progress** when you turn pages.',
	'4. **Pause** stops the clock. **Resume** starts it again. **Switch book** keeps the pages you already read.',
	'5. When time is up, you have 5 minutes to set your last page. Those pages land on `/profile`.',
].join('\n')

function displayName(user: { globalName?: string | null; username: string }): string {
	return user.globalName || user.username
}

async function reply(interaction: MemberInteraction, content: string, title = 'Book Baddies'): Promise<void> {
	const payload = { embeds: [card(title, content)], flags: EPHEMERAL }
	if (interaction.deferred || interaction.replied) {
		await interaction.followUp(payload)
		return
	}
	await interaction.reply(payload)
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

function sprintModal(customId: string, title: string, fields: TextInputBuilder[]) {
	const modal = new ModalBuilder().setCustomId(customId).setTitle(title)
	for (const field of fields) {
		modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(field))
	}
	return modal
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
		siteUserId?: string | null
		library?: Iterable<{ author?: string | null }> | null
	},
	fallbackAvatar: string,
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
	})
	const link = member.siteUserId ? readerUrl(member.siteUserId) : siteUrl()
	const files = [new AttachmentBuilder(png, { name: 'profile.png' })]
	const components = [
		new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setCustomId('pf:edit').setLabel('Edit').setStyle(ButtonStyle.Success),
			new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(link).setLabel('Open the website'),
		),
	]
	if (interaction.deferred || interaction.replied) {
		await interaction.editReply({ files, components })
		return
	}
	await interaction.reply({ files, components })
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
	.addIntegerOption((option) =>
		option
			.setName('minutes')
			.setDescription('How long the sprint lasts')
			.setRequired(true)
			.setMinValue(5)
			.setMaxValue(1440),
	)
	.addIntegerOption((option) =>
		option
			.setName('in_minutes')
			.setDescription('Start later. Leave empty to start now')
			.setMinValue(1)
			.setMaxValue(10080),
	)
	.addStringOption((option) =>
		option.setName('book').setDescription('The book you are starting with').setMaxLength(200),
	)
	.addIntegerOption((option) =>
		option
			.setName('start_page')
			.setDescription('The page you are on now')
			.setMinValue(0)
			.setMaxValue(1_000_000),
	)
	.addStringOption((option) =>
		option.setName('goal').setDescription('Optional goal, shown on the sprint').setMaxLength(200),
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
	await interaction.deferReply({ flags: EPHEMERAL })
	const result = await beginSprint({
		guildId: interaction.guildId!,
		channelId,
		hostId: interaction.user.id,
		hostName: displayName(interaction.user),
		durationMinutes: interaction.options.getInteger('minutes', true),
		bookTitle: interaction.options.getString('book') ?? '',
		startPage: interaction.options.getInteger('start_page') ?? 0,
		goal: interaction.options.getString('goal'),
		inMinutes: interaction.options.getInteger('in_minutes') ?? 0,
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
		await interaction.deferReply()
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
		await interaction.deferReply()
		await replyWithCard(interaction, result.member, discordAvatar(interaction.user))
		return
	}
	if (name === 'profile') {
		await interaction.deferReply()
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
			await interaction.deferReply()
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
		await interaction.deferReply()
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
		await interaction.deferReply()
		await replyWithCard(interaction, member, discordAvatar(interaction.user))
		return
	}

	if (name === 'nametag') {
		if (interaction.options.getBoolean('clear')) {
			member.nametag = null
			await member.save()
			await interaction.deferReply()
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
		await interaction.deferReply()
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
	if (interaction.isButton() && interaction.customId === 'pf:edit') {
		const member = await requireMember(interaction)
		if (!member) return
		await interaction.showModal(
			sprintModal('pf:edit:m', 'Edit your profile', [
				shortInput('nametag', 'Display name', false).setValue(member.nametag ?? ''),
				shortInput('genres', 'Preferred genres', false).setValue(member.genres ?? ''),
				shortInput('authors', 'Favorite authors', false).setValue(member.authors ?? ''),
				new TextInputBuilder()
					.setCustomId('bio')
					.setLabel('Bio')
					.setStyle(TextInputStyle.Paragraph)
					.setRequired(false)
					.setMaxLength(300)
					.setValue(member.bio ?? ''),
			]),
		)
		return
	}
	if (interaction.isModalSubmit() && interaction.customId === 'pf:edit:m') {
		const member = await requireMember(interaction)
		if (!member) return
		const nametag = interaction.fields.getTextInputValue('nametag').trim()
		const genres = interaction.fields.getTextInputValue('genres').trim()
		const authors = interaction.fields.getTextInputValue('authors').trim()
		const bio = interaction.fields.getTextInputValue('bio').trim()
		member.nametag = nametag.slice(0, 32) || null
		member.genres = genres.slice(0, 200) || null
		member.authors = authors.slice(0, 200) || null
		member.bio = bio.slice(0, 300) || null
		await member.save()
		await interaction.deferReply()
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
	const member = await requireMember(interaction)
	if (!member) return
	const name = displayName(interaction.user)
	const channelId = interaction.channelId

	if (interaction.isButton() && customId === 'sp:join') {
		await interaction.showModal(
			sprintModal('sp:join:m', 'Join the sprint', [
				shortInput('book', 'Book', false),
				shortInput('start_page', 'Starting page', false),
			]),
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
	if (interaction.isButton() && customId === 'sp:pause') {
		const result = await pauseSprint({ channelId, userId: interaction.user.id, username: name })
		await reply(interaction, result.reply)
		return
	}
	if (interaction.isButton() && customId === 'sp:resume') {
		const result = await resumeSprint({ channelId, userId: interaction.user.id, username: name })
		await reply(interaction, result.reply)
		return
	}
	if (interaction.isButton() && customId === 'sp:end') {
		const result = await endChannelSprint(channelId, interaction.user.id)
		await reply(interaction, result.reply)
		return
	}

	if (!interaction.isModalSubmit()) return
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
