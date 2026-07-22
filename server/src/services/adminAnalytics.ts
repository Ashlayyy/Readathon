import { Question } from '../db/models/Question.js'
import { Submission } from '../db/models/Submission.js'
import { withActive } from '../db/activeSubmission.js'
import { User } from '../db/models/User.js'
import { getConfig } from './prompts.js'
import {
	endOfIsoWeek,
	getWeekBoundsFromKey,
	startOfIsoWeek,
	toDateInputValue,
} from '../utils/week.js'

export type AnalyticsNamedCount = {
	id: string
	label: string
	count: number
	extra?: number
}

export type AnalyticsReaderRow = {
	userId: string
	displayName: string
	teamId: string | null
	teamName: string
	books: number
	pages: number
	avgPages: number
	addCount: number
	sabotageCount: number
	damageDealt: number
	pointsGained: number
}

export type AnalyticsDogpileRow = {
	teamId: string
	teamName: string
	hitCount: number
	damageTaken: number
	booksLogged: number
	pagesLogged: number
	addCount: number
	sabotageCount: number
}

export type AnalyticsPromptRow = {
	promptId: string
	label: string
	kind: string
	count: number
}

export type AnalyticsSpeedRow = {
	userId: string
	displayName: string
	bookTitle: string
	pages: number
	days: number
}

export type AnalyticsBookRow = {
	id: string
	bookTitle: string
	bookAuthor: string
	pageCount: number
	format: string
	submissionType: string
	userId: string
	userName: string
	teamName: string
	createdAt: string
	totalImpact: number
}

export type AnalyticsRivalryRow = {
	fromTeamId: string
	fromTeamName: string
	toTeamId: string
	toTeamName: string
	hits: number
	damage: number
}

export type AnalyticsDayRow = {
	date: string
	count: number
	pages: number
	adds: number
	sabotages: number
}

export type AnalyticsAuthorRow = {
	author: string
	books: number
	pages: number
}

export type AdminAnalytics = {
	range: {
		from: string | null
		to: string | null
		preset: string
		label: string
	}
	overview: {
		totalUsers: number
		assigned: number
		pending: number
		submissions: number
		activeReaders: number
		unreadQuestions: number
		addCount: number
		sabotageCount: number
		competitionClaims: number
		competitionRate: number
		avgPages: number
		medianPages: number
		maxPages: number
		minPages: number
		totalPages: number
		chaosRatio: number
		avgBooksPerActiveReader: number
	}
	byType: AnalyticsNamedCount[]
	byFormat: AnalyticsNamedCount[]
	byPageTier: AnalyticsNamedCount[]
	byTeam: AnalyticsDogpileRow[]
	dogpile: AnalyticsDogpileRow[]
	warmongers: AnalyticsReaderRow[]
	pacifists: AnalyticsReaderRow[]
	booksPerReader: AnalyticsReaderRow[]
	prompts: AnalyticsPromptRow[]
	inbox: AnalyticsNamedCount[]
	speedDemons: AnalyticsSpeedRow[]
	longestBooks: AnalyticsBookRow[]
	recentBooks: AnalyticsBookRow[]
	authors: AnalyticsAuthorRow[]
	rivalry: AnalyticsRivalryRow[]
	byDay: AnalyticsDayRow[]
}

export type AnalyticsQuery = {
	from?: string | null
	to?: string | null
	preset?: string | null
	teamId?: string | null
}

const FORMAT_LABELS: Record<string, string> = {
	physical: 'Physical',
	ebook: 'Ebook',
	audiobook: 'Audiobook',
}

function daysBetween(start: string | null | undefined, end: string | null | undefined): number | null {
	if (!start || !end) return null
	const a = Date.parse(start)
	const b = Date.parse(end)
	if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null
	return Math.max(0, Math.round((b - a) / (1000 * 60 * 60 * 24)))
}

function parseDayStart(iso: string): Date {
	const d = new Date(`${iso}T00:00:00`)
	if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${iso}`)
	return d
}

function parseDayEndExclusive(iso: string): Date {
	const d = parseDayStart(iso)
	d.setDate(d.getDate() + 1)
	return d
}

function median(nums: number[]): number {
	if (nums.length === 0) return 0
	const s = [...nums].sort((a, b) => a - b)
	const mid = Math.floor(s.length / 2)
	return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2)
}

export function resolveAnalyticsRange(query: AnalyticsQuery = {}): {
	from: Date | null
	to: Date | null
	preset: string
	label: string
} {
	const preset = (query.preset ?? 'all').trim() || 'all'
	const now = new Date()

	if (preset === 'thisWeek') {
		const from = startOfIsoWeek(now)
		const to = endOfIsoWeek(now)
		return {
			from,
			to,
			preset,
			label: `This week (${toDateInputValue(from)} → ${toDateInputValue(new Date(to.getTime() - 1))})`,
		}
	}
	if (preset === 'lastWeek') {
		const thisMon = startOfIsoWeek(now)
		const from = new Date(thisMon)
		from.setDate(from.getDate() - 7)
		const to = thisMon
		return {
			from,
			to,
			preset,
			label: `Last week (${toDateInputValue(from)} → ${toDateInputValue(new Date(to.getTime() - 1))})`,
		}
	}
	if (preset === 'last7') {
		const to = new Date(now)
		to.setHours(23, 59, 59, 999)
		const from = new Date(now)
		from.setDate(from.getDate() - 6)
		from.setHours(0, 0, 0, 0)
		const endEx = new Date(from)
		endEx.setDate(endEx.getDate() + 7)
		return {
			from,
			to: endEx,
			preset,
			label: 'Last 7 days',
		}
	}
	if (preset === 'last30') {
		const from = new Date(now)
		from.setDate(from.getDate() - 29)
		from.setHours(0, 0, 0, 0)
		const to = new Date(now)
		to.setDate(to.getDate() + 1)
		to.setHours(0, 0, 0, 0)
		return { from, to, preset, label: 'Last 30 days' }
	}

	if (query.from || query.to) {
		const from = query.from ? parseDayStart(query.from) : null
		const to = query.to ? parseDayEndExclusive(query.to) : null
		const labelFrom = query.from ?? '…'
		const labelTo = query.to ?? '…'
		return {
			from,
			to,
			preset: 'custom',
			label: `Custom (${labelFrom} → ${labelTo})`,
		}
	}

	return { from: null, to: null, preset: 'all', label: 'All time' }
}

export async function buildAdminAnalytics(
	query: AnalyticsQuery = {},
): Promise<AdminAnalytics> {
	const config = getConfig()
	const range = resolveAnalyticsRange(query)
	const teamFilter = query.teamId?.trim() || null

	const teamName = (id: string | null | undefined) =>
		config.teams.find((t) => t.id === id)?.name ?? (id ? 'Unknown realm' : 'Unassigned')

	const promptMeta = new Map<string, { label: string; kind: string }>()
	for (const p of config.prompts.positive) {
		promptMeta.set(p.id, { label: p.label, kind: 'add' })
	}
	for (const p of config.prompts.negative) {
		promptMeta.set(p.id, { label: p.label, kind: 'sabotage' })
	}
	for (const team of config.teams) {
		for (const p of team.bonusPrompts ?? []) {
			promptMeta.set(p.id, { label: p.label, kind: `${team.name} bonus` })
		}
	}

	const subFilter: Record<string, unknown> = {}
	if (range.from || range.to) {
		const createdAt: Record<string, Date> = {}
		if (range.from) createdAt.$gte = range.from
		if (range.to) createdAt.$lt = range.to
		subFilter.createdAt = createdAt
	}

	const [users, submissions, questionGroups] = await Promise.all([
		User.find().select('displayName teamId status').lean(),
		Submission.find(withActive(subFilter)).sort({ createdAt: -1 }).lean(),
		Question.aggregate<{ _id: string; count: number }>([
			{ $group: { _id: '$status', count: { $sum: 1 } } },
		]),
	])

	const userById = new Map(users.map((u) => [u._id.toString(), u]))

	const filtered = submissions.filter((sub) => {
		if (!teamFilter) return true
		const user = userById.get(sub.userId.toString())
		return user?.teamId === teamFilter || sub.targetTeamId === teamFilter
	})

	let addCount = 0
	let sabotageCount = 0
	let competitionClaims = 0
	let totalPages = 0
	const pageCounts: number[] = []

	const formatCounts = new Map<string, { count: number; pages: number }>()
	const tierCounts = new Map<string, number>()
	const teamStats = new Map<
		string,
		{
			hitCount: number
			damageTaken: number
			booksLogged: number
			pagesLogged: number
			addCount: number
			sabotageCount: number
		}
	>()
	for (const t of config.teams) {
		teamStats.set(t.id, {
			hitCount: 0,
			damageTaken: 0,
			booksLogged: 0,
			pagesLogged: 0,
			addCount: 0,
			sabotageCount: 0,
		})
	}

	const promptCounts = new Map<string, number>()
	const authorCounts = new Map<string, { books: number; pages: number }>()
	const rivalry = new Map<string, { hits: number; damage: number }>()
	const byDay = new Map<string, AnalyticsDayRow>()

	type ReaderAgg = {
		books: number
		pages: number
		addCount: number
		sabotageCount: number
		damageDealt: number
		pointsGained: number
	}
	const readers = new Map<string, ReaderAgg>()
	const speedDemons: AnalyticsSpeedRow[] = []
	const bookRows: AnalyticsBookRow[] = []

	for (const tier of config.pageCountBonuses) {
		const label =
			tier.max == null
				? `${tier.min}+ pages (${tier.points} pts)`
				: `${tier.min}–${tier.max} pages (${tier.points} pts)`
		tierCounts.set(label, 0)
	}

	function pageTierLabel(pages: number): string {
		for (const tier of config.pageCountBonuses) {
			const max = tier.max ?? Infinity
			if (pages >= tier.min && pages <= max) {
				return tier.max == null
					? `${tier.min}+ pages (${tier.points} pts)`
					: `${tier.min}–${tier.max} pages (${tier.points} pts)`
			}
		}
		return 'Other'
	}

	for (const sub of filtered) {
		const uid = sub.userId.toString()
		const user = userById.get(uid)
		const userTeamId = user?.teamId ?? null
		totalPages += sub.pageCount
		pageCounts.push(sub.pageCount)
		if (sub.submissionType === 'add') addCount++
		else sabotageCount++
		if (sub.bonusCompetition) competitionClaims++

		const created =
			sub.createdAt instanceof Date
				? sub.createdAt
				: new Date(String(sub.createdAt ?? Date.now()))
		const dayKey = toDateInputValue(created)
		const day = byDay.get(dayKey) ?? {
			date: dayKey,
			count: 0,
			pages: 0,
			adds: 0,
			sabotages: 0,
		}
		day.count++
		day.pages += sub.pageCount
		if (sub.submissionType === 'add') day.adds++
		else day.sabotages++
		byDay.set(dayKey, day)

		const fmt = formatCounts.get(sub.format) ?? { count: 0, pages: 0 }
		fmt.count++
		fmt.pages += sub.pageCount
		formatCounts.set(sub.format, fmt)

		const tierLabel = pageTierLabel(sub.pageCount)
		tierCounts.set(tierLabel, (tierCounts.get(tierLabel) ?? 0) + 1)

		const author = (sub.bookAuthor || 'Unknown').trim()
		const auth = authorCounts.get(author) ?? { books: 0, pages: 0 }
		auth.books++
		auth.pages += sub.pageCount
		authorCounts.set(author, auth)

		if (userTeamId && teamStats.has(userTeamId)) {
			const ts = teamStats.get(userTeamId)!
			ts.booksLogged++
			ts.pagesLogged += sub.pageCount
			if (sub.submissionType === 'add') ts.addCount++
			else ts.sabotageCount++
		}

		const reader = readers.get(uid) ?? {
			books: 0,
			pages: 0,
			addCount: 0,
			sabotageCount: 0,
			damageDealt: 0,
			pointsGained: 0,
		}
		reader.books++
		reader.pages += sub.pageCount
		if (sub.submissionType === 'add') {
			reader.addCount++
			reader.pointsGained += sub.totalImpact
		} else {
			reader.sabotageCount++
			const damage = Math.abs((sub.promptPoints ?? 0) + (sub.bonusPoints ?? 0))
			reader.damageDealt += damage
			reader.pointsGained += sub.pageBonus ?? 0
			if (sub.targetTeamId) {
				const hit = teamStats.get(sub.targetTeamId)
				if (hit) {
					hit.hitCount++
					hit.damageTaken += damage
				}
				if (userTeamId) {
					const rk = `${userTeamId}→${sub.targetTeamId}`
					const riv = rivalry.get(rk) ?? { hits: 0, damage: 0 }
					riv.hits++
					riv.damage += damage
					rivalry.set(rk, riv)
				}
			}
		}
		readers.set(uid, reader)

		for (const pid of sub.promptIds ?? []) {
			promptCounts.set(pid, (promptCounts.get(pid) ?? 0) + 1)
		}
		for (const pid of sub.bonusTeamPromptIds ?? []) {
			promptCounts.set(pid, (promptCounts.get(pid) ?? 0) + 1)
		}

		const days = daysBetween(sub.startedAt, sub.finishedAt)
		if (days != null && days <= 60) {
			speedDemons.push({
				userId: uid,
				displayName: user?.displayName ?? 'Unknown reader',
				bookTitle: sub.bookTitle,
				pages: sub.pageCount,
				days: Math.max(days, 0),
			})
		}

		bookRows.push({
			id: sub._id.toString(),
			bookTitle: sub.bookTitle,
			bookAuthor: sub.bookAuthor,
			pageCount: sub.pageCount,
			format: sub.format,
			submissionType: sub.submissionType,
			userId: sub.userId.toString(),
			userName: user?.displayName ?? 'Unknown reader',
			teamName: teamName(userTeamId),
			createdAt: created.toISOString(),
			totalImpact: sub.totalImpact,
		})
	}

	const totalSubs = filtered.length
	const activeReaders = readers.size
	const overview = {
		totalUsers: users.length,
		assigned: users.filter((u) => u.status === 'assigned').length,
		pending: users.filter((u) => u.status === 'pending').length,
		submissions: totalSubs,
		activeReaders,
		unreadQuestions: questionGroups.find((g) => g._id === 'unread')?.count ?? 0,
		addCount,
		sabotageCount,
		competitionClaims,
		competitionRate: totalSubs ? Math.round((competitionClaims / totalSubs) * 100) : 0,
		avgPages: totalSubs ? Math.round(totalPages / totalSubs) : 0,
		medianPages: median(pageCounts),
		maxPages: pageCounts.length ? Math.max(...pageCounts) : 0,
		minPages: pageCounts.length ? Math.min(...pageCounts) : 0,
		totalPages,
		chaosRatio: totalSubs ? Math.round((sabotageCount / totalSubs) * 100) : 0,
		avgBooksPerActiveReader: activeReaders
			? Math.round((totalSubs / activeReaders) * 10) / 10
			: 0,
	}

	const byType: AnalyticsNamedCount[] = [
		{ id: 'add', label: 'Add', count: addCount },
		{ id: 'sabotage', label: 'Sabotage', count: sabotageCount },
	]

	const byFormat: AnalyticsNamedCount[] = [...formatCounts.entries()]
		.map(([id, v]) => ({
			id,
			label: FORMAT_LABELS[id] ?? id,
			count: v.count,
			extra: v.pages,
		}))
		.sort((a, b) => b.count - a.count)

	const byPageTier: AnalyticsNamedCount[] = [...tierCounts.entries()].map(
		([label, count], i) => ({
			id: `tier-${i}`,
			label,
			count,
		}),
	)

	const byTeam: AnalyticsDogpileRow[] = config.teams.map((t) => {
		const s = teamStats.get(t.id)!
		return {
			teamId: t.id,
			teamName: t.name,
			hitCount: s.hitCount,
			damageTaken: s.damageTaken,
			booksLogged: s.booksLogged,
			pagesLogged: s.pagesLogged,
			addCount: s.addCount,
			sabotageCount: s.sabotageCount,
		}
	})

	const dogpileRows = [...byTeam].sort(
		(a, b) => b.damageTaken - a.damageTaken || b.hitCount - a.hitCount,
	)

	const readerRows: AnalyticsReaderRow[] = [...readers.entries()].map(([userId, r]) => {
		const user = userById.get(userId)
		return {
			userId,
			displayName: user?.displayName ?? 'Unknown reader',
			teamId: user?.teamId ?? null,
			teamName: teamName(user?.teamId),
			books: r.books,
			pages: r.pages,
			avgPages: r.books ? Math.round(r.pages / r.books) : 0,
			addCount: r.addCount,
			sabotageCount: r.sabotageCount,
			damageDealt: r.damageDealt,
			pointsGained: r.pointsGained,
		}
	})

	const warmongers = readerRows
		.filter((r) => r.sabotageCount > 0)
		.sort((a, b) => b.damageDealt - a.damageDealt || b.sabotageCount - a.sabotageCount)

	const pacifists = readerRows
		.filter((r) => r.addCount > 0 && r.sabotageCount === 0)
		.sort((a, b) => b.pointsGained - a.pointsGained || b.addCount - a.addCount)

	const booksPerReader = [...readerRows].sort((a, b) => b.books - a.books || b.pages - a.pages)

	const prompts: AnalyticsPromptRow[] = [...promptCounts.entries()]
		.map(([promptId, count]) => {
			const meta = promptMeta.get(promptId)
			return {
				promptId,
				label: meta?.label ?? promptId,
				kind: meta?.kind ?? 'other',
				count,
			}
		})
		.sort((a, b) => b.count - a.count)

	const inboxLabels: Record<string, string> = {
		unread: 'Unread',
		read: 'Read',
		answered: 'Answered',
	}
	const inbox: AnalyticsNamedCount[] = ['unread', 'read', 'answered'].map((id) => ({
		id,
		label: inboxLabels[id] ?? id,
		count: questionGroups.find((g) => g._id === id)?.count ?? 0,
	}))

	speedDemons.sort((a, b) => {
		const aRate = a.days === 0 ? a.pages : a.pages / a.days
		const bRate = b.days === 0 ? b.pages : b.pages / b.days
		return bRate - aRate
	})

	const longestBooks = [...bookRows]
		.sort((a, b) => b.pageCount - a.pageCount)
		.slice(0, 40)

	const recentBooks = bookRows.slice(0, 40)

	const authors: AnalyticsAuthorRow[] = [...authorCounts.entries()]
		.map(([author, v]) => ({ author, books: v.books, pages: v.pages }))
		.sort((a, b) => b.books - a.books || b.pages - a.pages)
		.slice(0, 40)

	const rivalryRows: AnalyticsRivalryRow[] = [...rivalry.entries()]
		.map(([key, v]) => {
			const [fromTeamId, toTeamId] = key.split('→')
			return {
				fromTeamId: fromTeamId!,
				fromTeamName: teamName(fromTeamId),
				toTeamId: toTeamId!,
				toTeamName: teamName(toTeamId),
				hits: v.hits,
				damage: v.damage,
			}
		})
		.sort((a, b) => b.damage - a.damage || b.hits - a.hits)

	const byDayRows = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date))

	return {
		range: {
			from: range.from ? toDateInputValue(range.from) : null,
			to: range.to ? toDateInputValue(new Date(range.to.getTime() - 1)) : null,
			preset: range.preset,
			label: range.label,
		},
		overview,
		byType,
		byFormat,
		byPageTier,
		byTeam,
		dogpile: dogpileRows,
		warmongers,
		pacifists,
		booksPerReader,
		prompts,
		inbox,
		speedDemons: speedDemons.slice(0, 50),
		longestBooks,
		recentBooks,
		authors,
		rivalry: rivalryRows,
		byDay: byDayRows,
	}
}

/** Public-safe slice stored on publish (week-scoped). */
export type PublicStandingsVibes = {
	weekKey: string
	weekLabel: string
	rangeLabel: string
	overview: Pick<
		AdminAnalytics['overview'],
		| 'submissions'
		| 'activeReaders'
		| 'addCount'
		| 'sabotageCount'
		| 'chaosRatio'
		| 'competitionRate'
		| 'avgPages'
		| 'totalPages'
	>
	byType: AnalyticsNamedCount[]
	byFormat: AnalyticsNamedCount[]
	byPageTier: AnalyticsNamedCount[]
	dogpile: AnalyticsDogpileRow[]
	byTeam: AnalyticsDogpileRow[]
}

export async function buildPublicStandingsVibes(opts: {
	weekKey: string
	weekLabel: string
	/** Inclusive range start (defaults to ISO week of weekKey). */
	from?: Date
	/** Exclusive upper bound (defaults to week end or opts.to legacy). */
	toExclusive?: Date
	/** @deprecated Prefer toExclusive. Exclusive upper bound, usually publish time or week end */
	to?: Date
}): Promise<PublicStandingsVibes> {
	const bounds = getWeekBoundsFromKey(opts.weekKey)
	const from = opts.from ?? bounds.from
	const to =
		opts.toExclusive ??
		(opts.to && opts.to < bounds.to ? opts.to : bounds.to)
	const full = await buildAdminAnalytics({
		from: toDateInputValue(from),
		to: toDateInputValue(new Date(to.getTime() - 1)),
		preset: 'custom',
	})
	return {
		weekKey: opts.weekKey,
		weekLabel: opts.weekLabel,
		rangeLabel: full.range.label,
		overview: {
			submissions: full.overview.submissions,
			activeReaders: full.overview.activeReaders,
			addCount: full.overview.addCount,
			sabotageCount: full.overview.sabotageCount,
			chaosRatio: full.overview.chaosRatio,
			competitionRate: full.overview.competitionRate,
			avgPages: full.overview.avgPages,
			totalPages: full.overview.totalPages,
		},
		byType: full.byType,
		byFormat: full.byFormat,
		byPageTier: full.byPageTier,
		dogpile: full.dogpile,
		byTeam: full.byTeam,
	}
}
