import { randomUUID } from 'node:crypto'
import { DiscordMember } from '../db/models/DiscordMember.js'
import { User } from '../db/models/User.js'
import { formatProfile, type ProfileInput } from './profileText.js'
import type { BookHit } from './books.js'

export type LibraryStatus = 'want' | 'reading' | 'finished'

type LibraryBook = {
	bookId: string
	title: string
	author: string
	coverUrl: string | null
	status: LibraryStatus
	page: number
	rating: number | null
	review: string | null
}

const LIBRARY_LIMIT = 100

function sameTitle(left: string, right: string): boolean {
	return left.trim().toLowerCase() === right.trim().toLowerCase()
}

export async function registerDiscordMember(
	userId: string,
	username: string,
	details: { email: string; teamId: string; teamName: string },
) {
	const email = details.email.trim().toLowerCase()
	const siteUser = await User.findOne({ email }).select('_id').lean()
	const patch = {
		username,
		email,
		teamId: details.teamId,
		teamName: details.teamName,
		siteUserId: siteUser?._id?.toString() ?? null,
	}
	const existing = await DiscordMember.findOne({ discordUserId: userId })
	if (existing) {
		existing.set(patch)
		await existing.save()
		return { created: false, member: existing }
	}
	const member = await DiscordMember.create({ discordUserId: userId, ...patch })
	return { created: true, member }
}

export async function findDiscordMember(userId: string) {
	return DiscordMember.findOne({ discordUserId: userId })
}

export async function bumpSprintsJoined(userId: string): Promise<void> {
	await DiscordMember.updateOne(
		{ discordUserId: userId },
		{ $inc: { sprintsJoined: 1 } },
	)
}

export async function creditSprintFinish(input: {
	userId: string
	pages: number
	minutes: number
	book: string
}): Promise<void> {
	await DiscordMember.updateOne(
		{ discordUserId: input.userId },
		{
			$inc: {
				totalPages: input.pages,
				totalMinutes: input.minutes,
				sprintsCompleted: 1,
			},
			$set: {
				lastSprintPages: input.pages,
				lastSprintMinutes: input.minutes,
				lastSprintBook: input.book || null,
			},
		},
	)
}

export function profileInput(
	member: {
		username: string
		nametag?: string | null
		totalPages?: number | null
		totalMinutes?: number | null
		sprintsJoined?: number | null
		sprintsCompleted?: number | null
		lastSprintPages?: number | null
		lastSprintMinutes?: number | null
		lastSprintBook?: string | null
		library?: unknown[] | null
		email?: string | null
		teamName?: string | null
	},
	live: string | null,
	site: string | null,
): ProfileInput {
	return {
		username: member.username,
		nametag: member.nametag ?? null,
		totalPages: member.totalPages ?? 0,
		totalMinutes: member.totalMinutes ?? 0,
		sprintsJoined: member.sprintsJoined ?? 0,
		sprintsCompleted: member.sprintsCompleted ?? 0,
		lastSprintPages: member.lastSprintPages ?? null,
		lastSprintMinutes: member.lastSprintMinutes ?? null,
		lastSprintBook: member.lastSprintBook ?? null,
		libraryCount: member.library?.length ?? 0,
		live,
		email: member.email ?? null,
		teamName: member.teamName ?? null,
		site,
	}
}

export function profileMessage(
	member: Parameters<typeof profileInput>[0],
	live: string | null,
	site: string | null,
): string {
	return formatProfile(profileInput(member, live, site))
}

export function libraryBooks(member: {
	library?: Iterable<{
		bookId?: string
		title: string
		author?: string | null
		coverUrl?: string | null
		status?: string | null
		page?: number | null
		rating?: number | null
		review?: string | null
	}> | null
}): LibraryBook[] {
	return [...(member.library ?? [])].map((book) => ({
		bookId: book.bookId || '',
		title: book.title,
		author: book.author ?? '',
		coverUrl: book.coverUrl ?? null,
		status: book.status === 'reading' || book.status === 'finished' ? book.status : 'want',
		page: book.page ?? 0,
		rating: book.rating ?? null,
		review: book.review ?? null,
	}))
}

export function formatLibrary(books: LibraryBook[]): string {
	if (books.length === 0) return 'Your library is empty. Add a book with `/library add` or `/searchbook`.'
	const groups: Array<[string, LibraryStatus]> = [
		['Reading', 'reading'],
		['Want to read', 'want'],
		['Finished', 'finished'],
	]
	const lines: string[] = []
	for (const [label, status] of groups) {
		const rows = books.filter((book) => book.status === status)
		if (rows.length === 0) continue
		lines.push(`**${label}**`)
		for (const book of rows.slice(0, 8)) {
			const author = book.author ? ` — ${book.author}` : ''
			const page = book.page ? ` · p. ${book.page}` : ''
			const stars = book.rating ? ` · ${book.rating}/5` : ''
			lines.push(`- ${book.title}${author}${page}${stars}`)
		}
		if (rows.length > 8) lines.push(`+ ${rows.length - 8} more`)
	}
	return lines.join('\n').slice(0, 1900)
}

export async function addLibraryBook(
	userId: string,
	input: { title: string; author?: string; coverUrl?: string | null; status?: LibraryStatus },
): Promise<{ ok: true; title: string } | { ok: false; error: string }> {
	const title = input.title.trim()
	if (!title) return { ok: false, error: 'A title is required.' }
	const member = await DiscordMember.findOne({ discordUserId: userId })
	if (!member) return { ok: false, error: 'Use `/register` first.' }
	const books = libraryBooks(member)
	if (books.some((book) => sameTitle(book.title, title))) {
		return { ok: false, error: `**${title}** is already in your library.` }
	}
	if (books.length >= LIBRARY_LIMIT) {
		return { ok: false, error: `Your library is full (${LIBRARY_LIMIT} books). Drop one first.` }
	}
	books.push({
		bookId: randomUUID(),
		title,
		author: input.author?.trim() || '',
		coverUrl: input.coverUrl ?? null,
		status: input.status ?? 'want',
		page: 0,
		rating: null,
		review: null,
	})
	member.set('library', books)
	member.markModified('library')
	await member.save()
	return { ok: true, title }
}

export async function addHitToLibrary(userId: string, hit: BookHit) {
	return addLibraryBook(userId, {
		title: hit.title,
		author: hit.author,
		coverUrl: hit.coverUrl,
		status: 'want',
	})
}

export async function updateLibraryBook(
	userId: string,
	title: string,
	patch: Partial<Pick<LibraryBook, 'status' | 'page' | 'rating' | 'review' | 'author'>>,
): Promise<{ ok: true; title: string } | { ok: false; error: string }> {
	const member = await DiscordMember.findOne({ discordUserId: userId })
	if (!member) return { ok: false, error: 'Use `/register` first.' }
	const books = libraryBooks(member)
	const book = books.find((row) => sameTitle(row.title, title))
	if (!book) return { ok: false, error: `I couldn't find **${title.trim()}** in your library.` }
	if (patch.status) book.status = patch.status
	if (patch.page != null) book.page = patch.page
	if (patch.rating != null) book.rating = patch.rating
	if (patch.review !== undefined) book.review = patch.review
	if (patch.author) book.author = patch.author
	member.set('library', books)
	member.markModified('library')
	await member.save()
	return { ok: true, title: book.title }
}

export async function dropLibraryBook(
	userId: string,
	title: string,
): Promise<{ ok: true; title: string } | { ok: false; error: string }> {
	const member = await DiscordMember.findOne({ discordUserId: userId })
	if (!member) return { ok: false, error: 'Use `/register` first.' }
	const books = libraryBooks(member)
	const next = books.filter((book) => !sameTitle(book.title, title))
	if (next.length === books.length) {
		return { ok: false, error: `I couldn't find **${title.trim()}** in your library.` }
	}
	member.set('library', next)
	member.markModified('library')
	await member.save()
	return { ok: true, title: title.trim() }
}

export async function saveReview(
	userId: string,
	input: { title: string; author?: string; rating: number; review?: string },
): Promise<{ ok: true; title: string } | { ok: false; error: string }> {
	const existing = await updateLibraryBook(userId, input.title, {
		status: 'finished',
		rating: input.rating,
		review: input.review?.trim() || null,
		author: input.author,
	})
	if (existing.ok) return existing
	if (!existing.error.startsWith("I couldn't find")) return existing
	const added = await addLibraryBook(userId, {
		title: input.title,
		author: input.author,
		status: 'finished',
	})
	if (!added.ok) return added
	return updateLibraryBook(userId, input.title, {
		status: 'finished',
		rating: input.rating,
		review: input.review?.trim() || null,
	})
}
