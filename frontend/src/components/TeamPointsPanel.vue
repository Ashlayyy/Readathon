<script setup lang="ts">
import { computed, ref, watch } from 'vue'

export type TeamRaceTeam = {
	teamId: string
	teamName: string
	color: string
	icon: string
	memberCount: number
	books: number
	pages: number
	windowDealt: number
	windowGained: number
	windowLost: number
	windowPoints: number
	seasonGained: number
	seasonLost: number
	seasonPoints: number
	windowValues: number[]
	seasonValues: number[]
}

export type TeamRace = {
	dates: string[]
	startingXp: number
	rangeIsAllTime: boolean
	teams: TeamRaceTeam[]
}

type Scope = 'window' | 'season'
type Lens = 'points' | 'share' | 'leader' | 'gap' | 'rank'
type SortKey =
	| 'teamName'
	| 'start'
	| 'gained'
	| 'lost'
	| 'points'
	| 'share'
	| 'leaderPct'
	| 'gap'
	| 'vsAvg'
	| 'perMember'
	| 'booksShare'
	| 'pagesShare'
	| 'dealtShare'
	| 'takenShare'
type SortDir = 'asc' | 'desc'

type ActiveTeam = {
	teamId: string
	teamName: string
	color: string
	icon: string
	memberCount: number
	books: number
	pages: number
	dealt: number
	taken: number
	points: number
	gained: number
	lost: number
	raw: number[]
}

type RaceRow = ActiveTeam & {
	start: number
	share: number
	leaderPct: number | null
	gap: number
	vsAvg: number
	perMember: number | null
	booksShare: number | null
	pagesShare: number | null
	dealtShare: number | null
	takenShare: number | null
}

const COLUMNS: { key: SortKey; label: string; numeric: boolean; title: string }[] = [
	{ key: 'teamName', label: 'Realm', numeric: false, title: 'Realm' },
	{ key: 'start', label: 'Start', numeric: true, title: 'Starting points included in this view' },
	{ key: 'gained', label: 'Gained', numeric: true, title: 'Points gained from adds and sabotage page bonuses' },
	{ key: 'lost', label: 'Lost', numeric: true, title: 'Points lost to sabotage' },
	{ key: 'points', label: 'Points', numeric: true, title: 'Start + gained − lost' },
	{ key: 'share', label: 'Share', numeric: true, title: 'Share of combined points' },
	{ key: 'leaderPct', label: 'Of leader', numeric: true, title: 'Percent of the leading realm' },
	{ key: 'gap', label: 'Gap', numeric: true, title: 'Points behind the leader' },
	{ key: 'vsAvg', label: 'Vs avg', numeric: true, title: 'Points compared with the field average' },
	{ key: 'perMember', label: '/ member', numeric: true, title: 'Points divided by the current roster' },
	{ key: 'booksShare', label: 'Books', numeric: true, title: 'Share of books logged in the selected dates' },
	{ key: 'pagesShare', label: 'Pages', numeric: true, title: 'Share of pages logged in the selected dates' },
	{ key: 'dealtShare', label: 'Dealt', numeric: true, title: 'Share of sabotage damage dealt in the selected dates' },
	{ key: 'takenShare', label: 'Taken', numeric: true, title: 'Share of sabotage damage taken in the selected dates' },
]

const LENSES: { id: Lens; label: string; title: string }[] = [
	{ id: 'points', label: 'Points', title: 'Cumulative points' },
	{ id: 'share', label: 'Share', title: 'Percent of every realm’s combined points' },
	{ id: 'leader', label: '% of leader', title: 'The leader stays at 100%' },
	{ id: 'gap', label: 'Gap', title: 'Points behind the leader' },
	{ id: 'rank', label: 'Rank', title: '1 is first place' },
]

const VB_W = 800
const VB_H = 300
const PAD = { top: 14, right: 14, bottom: 32, left: 52 }
const INNER_W = VB_W - PAD.left - PAD.right
const INNER_H = VB_H - PAD.top - PAD.bottom

const props = defineProps<{ race: TeamRace }>()

const scope = ref<Scope>('window')
const lens = ref<Lens>('points')
const hoverIndex = ref<number | null>(null)
const raceSvg = ref<SVGSVGElement | null>(null)
const isolatedId = ref<string | null>(null)
const legendHover = ref<string | null>(null)
const sortKey = ref<SortKey>('points')
const sortDir = ref<SortDir>('desc')

watch(
	() => props.race.dates.join('|'),
	() => {
		hoverIndex.value = null
	},
)

const pointBase = computed(() =>
	scope.value === 'season' || props.race.rangeIsAllTime ? props.race.startingXp : 0,
)

const activeTeams = computed<ActiveTeam[]>(() =>
	props.race.teams.map((team) => {
		const season = scope.value === 'season'
		return {
			teamId: team.teamId,
			teamName: team.teamName,
			color: team.color,
			icon: team.icon,
			memberCount: team.memberCount,
			books: team.books,
			pages: team.pages,
			dealt: team.windowDealt,
			taken: team.windowLost,
			points: season ? team.seasonPoints : team.windowPoints,
			gained: season ? team.seasonGained : team.windowGained,
			lost: season ? team.seasonLost : team.windowLost,
			raw: season ? team.seasonValues : team.windowValues,
		}
	}),
)

const lensSeries = computed(() => transformSeries(activeTeams.value.map((team) => team.raw), lens.value))

const rows = computed<RaceRow[]>(() => {
	const teams = activeTeams.value
	const totalPoints = teams.reduce((sum, team) => sum + team.points, 0)
	const average = teams.length ? totalPoints / teams.length : 0
	const leaderPoints = teams.length ? Math.max(...teams.map((team) => team.points)) : 0
	const totalBooks = teams.reduce((sum, team) => sum + team.books, 0)
	const totalPages = teams.reduce((sum, team) => sum + team.pages, 0)
	const totalDealt = teams.reduce((sum, team) => sum + team.dealt, 0)
	const totalTaken = teams.reduce((sum, team) => sum + team.taken, 0)
	const start = pointBase.value
	return teams.map((team) => ({
		...team,
		start,
		share: totalPoints === 0 ? 0 : (team.points / totalPoints) * 100,
		leaderPct:
			leaderPoints > 0
				? (team.points / leaderPoints) * 100
				: leaderPoints === 0 && team.points === 0
					? 100
					: null,
		gap: leaderPoints - team.points,
		vsAvg: team.points - average,
		perMember: team.memberCount > 0 ? team.points / team.memberCount : null,
		booksShare: totalBooks > 0 ? (team.books / totalBooks) * 100 : null,
		pagesShare: totalPages > 0 ? (team.pages / totalPages) * 100 : null,
		dealtShare: totalDealt > 0 ? (team.dealt / totalDealt) * 100 : null,
		takenShare: totalTaken > 0 ? (team.taken / totalTaken) * 100 : null,
	}))
})

const sortedRows = computed(() => [...rows.value].sort(compareRows))

const legend = computed(() =>
	activeTeams.value
		.map((team, index) => {
			const series = lensSeries.value[index] ?? []
			return {
				...team,
				end: series.length ? (series[series.length - 1] ?? 0) : 0,
			}
		})
		.sort((a, b) => b.points - a.points || a.teamName.localeCompare(b.teamName)),
)

const chart = computed(() => {
	const dates = props.race.dates
	const teams = activeTeams.value
	const series = lensSeries.value
	if (!dates.length || !teams.length) return null
	const count = dates.length
	const domain = domainFor(lens.value, series, teams.length)
	const focused = isolatedId.value ?? legendHover.value
	const paths = teams
		.map((team, index) => {
			const values = series[index] ?? []
			const opacity = focused && focused !== team.teamId ? 0.18 : 1
			const width = focused === team.teamId ? 3.6 : 2.4
			return {
				teamId: team.teamId,
				color: team.color,
				opacity,
				width,
				d: linePath(values, count, domain.min, domain.max),
			}
		})
		.sort((a, b) => Number(focused === a.teamId) - Number(focused === b.teamId))
	const markerIndex = hoverIndex.value
	const dots =
		markerIndex == null
			? []
			: teams.map((team, index) => ({
					teamId: team.teamId,
					color: team.color,
					opacity: focused && focused !== team.teamId ? 0.18 : 1,
					cx: xFor(markerIndex, count),
					cy: yFor((series[index] ?? [])[markerIndex] ?? 0, domain.min, domain.max),
				}))
	const ends = teams.map((team, index) => {
		const values = series[index] ?? []
		const last = values.length ? values.length - 1 : 0
		return {
			teamId: team.teamId,
			color: team.color,
			opacity: focused && focused !== team.teamId ? 0.18 : 1,
			cx: xFor(last, count),
			cy: yFor(values[last] ?? 0, domain.min, domain.max),
		}
	})
	const yTicks = domain.ticks.map((tick) => ({
		y: yFor(tick.value, domain.min, domain.max),
		text: tick.text,
	}))
	const labelIndexes = xLabelIndexes(count)
	const withYear = yearOf(dates[0] ?? '') !== yearOf(dates[count - 1] ?? '')
	const xLabels = labelIndexes.map((index) => ({
		x: xFor(index, count),
		text: formatDay(dates[index] ?? '', withYear && (index === 0 || index === count - 1)),
		anchor: count === 1 ? 'middle' : index === 0 ? 'start' : index === count - 1 ? 'end' : 'middle',
	}))
	return {
		paths,
		dots,
		ends: markerIndex === count - 1 ? [] : ends,
		yTicks,
		xLabels,
		hoverX: markerIndex == null ? null : xFor(markerIndex, count),
	}
})

const hoverRows = computed(() => {
	const index = hoverIndex.value
	if (index == null) return []
	const teams = activeTeams.value
	const raw = teams.map((team) => team.raw[index] ?? 0)
	const shown = lensSeries.value.map((series) => series[index] ?? 0)
	const rank = ranksFor(raw)
	return teams
		.map((team, teamIndex) => ({
			teamId: team.teamId,
			teamName: team.teamName,
			color: team.color,
			primary: formatLensValue(lens.value, shown[teamIndex] ?? 0),
			secondary: lens.value === 'points' ? '' : pointsLabel(raw[teamIndex] ?? 0),
			rank: rank[teamIndex] ?? teamIndex + 1,
		}))
		.sort((a, b) => a.rank - b.rank || a.teamName.localeCompare(b.teamName))
})

function viewBoxPoint(svg: SVGSVGElement, clientX: number, clientY: number) {
	const ctm = svg.getScreenCTM()
	if (!ctm) return null
	const point = svg.createSVGPoint()
	point.x = clientX
	point.y = clientY
	return point.matrixTransform(ctm.inverse())
}

function tipAnchor(index: number, count: number) {
	const svg = raceSvg.value
	const plot = svg?.parentElement
	if (!svg || !plot) return null
	const ctm = svg.getScreenCTM()
	if (!ctm) return null
	const point = svg.createSVGPoint()
	point.x = xFor(index, count)
	point.y = 0
	const screen = point.matrixTransform(ctm)
	const host = plot.getBoundingClientRect()
	return { left: screen.x - host.left, width: host.width }
}

const tipStyle = computed(() => {
	const index = hoverIndex.value
	const count = props.race.dates.length
	if (index == null || !count) return null
	const anchor = tipAnchor(index, count)
	const left = anchor ? anchor.left : (xFor(index, count) / VB_W) * (raceSvg.value?.clientWidth ?? 0)
	const width = anchor?.width ?? raceSvg.value?.clientWidth ?? 0
	const shift = width > 0 && left > width * 0.64 ? 'translateX(-108%)' : 'translateX(10px)'
	return { left: `${left}px`, transform: shift }
})

const hoverDateLabel = computed(() => {
	const index = hoverIndex.value
	if (index == null) return ''
	const date = formatDay(props.race.dates[index] ?? '')
	return index === 0 ? `${date} · opening` : date
})

const scopeNote = computed(() => {
	const start = props.race.startingXp
	if (props.race.rangeIsAllTime) {
		return start
			? `All time includes ${start} starting points per realm, so this window and the season total draw the same line.`
			: 'All time is the full season, so this window and the season total draw the same line.'
	}
	if (scope.value === 'window') {
		return 'Each line starts at 0 and adds points logged on the selected dates. The first point is the day before the window.'
	}
	const base = start ? ` Includes ${start} starting points.` : ''
	return `Each line is that realm’s season total on the selected dates.${base} The first point is the total entering the window.`
})

const tableLead = computed(() => {
	const activity = 'Book, page, and damage shares use the selected dates.'
	const start = props.race.startingXp
	if (props.race.rangeIsAllTime) {
		return start
			? `Point columns include ${start} starting points per realm. ${activity}`
			: `Point columns are the full season. ${activity}`
	}
	if (scope.value === 'window') {
		return `Point columns count points logged in the selected dates. ${activity}`
	}
	return start
		? `Point columns are the season total at the end of these dates, including ${start} starting points. ${activity}`
		: `Point columns are the season total at the end of these dates. ${activity}`
})

const leaderBelowZero = computed(() => {
	if (lens.value !== 'leader') return false
	const teams = activeTeams.value
	const days = teams[0]?.raw.length ?? 0
	for (let index = 0; index < days; index++) {
		const leader = Math.max(...teams.map((team) => team.raw[index] ?? 0))
		if (leader < 0) return true
	}
	return false
})

const facts = computed(() => {
	const ordered = [...activeTeams.value].sort(
		(a, b) => b.points - a.points || a.teamName.localeCompare(b.teamName),
	)
	const first = ordered[0]
	let leader = '—'
	if (first) {
		const allTied = ordered.every((team) => team.points === first.points)
		if (allTied) {
			leader = ordered.length > 1 ? 'Tied' : `${first.teamName} · ${pointsLabel(first.points)}`
		} else {
			const tied = ordered.filter((team) => team.points === first.points)
			leader =
				tied.length > 1
					? `${tied.map((team) => team.teamName).join(' & ')} tied`
					: `${first.teamName} by ${plain(first.points - (ordered[1]?.points ?? first.points))}`
		}
	}
	const average = ordered.length
		? ordered.reduce((sum, team) => sum + team.points, 0) / ordered.length
		: 0
	let move = 'No movement'
	let bestAbs = 0
	for (const team of activeTeams.value) {
		for (let index = 1; index < team.raw.length; index++) {
			const delta = (team.raw[index] ?? 0) - (team.raw[index - 1] ?? 0)
			if (Math.abs(delta) > bestAbs) {
				bestAbs = Math.abs(delta)
				move = `${team.teamName} ${pointsLabel(delta)} · ${formatDay(props.race.dates[index] ?? '')}`
			}
		}
	}
	const perMemberRows = rows.value
		.filter((row) => row.perMember != null)
		.sort((a, b) => (b.perMember ?? 0) - (a.perMember ?? 0))
	const topMember = perMemberRows[0]
	return {
		leader,
		average: pointsLabel(average),
		move,
		perMember: topMember ? `${topMember.teamName} · ${plain(topMember.perMember ?? 0)} pts` : null,
	}
})

const chartLabel = computed(() => {
	const ordered = [...activeTeams.value].sort((a, b) => b.points - a.points)
	const summary = ordered.map((team) => `${team.teamName} ${pointsLabel(team.points)}`).join(', ')
	const scopeLabel = scope.value === 'window' ? 'points earned in the selected dates' : 'season totals'
	const lensLabel = LENSES.find((item) => item.id === lens.value)?.label ?? 'Points'
	return `Realm points over time, ${scopeLabel}, ${lensLabel} view. ${summary}. Arrow keys inspect a day.`
})

function toggleSort(key: SortKey) {
	if (sortKey.value === key) {
		sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
	} else {
		sortKey.value = key
		sortDir.value = key === 'teamName' ? 'asc' : 'desc'
	}
}

function ariaSort(key: SortKey): 'ascending' | 'descending' | 'none' {
	if (sortKey.value !== key) return 'none'
	return sortDir.value === 'asc' ? 'ascending' : 'descending'
}

function sortMark(key: SortKey) {
	if (sortKey.value !== key) return '↕'
	return sortDir.value === 'asc' ? '↑' : '↓'
}

function compareRows(a: RaceRow, b: RaceRow): number {
	const dir = sortDir.value === 'asc' ? 1 : -1
	if (sortKey.value === 'teamName') {
		return a.teamName.localeCompare(b.teamName) * dir
	}
	const av = numericValue(a, sortKey.value)
	const bv = numericValue(b, sortKey.value)
	if (av == null && bv == null) return a.teamName.localeCompare(b.teamName)
	if (av == null) return 1
	if (bv == null) return -1
	if (av === bv) return a.teamName.localeCompare(b.teamName)
	return (av - bv) * dir
}

function numericValue(row: RaceRow, key: SortKey): number | null {
	switch (key) {
		case 'teamName':
			return null
		case 'start':
			return row.start
		case 'gained':
			return row.gained
		case 'lost':
			return row.lost
		case 'points':
			return row.points
		case 'share':
			return row.share
		case 'leaderPct':
			return row.leaderPct
		case 'gap':
			return row.gap
		case 'vsAvg':
			return row.vsAvg
		case 'perMember':
			return row.perMember
		case 'booksShare':
			return row.booksShare
		case 'pagesShare':
			return row.pagesShare
		case 'dealtShare':
			return row.dealtShare
		case 'takenShare':
			return row.takenShare
	}
}

function cell(row: RaceRow, key: SortKey): { text: string; tone: '' | 'pos' | 'neg' } {
	switch (key) {
		case 'teamName':
			return { text: row.teamName, tone: '' }
		case 'start':
			return { text: plain(row.start), tone: '' }
		case 'gained':
			return { text: pointsLabel(row.gained), tone: toneOf(row.gained) }
		case 'lost':
			return row.lost > 0
				? { text: `−${plain(row.lost)}`, tone: 'neg' }
				: { text: '0', tone: '' }
		case 'points':
			return { text: pointsLabel(row.points), tone: toneOf(row.points) }
		case 'share':
			return { text: pct(row.share), tone: '' }
		case 'leaderPct':
			return { text: row.leaderPct == null ? '—' : pct(row.leaderPct), tone: '' }
		case 'gap':
			return { text: plain(row.gap), tone: '' }
		case 'vsAvg':
			return { text: pointsLabel(row.vsAvg), tone: toneOf(row.vsAvg) }
		case 'perMember':
			return { text: row.perMember == null ? '—' : plain(row.perMember), tone: '' }
		case 'booksShare':
			return { text: shareText(row.booksShare, row.books), tone: '' }
		case 'pagesShare':
			return { text: shareText(row.pagesShare, row.pages), tone: '' }
		case 'dealtShare':
			return { text: shareText(row.dealtShare, row.dealt), tone: '' }
		case 'takenShare':
			return { text: shareText(row.takenShare, row.taken), tone: '' }
	}
}

function toggleIsolate(teamId: string) {
	isolatedId.value = isolatedId.value === teamId ? null : teamId
}

function onPointer(event: PointerEvent) {
	const svg = event.currentTarget
	if (!(svg instanceof SVGSVGElement)) return
	const count = props.race.dates.length
	if (!count) return
	const point = viewBoxPoint(svg, event.clientX, event.clientY)
	if (!point) return
	if (count === 1) {
		hoverIndex.value = 0
		return
	}
	const rel = (point.x - PAD.left) / INNER_W
	hoverIndex.value = Math.max(0, Math.min(count - 1, Math.round(rel * (count - 1))))
}

function onChartKey(event: KeyboardEvent) {
	const count = props.race.dates.length
	if (!count) return
	if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
	event.preventDefault()
	const current = hoverIndex.value ?? count - 1
	const next = event.key === 'ArrowRight' ? current + 1 : current - 1
	hoverIndex.value = Math.max(0, Math.min(count - 1, next))
}

function plain(n: number): string {
	const rounded = Math.round(n * 10) / 10
	const abs = Math.abs(rounded)
	const text = Number.isInteger(abs)
		? abs.toLocaleString()
		: abs.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
	return rounded < 0 ? `−${text}` : text
}

function pointsLabel(n: number): string {
	if (n > 0) return `+${plain(n)}`
	return plain(n)
}

function pct(n: number): string {
	if (!Number.isFinite(n)) return '—'
	const rounded = Math.round(n * 10) / 10
	return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`
}

function shareText(share: number | null, count: number): string {
	if (share == null) return '—'
	return `${pct(share)} · ${count.toLocaleString()}`
}

function toneOf(n: number): '' | 'pos' | 'neg' {
	if (n > 0) return 'pos'
	if (n < 0) return 'neg'
	return ''
}

function formatLensValue(active: Lens, value: number): string {
	if (active === 'rank') return `#${Math.round(value)}`
	if (active === 'share' || active === 'leader') return pct(value)
	if (active === 'gap') return plain(value)
	return pointsLabel(value)
}

function formatDay(iso: string, withYear = false): string {
	const date = new Date(`${iso}T12:00:00`)
	if (Number.isNaN(date.getTime())) return iso
	return date.toLocaleDateString(undefined, {
		month: 'short',
		day: 'numeric',
		...(withYear ? { year: 'numeric' as const } : {}),
	})
}

function yearOf(iso: string): string {
	return iso.slice(0, 4)
}

function ranksFor(values: number[]): number[] {
	const order = values.map((value, index) => ({ value, index }))
	order.sort((a, b) => b.value - a.value || a.index - b.index)
	const ranks = new Array<number>(values.length).fill(1)
	let rank = 1
	for (let index = 0; index < order.length; index++) {
		const current = order[index]
		const previous = order[index - 1]
		if (!current) continue
		if (previous && current.value < previous.value) rank = index + 1
		ranks[current.index] = rank
	}
	return ranks
}

function transformSeries(raw: number[][], active: Lens): number[][] {
	const days = raw[0]?.length ?? 0
	const out = raw.map((series) => series.slice())
	if (active === 'points' || days === 0) return out
	for (let day = 0; day < days; day++) {
		const column = raw.map((series) => series[day] ?? 0)
		if (active === 'share') {
			const sum = column.reduce((total, value) => total + value, 0)
			column.forEach((value, team) => {
				const slot = out[team]
				if (slot) slot[day] = sum === 0 ? 0 : (value / sum) * 100
			})
		} else if (active === 'leader') {
			const leader = Math.max(...column)
			column.forEach((value, team) => {
				const slot = out[team]
				if (!slot) return
				slot[day] = leader > 0 ? (value / leader) * 100 : leader === 0 ? 100 : 0
			})
		} else if (active === 'gap') {
			const leader = Math.max(...column)
			column.forEach((value, team) => {
				const slot = out[team]
				if (slot) slot[day] = leader - value
			})
		} else {
			const rank = ranksFor(column)
			rank.forEach((value, team) => {
				const slot = out[team]
				if (slot) slot[day] = value
			})
		}
	}
	return out
}

function xFor(index: number, count: number): number {
	if (count <= 1) return PAD.left + INNER_W / 2
	return PAD.left + (index / (count - 1)) * INNER_W
}

function yFor(value: number, yMin: number, yMax: number): number {
	const span = yMax - yMin
	if (!span) return PAD.top + INNER_H / 2
	const t = (value - yMin) / span
	return PAD.top + (1 - t) * INNER_H
}

function linePath(values: number[], count: number, yMin: number, yMax: number): string {
	if (!values.length) return ''
	return values
		.map((value, index) => {
			const cmd = index === 0 ? 'M' : 'L'
			return `${cmd}${xFor(index, count).toFixed(1)},${yFor(value, yMin, yMax).toFixed(1)}`
		})
		.join(' ')
}

function xLabelIndexes(count: number): number[] {
	if (count <= 1) return [0]
	if (count <= 6) return Array.from({ length: count }, (_, index) => index)
	const wanted = 5
	const indexes = new Set<number>([0, count - 1])
	for (let step = 1; step < wanted - 1; step++) {
		indexes.add(Math.round((step * (count - 1)) / (wanted - 1)))
	}
	return [...indexes].sort((a, b) => a - b)
}

function padDomain(min: number, max: number): [number, number] {
	if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1]
	if (min === max) {
		const pad = Math.abs(min) > 0 ? Math.abs(min) * 0.25 : 1
		return [min - pad, max + pad]
	}
	const span = max - min
	return [min - span * 0.08, max + span * 0.1]
}

function niceTicks(min: number, max: number): number[] {
	if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return [min]
	const span = max - min
	const raw = span / 4
	const mag = 10 ** Math.floor(Math.log10(raw))
	const norm = raw / mag
	const step = (norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10) * mag
	if (!Number.isFinite(step) || step <= 0) return [min, max]
	const start = Math.ceil(min / step) * step
	const ticks: number[] = []
	for (let value = start; value <= max + step * 0.001 && ticks.length < 6; value += step) {
		if (value >= min - step * 0.001) ticks.push(Math.round(value * 1000) / 1000)
	}
	return ticks.length ? ticks : [min, max]
}

function tickText(active: Lens, value: number): string {
	if (active === 'share' || active === 'leader') return `${Math.round(value)}%`
	const rounded = Math.round(value)
	const abs = Math.abs(rounded)
	const sign = rounded < 0 ? '−' : ''
	if (abs >= 10000) return `${sign}${Math.round(abs / 1000)}k`
	if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(1)}k`
	return `${sign}${abs}`
}

function domainFor(active: Lens, values: number[][], teamCount: number) {
	if (active === 'rank') {
		const n = Math.max(teamCount, 1)
		return {
			min: n + 0.5,
			max: 0.5,
			ticks: Array.from({ length: n }, (_, index) => ({
				value: index + 1,
				text: String(index + 1),
			})),
		}
	}
	const flat = values.flat()
	const min = flat.length ? Math.min(...flat) : 0
	const max = flat.length ? Math.max(...flat) : 1
	const [lo, hi] = padDomain(min, max)
	const ticks = niceTicks(lo, hi).map((value) => ({ value, text: tickText(active, value) }))
	// Gap puts the leader (0 behind) at the top, same as the other readouts.
	if (active === 'gap') return { min: hi, max: lo, ticks }
	return { min: lo, max: hi, ticks }
}
</script>

<template>
	<div class="team-points">
		<article class="card points-card">
			<h3>Realm points over time</h3>
			<p class="chart-lead">
				Cumulative points for every realm. Switch the readout to compare share, lead, gap, or rank.
			</p>

			<div v-if="!race.teams.length" class="empty-note">No realms configured.</div>
			<template v-else>
				<div class="controls">
					<div class="chip-row" role="group" aria-label="Which points to plot">
						<button
							type="button"
							class="chip"
							:class="{ active: scope === 'window' }"
							:aria-pressed="scope === 'window'"
							@click="scope = 'window'"
						>
							This window
						</button>
						<button
							type="button"
							class="chip"
							:class="{ active: scope === 'season' }"
							:aria-pressed="scope === 'season'"
							@click="scope = 'season'"
						>
							Season total
						</button>
					</div>
					<p class="scope-note">{{ scopeNote }}</p>
					<div class="chip-row" role="group" aria-label="Chart readout">
						<button
							v-for="item in LENSES"
							:key="item.id"
							type="button"
							class="chip"
							:class="{ active: lens === item.id }"
							:aria-pressed="lens === item.id"
							:title="item.title"
							@click="lens = item.id"
						>
							{{ item.label }}
						</button>
					</div>
					<p v-if="leaderBelowZero" class="scope-note">
						On days when every realm is below 0, percent of leader stays at 0.
					</p>
				</div>

				<ul class="facts">
					<li>
						<span>Leader</span>
						<strong>{{ facts.leader }}</strong>
					</li>
					<li>
						<span>Field average</span>
						<strong>{{ facts.average }}</strong>
					</li>
					<li>
						<span>Biggest move</span>
						<strong>{{ facts.move }}</strong>
					</li>
					<li v-if="facts.perMember">
						<span>Per member</span>
						<strong>{{ facts.perMember }}</strong>
					</li>
				</ul>

				<div v-if="chart" class="race-plot">
					<svg
						ref="raceSvg"
						class="race-svg"
						:viewBox="`0 0 ${VB_W} ${VB_H}`"
						role="img"
						tabindex="0"
						:aria-label="chartLabel"
						@pointermove="onPointer"
						@pointerleave="hoverIndex = null"
						@keydown="onChartKey"
					>
						<line
							v-for="(tick, index) in chart.yTicks"
							:key="`grid-${index}`"
							class="grid"
							:x1="PAD.left"
							:x2="VB_W - PAD.right"
							:y1="tick.y"
							:y2="tick.y"
						/>
						<text
							v-for="(tick, index) in chart.yTicks"
							:key="`ylabel-${index}`"
							class="axis-label"
							:x="PAD.left - 8"
							:y="tick.y + 4"
							text-anchor="end"
						>
							{{ tick.text }}
						</text>
						<line
							v-if="chart.hoverX != null"
							class="hover-line"
							:x1="chart.hoverX"
							:x2="chart.hoverX"
							:y1="PAD.top"
							:y2="PAD.top + INNER_H"
						/>
						<g v-for="path in chart.paths" :key="path.teamId" :opacity="path.opacity">
							<path v-if="path.d" class="halo" :d="path.d" />
							<path
								v-if="path.d"
								class="line"
								:d="path.d"
								:stroke="path.color"
								:stroke-width="path.width"
							/>
						</g>
						<circle
							v-for="dot in chart.ends"
							:key="`end-${dot.teamId}`"
							:cx="dot.cx"
							:cy="dot.cy"
							r="3.5"
							:fill="dot.color"
							:opacity="dot.opacity"
						/>
						<circle
							v-for="dot in chart.dots"
							:key="`dot-${dot.teamId}`"
							:cx="dot.cx"
							:cy="dot.cy"
							r="4.5"
							:fill="dot.color"
							:stroke="'var(--realm-surface)'"
							stroke-width="2"
							:opacity="dot.opacity"
						/>
						<text
							v-for="(label, index) in chart.xLabels"
							:key="`xlabel-${index}`"
							class="axis-label"
							:x="label.x"
							:y="VB_H - 8"
							:text-anchor="label.anchor"
						>
							{{ label.text }}
						</text>
					</svg>
					<div v-if="tipStyle && hoverRows.length" class="race-tip" :style="tipStyle">
						<p class="tip-date">{{ hoverDateLabel }}</p>
						<ul>
							<li v-for="row in hoverRows" :key="row.teamId" class="tip-row">
								<i class="swatch" :style="{ background: row.color }" />
								<span class="tip-name">{{ row.teamName }}</span>
								<span class="tip-val">
									<strong>{{ row.primary }}</strong>
									<small v-if="row.secondary">{{ row.secondary }}</small>
								</span>
								<span v-if="lens !== 'rank'" class="tip-rank">#{{ row.rank }}</span>
							</li>
						</ul>
					</div>
				</div>
				<p v-else class="empty-note">No days in this range.</p>

				<div class="legend" role="group" aria-label="Realms">
					<button
						v-for="team in legend"
						:key="team.teamId"
						type="button"
						class="legend-btn"
						:class="{
							on: isolatedId === team.teamId,
							dim: isolatedId != null && isolatedId !== team.teamId,
						}"
						:aria-pressed="isolatedId === team.teamId"
						@click="toggleIsolate(team.teamId)"
						@mouseenter="legendHover = team.teamId"
						@mouseleave="legendHover = null"
						@focus="legendHover = team.teamId"
						@blur="legendHover = null"
					>
						<i class="swatch" :style="{ background: team.color }" />
						<span>{{ team.icon }} {{ team.teamName }}</span>
						<strong>{{ formatLensValue(lens, team.end) }}</strong>
					</button>
				</div>
				<p class="scope-note legend-hint">Select a realm to fade the others. This chart always includes every realm.</p>
			</template>
		</article>

		<article v-if="race.teams.length" class="card points-card">
			<h3>Relative standings</h3>
			<p class="chart-lead">{{ tableLead }}</p>
			<div class="table-wrap">
				<table class="data-table" aria-label="Relative realm standings">
					<thead>
						<tr>
							<th
								v-for="col in COLUMNS"
								:key="col.key"
								scope="col"
								:class="{ num: col.numeric, 'realm-col': !col.numeric }"
								:aria-sort="ariaSort(col.key)"
							>
								<button
									type="button"
									class="sort-th"
									:title="col.title"
									@click="toggleSort(col.key)"
								>
									{{ col.label }}
									<span class="sort-mark">{{ sortMark(col.key) }}</span>
								</button>
							</th>
						</tr>
					</thead>
					<tbody>
						<tr v-for="row in sortedRows" :key="row.teamId">
							<td
								v-for="col in COLUMNS"
								:key="col.key"
								:class="[
									col.numeric ? 'num' : 'realm-col',
									col.key !== 'teamName' ? cell(row, col.key).tone : '',
								]"
							>
								<span v-if="col.key === 'teamName'" class="realm">
									<i class="swatch" :style="{ background: row.color }" />
									{{ row.icon }} {{ row.teamName }}
								</span>
								<template v-else>{{ cell(row, col.key).text }}</template>
							</td>
						</tr>
					</tbody>
				</table>
			</div>
		</article>
	</div>
</template>

<style scoped>
.points-card {
	padding: 1.15rem 1.25rem;
	margin-bottom: 1rem;
}

.points-card h3 {
	margin: 0 0 0.3rem;
	font-family: var(--font-display);
	color: var(--realm-text);
	font-size: 1.1rem;
}

.chart-lead,
.scope-note {
	margin: 0 0 0.85rem;
	color: var(--realm-text-muted);
	font-size: 0.88rem;
	line-height: 1.45;
}

.scope-note {
	margin: 0;
}

.legend-hint {
	margin-top: 0.75rem;
}

.controls {
	display: flex;
	flex-direction: column;
	gap: 0.55rem;
	margin-bottom: 0.9rem;
}

.chip-row {
	display: flex;
	flex-wrap: wrap;
	gap: 0.4rem;
}

.chip {
	padding: 0.4rem 0.85rem;
	border-radius: 999px;
	border: 1px solid var(--realm-border);
	background: var(--realm-bg);
	color: var(--realm-text-muted);
	font-family: var(--font-body);
	font-size: 0.82rem;
	font-weight: 600;
	cursor: pointer;
}

.chip:hover,
.chip:focus-visible {
	color: var(--realm-text);
}

.chip.active {
	background: rgba(212, 99, 74, 0.15);
	border-color: var(--realm-accent);
	color: var(--realm-accent-glow);
}

.facts {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(10.5rem, 1fr));
	gap: 0.6rem;
	list-style: none;
	margin: 0 0 0.9rem;
	padding: 0;
}

.facts li {
	display: flex;
	flex-direction: column;
	gap: 0.15rem;
	min-width: 0;
	padding: 0.7rem 0.8rem;
	border-radius: var(--radius);
	border: 1px solid var(--realm-border);
	background: var(--realm-bg);
}

.facts span {
	font-size: 0.72rem;
	text-transform: uppercase;
	letter-spacing: 0.05em;
	color: var(--realm-text-muted);
}

.facts strong {
	color: var(--realm-text);
	font-size: 0.95rem;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.race-plot {
	position: relative;
}

.race-svg {
	width: 100%;
	height: 20rem;
	display: block;
	touch-action: pan-y;
	border-radius: 8px;
	background: color-mix(in srgb, var(--realm-bg) 70%, transparent);
}

.race-svg:focus {
	outline: 2px solid var(--realm-accent);
	outline-offset: 3px;
}

.grid {
	stroke: var(--realm-border);
	stroke-width: 1;
}

.axis-label {
	fill: var(--realm-text-muted);
	font-size: 11px;
	font-family: var(--font-body), sans-serif;
}

.hover-line {
	stroke: var(--realm-text-muted);
	stroke-width: 1;
	stroke-dasharray: 3 3;
}

.halo {
	fill: none;
	stroke: var(--realm-bg);
	stroke-width: 5.5;
	stroke-linecap: round;
	stroke-linejoin: round;
}

.line {
	fill: none;
	stroke-linecap: round;
	stroke-linejoin: round;
}

.race-tip {
	position: absolute;
	top: 0.4rem;
	z-index: 2;
	min-width: 12.5rem;
	padding: 0.55rem 0.7rem 0.65rem;
	border-radius: 8px;
	border: 1px solid var(--realm-border);
	background: color-mix(in srgb, var(--realm-surface) 94%, black);
	box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
	pointer-events: none;
}

.tip-date {
	margin: 0;
	font-size: 0.78rem;
	font-weight: 700;
	color: var(--realm-text);
}

.race-tip ul {
	list-style: none;
	margin: 0.4rem 0 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 0.28rem;
}

.tip-row {
	display: grid;
	grid-template-columns: 0.55rem minmax(0, 1fr) auto auto;
	gap: 0.35rem;
	align-items: baseline;
	font-size: 0.8rem;
	color: var(--realm-text);
}

.tip-val {
	display: inline-flex;
	align-items: baseline;
	gap: 0.3rem;
	font-variant-numeric: tabular-nums;
}

.tip-name {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.tip-row small {
	color: var(--realm-text-muted);
}

.tip-rank {
	color: var(--realm-text-muted);
	font-variant-numeric: tabular-nums;
}

.legend {
	display: flex;
	flex-wrap: wrap;
	gap: 0.45rem;
	margin-top: 0.75rem;
}

.legend-btn {
	display: inline-flex;
	align-items: center;
	gap: 0.4rem;
	padding: 0.35rem 0.7rem;
	border-radius: 999px;
	border: 1px solid var(--realm-border);
	background: var(--realm-bg);
	color: var(--realm-text);
	font: inherit;
	font-size: 0.82rem;
	cursor: pointer;
}

.legend-btn strong {
	font-variant-numeric: tabular-nums;
}

.legend-btn.on {
	border-color: var(--realm-accent);
}

.legend-btn.dim {
	opacity: 0.45;
}

.swatch {
	display: inline-block;
	width: 0.55rem;
	height: 0.55rem;
	border-radius: 2px;
	flex-shrink: 0;
}

.realm {
	display: inline-flex;
	align-items: center;
	gap: 0.4rem;
	white-space: nowrap;
}

.table-wrap {
	overflow-x: auto;
	-webkit-overflow-scrolling: touch;
}

.realm-col {
	position: sticky;
	left: 0;
	background: var(--realm-surface);
	z-index: 1;
}

th.realm-col {
	z-index: 2;
}

th.num .sort-th {
	width: 100%;
	justify-content: flex-end;
}

td.num {
	text-align: right;
	font-variant-numeric: tabular-nums;
	white-space: nowrap;
}

.sort-th {
	display: inline-flex;
	align-items: center;
	gap: 0.35rem;
	margin: 0;
	padding: 0;
	border: 0;
	background: none;
	color: inherit;
	font: inherit;
	font-weight: inherit;
	font-size: inherit;
	letter-spacing: inherit;
	text-transform: inherit;
	cursor: pointer;
	white-space: nowrap;
}

.sort-th:hover {
	color: var(--realm-accent-glow);
}

.sort-mark {
	font-size: 0.75em;
	opacity: 0.5;
	line-height: 1;
}

.pos {
	color: var(--realm-success);
	font-weight: 600;
}

.neg {
	color: var(--realm-accent-glow);
	font-weight: 600;
}

.empty-note {
	color: var(--realm-text-muted);
	font-style: italic;
	font-size: 0.9rem;
	margin: 0;
}

@media (max-width: 720px) {
	.race-svg {
		height: 16rem;
	}
}
</style>
