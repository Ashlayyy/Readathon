import { toDateInputValue } from '../utils/week.js'

/**
 * Daily realm points for the admin stats race.
 * Point math matches calculateStandings: adds credit prompt + bonus + page
 * points to the reader's realm; sabotages move |prompt + bonus| off the
 * target and credit only the page bonus to the attacker. Readers without a
 * realm are ignored, same as standings.
 */

export type TeamRaceTeamInput = {
	id: string
	name: string
	color: string
	icon: string
	memberCount: number
}

export type TeamRaceEvent = {
	createdAt: Date
	userTeamId: string | null
	submissionType: string
	targetTeamId: string | null
	promptPoints: number
	bonusPoints: number
	pageBonus: number
	pageCount: number
}

export type TeamRaceTeam = {
	teamId: string
	teamName: string
	color: string
	icon: string
	memberCount: number
	/** Books, pages, and sabotage totals inside the selected dates. */
	books: number
	pages: number
	windowDealt: number
	windowGained: number
	windowLost: number
	windowPoints: number
	seasonGained: number
	seasonLost: number
	seasonPoints: number
	/** Cumulative points aligned to `dates`. Window mode starts at 0 unless the range is all-time. */
	windowValues: number[]
	/** Cumulative season total, including starting points, aligned to `dates`. */
	seasonValues: number[]
}

export type TeamRace = {
	/**
	 * Calendar days, oldest first. The first day is the opening balance
	 * (the day before the selected range, or the day before the first book
	 * on all-time). Later days are end-of-day totals inside the range.
	 */
	dates: string[]
	startingXp: number
	rangeIsAllTime: boolean
	teams: TeamRaceTeam[]
}

type Bucket = {
	gained: number
	lost: number
	dealt: number
	books: number
	pages: number
}

function emptyBucket(): Bucket {
	return { gained: 0, lost: 0, dealt: 0, books: 0, pages: 0 }
}

function num(value: number): number {
	return Number.isFinite(value) ? value : 0
}

function dayKey(date: Date): string | null {
	if (Number.isNaN(date.getTime())) return null
	return toDateInputValue(date)
}

function addDays(iso: string, days: number): string {
	const date = new Date(`${iso}T12:00:00`)
	if (Number.isNaN(date.getTime())) return iso
	date.setDate(date.getDate() + days)
	return toDateInputValue(date)
}

function eachDay(start: string, end: string): string[] {
	if (end < start) return []
	const days: string[] = []
	let cursor = start
	for (let i = 0; i < 4000 && cursor <= end; i++) {
		days.push(cursor)
		const next = addDays(cursor, 1)
		if (next <= cursor) break
		cursor = next
	}
	return days
}

/** Keep long spans chartable while always including the first and last day. */
function plotDays(start: string, end: string): string[] {
	const all = eachDay(start, end)
	if (all.length <= 420) return all
	const step = Math.ceil(all.length / 400)
	const sampled: string[] = []
	for (let i = 0; i < all.length; i += step) sampled.push(all[i]!)
	const last = all[all.length - 1]!
	if (sampled[sampled.length - 1] !== last) sampled.push(last)
	return sampled
}

function pointsOf(bucket: Bucket, includeStart: boolean, startingXp: number): number {
	return bucket.gained - bucket.lost + (includeStart ? startingXp : 0)
}

function blankTeam(team: TeamRaceTeamInput, startingXp: number): TeamRaceTeam {
	return {
		teamId: team.id,
		teamName: team.name,
		color: team.color || '#888888',
		icon: team.icon || '◆',
		memberCount: team.memberCount,
		books: 0,
		pages: 0,
		windowDealt: 0,
		windowGained: 0,
		windowLost: 0,
		windowPoints: 0,
		seasonGained: 0,
		seasonLost: 0,
		seasonPoints: startingXp,
		windowValues: [],
		seasonValues: [],
	}
}

export function buildTeamRace(opts: {
	teams: TeamRaceTeamInput[]
	events: TeamRaceEvent[]
	rangeFrom: Date | null
	rangeTo: Date | null
	startingXp: number
	today?: Date
}): TeamRace {
	const startingXp = num(opts.startingXp)
	const rangeIsAllTime = opts.rangeFrom == null && opts.rangeTo == null
	const today = dayKey(opts.today ?? new Date()) ?? toDateInputValue(new Date())
	const teamIds = opts.teams.map((team) => team.id)
	const known = new Set(teamIds)
	const byDay = new Map<string, Map<string, Bucket>>()

	function bucketFor(day: string, teamId: string): Bucket {
		let dayMap = byDay.get(day)
		if (!dayMap) {
			dayMap = new Map()
			byDay.set(day, dayMap)
		}
		let bucket = dayMap.get(teamId)
		if (!bucket) {
			bucket = emptyBucket()
			dayMap.set(teamId, bucket)
		}
		return bucket
	}

	let earliest: string | null = null
	let latest: string | null = null

	for (const event of opts.events) {
		const day = dayKey(event.createdAt)
		const userTeamId = event.userTeamId?.trim() || null
		if (!day || !userTeamId || !known.has(userTeamId)) continue
		if (latest == null || day > latest) latest = day
		if (earliest == null || day < earliest) earliest = day

		const attacker = bucketFor(day, userTeamId)
		attacker.books += 1
		attacker.pages += num(event.pageCount)

		const promptAndBonus = num(event.promptPoints) + num(event.bonusPoints)
		const pageBonus = num(event.pageBonus)
		if (event.submissionType === 'add') {
			attacker.gained += promptAndBonus + pageBonus
		} else if (event.submissionType === 'sabotage' && event.targetTeamId) {
			const attack = Math.abs(promptAndBonus)
			attacker.dealt += attack
			attacker.gained += pageBonus
			if (known.has(event.targetTeamId)) {
				bucketFor(day, event.targetTeamId).lost += attack
			}
		}
	}

	const visibleStart = opts.rangeFrom ? (dayKey(opts.rangeFrom) ?? today) : (earliest ?? today)
	const visibleEnd = opts.rangeTo
		? (dayKey(new Date(opts.rangeTo.getTime() - 1)) ?? today)
		: latest && latest > today
			? latest
			: today

	if (visibleEnd < visibleStart) {
		return {
			dates: [],
			startingXp,
			rangeIsAllTime,
			teams: opts.teams.map((team) => blankTeam(team, startingXp)),
		}
	}

	const origin = addDays(visibleStart, -1)
	const plotted = plotDays(origin, visibleEnd)
	const plotSet = new Set(plotted)
	const walkStart = earliest && earliest < origin ? earliest : origin
	const season = new Map<string, Bucket>()
	const window = new Map<string, Bucket>()
	const seasonSeries = new Map<string, number[]>()
	const windowSeries = new Map<string, number[]>()
	for (const id of teamIds) {
		season.set(id, emptyBucket())
		window.set(id, emptyBucket())
		seasonSeries.set(id, [])
		windowSeries.set(id, [])
	}

	function apply(into: Map<string, Bucket>, day: string) {
		const dayMap = byDay.get(day)
		if (!dayMap) return
		for (const [teamId, delta] of dayMap) {
			const acc = into.get(teamId)
			if (!acc) continue
			acc.gained += delta.gained
			acc.lost += delta.lost
			acc.dealt += delta.dealt
			acc.books += delta.books
			acc.pages += delta.pages
		}
	}

	for (const day of eachDay(walkStart, visibleEnd)) {
		apply(season, day)
		if (day >= visibleStart && day <= visibleEnd) apply(window, day)
		if (!plotSet.has(day)) continue
		for (const id of teamIds) {
			seasonSeries.get(id)!.push(pointsOf(season.get(id)!, true, startingXp))
			windowSeries.get(id)!.push(pointsOf(window.get(id)!, rangeIsAllTime, startingXp))
		}
	}

	return {
		dates: plotted,
		startingXp,
		rangeIsAllTime,
		teams: opts.teams.map((team) => {
			const inWindow = window.get(team.id) ?? emptyBucket()
			const inSeason = season.get(team.id) ?? emptyBucket()
			return {
				teamId: team.id,
				teamName: team.name,
				color: team.color || '#888888',
				icon: team.icon || '◆',
				memberCount: team.memberCount,
				books: inWindow.books,
				pages: inWindow.pages,
				windowDealt: inWindow.dealt,
				windowGained: inWindow.gained,
				windowLost: inWindow.lost,
				windowPoints: pointsOf(inWindow, rangeIsAllTime, startingXp),
				seasonGained: inSeason.gained,
				seasonLost: inSeason.lost,
				seasonPoints: pointsOf(inSeason, true, startingXp),
				windowValues: windowSeries.get(team.id) ?? [],
				seasonValues: seasonSeries.get(team.id) ?? [],
			}
		}),
	}
}
