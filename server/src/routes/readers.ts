import { Hono } from 'hono'
import { User } from '../db/models/User.js'
import { Submission } from '../db/models/Submission.js'
import { withActive } from '../db/activeSubmission.js'
import { getTeamById } from '../services/prompts.js'
import { computeAchievements } from '../services/achievements.js'
import { buildPaceSeries, paceSparklinePath } from '../services/pace.js'
import { lookupBookCover, lookupBookCoverCandidates } from '../services/covers.js'
import { getSessionUser } from '../services/auth.js'

export type PublicReaderBook = {
	id: string
	bookTitle: string
	bookAuthor: string
	pageCount: number
	format: string
	submissionType: 'add' | 'sabotage'
	startedAt: string | null
	finishedAt: string | null
	createdAt: string
	coverUrl: string | null
	/** finished = scored challenge log; in_progress = started but not finished */
	status: 'finished' | 'in_progress'
}

export const readerRoutes = new Hono()

readerRoutes.get('/lookup-cover', async (c) => {
	const title = c.req.query('title')?.trim() ?? ''
	const author = c.req.query('author')?.trim() ?? ''
	if (title.length < 2) {
		return c.json({ error: 'Title is required' }, 400)
	}
	const { best, candidates } = await lookupBookCoverCandidates(
		title,
		author || undefined,
		5,
	)
	return c.json({ cover: best, candidates })
})

readerRoutes.get('/:id', async (c) => {
	const id = c.req.param('id')
	const viewer = await getSessionUser(c)
	const isAdmin = viewer?.isAdmin === true

	const user = await User.findById(id)
	if (!user) return c.json({ error: 'Reader not found' }, 404)

	// Public: assigned readers only. Admins can open pending accounts too.
	if (user.status !== 'assigned' && !isAdmin) {
		return c.json({ error: 'Reader not found' }, 404)
	}

	const subs = await Submission.find(withActive({ userId: user._id })).sort({
		createdAt: -1,
	})

	const books: PublicReaderBook[] = subs.map((sub) => {
		const inProgress = Boolean(sub.startedAt?.trim()) && !sub.finishedAt?.trim()
		return {
			id: sub._id.toString(),
			bookTitle: sub.bookTitle,
			bookAuthor: sub.bookAuthor,
			pageCount: sub.pageCount,
			format: sub.format,
			submissionType: sub.submissionType as 'add' | 'sabotage',
			startedAt: sub.startedAt ?? null,
			finishedAt: sub.finishedAt ?? null,
			createdAt: sub.createdAt?.toISOString?.() ?? String(sub.createdAt),
			coverUrl: (sub as { coverUrl?: string | null }).coverUrl?.trim() || null,
			status: inProgress ? 'in_progress' : 'finished',
		}
	})

	// Best-effort cover for currently reading + first few finished books (cap lookups).
	const currentlyReading =
		user.currentlyReadingTitle?.trim()
			? {
					title: user.currentlyReadingTitle.trim(),
					author: user.currentlyReadingAuthor?.trim() || '',
					coverUrl: user.currentlyReadingCoverUrl?.trim() || null,
					updatedAt: user.currentlyReadingUpdatedAt?.toISOString() ?? null,
				}
			: null

	if (currentlyReading && !currentlyReading.coverUrl) {
		const cover = await lookupBookCover(
			currentlyReading.title,
			currentlyReading.author || undefined,
		)
		if (cover?.coverUrl) currentlyReading.coverUrl = cover.coverUrl
	}

	const toEnrich = books
		.filter((b) => b.status === 'finished' && !b.coverUrl)
		.slice(0, 6)
	await Promise.all(
		toEnrich.map(async (book) => {
			const cover = await lookupBookCover(book.bookTitle, book.bookAuthor)
			book.coverUrl = cover?.coverUrl ?? null
		}),
	)

	const pace = buildPaceSeries(subs)
	const sparklinePath = paceSparklinePath(pace)
	const team = user.teamId ? getTeamById(user.teamId) : null

	return c.json({
		reader: {
			id: user._id.toString(),
			displayName: user.displayName,
			teamId: user.teamId,
			teamName: team?.name ?? null,
			teamColor: team?.color ?? null,
			teamIcon: team?.icon ?? null,
			status: user.status,
			currentlyReading,
			achievements: computeAchievements(subs),
			pace: {
				points: pace,
				sparklinePath,
			},
			books,
			stats: {
				booksFinished: books.filter((b) => b.status === 'finished').length,
				booksInProgress: books.filter((b) => b.status === 'in_progress').length,
				totalPages: books
					.filter((b) => b.status === 'finished')
					.reduce((sum, b) => sum + b.pageCount, 0),
			},
		},
	})
})
