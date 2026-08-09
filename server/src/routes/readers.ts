import { Hono } from 'hono'
import { User } from '../db/models/User.js'
import { Submission } from '../db/models/Submission.js'
import { Question } from '../db/models/Question.js'
import { withActive } from '../db/activeSubmission.js'
import { getTeamById } from '../services/prompts.js'
import { computeAchievements } from '../services/achievements.js'
import { buildPaceSeries, paceSparklinePath } from '../services/pace.js'
import { lookupBookCover, lookupBookCoverCandidates } from '../services/covers.js'
import { getSessionUser, effectiveAvatarUrl } from '../services/auth.js'
import { buildProfileDashboard } from '../services/profileDashboard.js'

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
	/** Present only when the viewer is this reader (private scoring). */
	promptPoints?: number
	pageBonus?: number
	bonusPoints?: number
	totalImpact?: number
	targetTeamId?: string | null
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

/**
 * Fill missing covers in the background and persist so the next visit is instant.
 * Never awaited on the request path — Open Library latency was blocking profile loads.
 */
function scheduleCoverBackfill(opts: {
	userId: string
	currentlyReading: {
		title: string
		author: string
		coverUrl: string | null
	} | null
	books: PublicReaderBook[]
}): void {
	void (async () => {
		try {
			const cr = opts.currentlyReading
			if (cr && !cr.coverUrl) {
				const cover = await lookupBookCover(cr.title, cr.author || undefined)
				if (cover?.coverUrl) {
					await User.updateOne(
						{ _id: opts.userId },
						{ $set: { currentlyReadingCoverUrl: cover.coverUrl } },
					)
				}
			}

			const missing = opts.books
				.filter((b) => b.status === 'finished' && !b.coverUrl)
				.slice(0, 6)
			for (const book of missing) {
				const cover = await lookupBookCover(book.bookTitle, book.bookAuthor)
				if (!cover?.coverUrl) continue
				await Submission.updateOne(
					{ _id: book.id },
					{ $set: { coverUrl: cover.coverUrl } },
				)
			}
		} catch (e) {
			console.error('[readers] cover backfill failed (ignored):', e)
		}
	})()
}

readerRoutes.get('/:id', async (c) => {
	const id = c.req.param('id')
	const viewer = await getSessionUser(c)
	const isAdmin = viewer?.isAdmin === true
	const isOwn = Boolean(viewer && viewer._id.toString() === id)

	const user = await User.findById(id)
	if (!user) return c.json({ error: 'Reader not found' }, 404)

	// Public: assigned readers only. Own profile + admins can open pending too.
	if (user.status !== 'assigned' && !isAdmin && !isOwn) {
		return c.json({ error: 'Reader not found' }, 404)
	}

	const [subs, questions] = await Promise.all([
		Submission.find(withActive({ userId: user._id })).sort({ createdAt: -1 }),
		isOwn
			? Question.find({ userId: user._id }).sort({ createdAt: -1 })
			: Promise.resolve([]),
	])

	const books: PublicReaderBook[] = subs.map((sub) => {
		const inProgress = Boolean(sub.startedAt?.trim()) && !sub.finishedAt?.trim()
		const base: PublicReaderBook = {
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
		if (isOwn) {
			base.promptPoints = sub.promptPoints
			base.pageBonus = sub.pageBonus
			base.bonusPoints = sub.bonusPoints
			base.totalImpact = sub.totalImpact
			base.targetTeamId = sub.targetTeamId ?? null
		}
		return base
	})

	const currentlyReading =
		user.currentlyReadingTitle?.trim()
			? {
					title: user.currentlyReadingTitle.trim(),
					author: user.currentlyReadingAuthor?.trim() || '',
					coverUrl: user.currentlyReadingCoverUrl?.trim() || null,
					updatedAt: user.currentlyReadingUpdatedAt?.toISOString() ?? null,
				}
			: null

	const needsBackfill =
		(currentlyReading && !currentlyReading.coverUrl) ||
		books.some((b) => b.status === 'finished' && !b.coverUrl)
	if (needsBackfill) {
		scheduleCoverBackfill({
			userId: user._id.toString(),
			currentlyReading,
			books,
		})
	}

	const pace = buildPaceSeries(subs)
	const sparklinePath = paceSparklinePath(pace)
	const team = user.teamId ? getTeamById(user.teamId) : null

	const me = isOwn
		? {
				notifyStandings: user.notifyStandings ?? false,
				notifyAnswers: user.notifyAnswers ?? false,
				dashboard: await buildProfileDashboard(user, subs),
				questions: questions.map((q) => ({
					id: q._id.toString(),
					message: q.message,
					status: q.status,
					answer: q.answer,
					answeredAt: q.answeredAt,
					answeredByName: q.answeredByName,
					answerSeen: q.answerSeen,
					createdAt: q.createdAt,
				})),
			}
		: null

	return c.json({
		reader: {
			id: user._id.toString(),
			displayName: user.displayName,
			teamId: user.teamId,
			teamName: team?.name ?? null,
			teamColor: team?.color ?? null,
			teamIcon: team?.icon ?? null,
			status: user.status,
			avatarUrl: effectiveAvatarUrl(user),
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
		me,
	})
})
