import { SVG_FONT_SANS } from '../lib/svgFonts.js'
import { svgToPngFast } from '../services/svgToPng.js'
import { User } from '../db/models/User.js'
import { Submission } from '../db/models/Submission.js'
import { withActive } from '../db/activeSubmission.js'
import { getTeamById } from '../services/prompts.js'

export type ProfileCardInput = {
	name: string
	nametag: string | null
	color: string | null
	backgroundUrl: string | null
	avatarUrl: string | null
	genres: string | null
	authors: string | null
	bio: string | null
	pages: number
	minutes: number
	sprintsDone: number
	page?: 0 | 1
	site?: SiteCardStats | null
}

export type SiteCardStats = {
	linked: boolean
	teamName: string | null
	booksFinished: number
	booksInProgress: number
	pagesLogged: number
	points: number
	currentlyReading: string | null
	recentBooks: string[]
}

export async function loadSiteCard(siteUserId: string | null | undefined): Promise<SiteCardStats> {
	const empty: SiteCardStats = {
		linked: false,
		teamName: null,
		booksFinished: 0,
		booksInProgress: 0,
		pagesLogged: 0,
		points: 0,
		currentlyReading: null,
		recentBooks: [],
	}
	if (!siteUserId) return empty
	const user = await User.findById(siteUserId)
	if (!user) return empty
	const subs = await Submission.find(withActive({ userId: user._id })).sort({ createdAt: -1 })
	const finished = subs.filter((sub) => !(sub.startedAt?.trim() && !sub.finishedAt?.trim()))
	const inProgress = subs.length - finished.length
	const team = user.teamId ? getTeamById(user.teamId) : undefined
	const reading = user.currentlyReadingTitle?.trim()
	return {
		linked: true,
		teamName: team?.name ?? null,
		booksFinished: finished.length,
		booksInProgress: inProgress,
		pagesLogged: finished.reduce((sum, sub) => sum + (sub.pageCount || 0), 0),
		points: finished.reduce((sum, sub) => sum + (sub.totalImpact || 0), 0),
		currentlyReading: reading
			? [reading, user.currentlyReadingAuthor?.trim()].filter(Boolean).join(' — ')
			: null,
		recentBooks: finished.slice(0, 3).map((sub) => sub.bookTitle),
	}
}

const WIDTH = 1600
const HEIGHT = 980
const DEFAULT_BG = '#6d28d9'
const GOLD = '#ffe14a'

function escapeXml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
}

function cleanHex(color: string | null): string {
	const raw = (color ?? '').trim()
	return /^#[0-9a-fA-F]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_BG
}

function isLight(hex: string): boolean {
	const n = Number.parseInt(hex.slice(1), 16)
	const r = (n >> 16) & 255
	const g = (n >> 8) & 255
	const b = n & 255
	return (r * 299 + g * 587 + b * 114) / 1000 > 170
}

function wrap(text: string, max: number, lines: number): string[] {
	const words = text.trim().split(/\s+/).filter(Boolean)
	const out: string[] = []
	let current = ''
	for (const word of words) {
		const next = current ? `${current} ${word}` : word
		if (next.length > max && current) {
			out.push(current)
			current = word
			if (out.length === lines) break
		} else {
			current = next
		}
	}
	if (current && out.length < lines) out.push(current)
	if (out.length === lines && words.join(' ').length > out.join(' ').length) {
		const last = out[lines - 1] ?? ''
		out[lines - 1] = last.length > 3 ? `${last.slice(0, max - 1)}…` : last
	}
	return out
}

const imageCache = new Map<string, { at: number; uri: string | null }>()
const pngCache = new Map<string, { at: number; png: Buffer }>()
const CACHE_MS = 3 * 60 * 1000

async function imageDataUri(url: string | null): Promise<string | null> {
	const target = url?.trim()
	if (!target || !/^https:\/\//i.test(target)) return null
	const cached = imageCache.get(target)
	if (cached && Date.now() - cached.at < CACHE_MS) return cached.uri
	let uri: string | null = null
	try {
		const res = await fetch(target, { signal: AbortSignal.timeout(4000) })
		if (res.ok) {
			const type = (res.headers.get('content-type') || 'image/png').split(';')[0]?.trim() || 'image/png'
			if (type.startsWith('image/')) {
				const bytes = Buffer.from(await res.arrayBuffer())
				if (bytes.length > 0 && bytes.length <= 2_000_000) {
					uri = `data:${type};base64,${bytes.toString('base64')}`
				}
			}
		}
	} catch {
		uri = null
	}
	imageCache.set(target, { at: Date.now(), uri })
	return uri
}

export async function renderProfileCardSvg(input: ProfileCardInput): Promise<string> {
	const bg = cleanHex(input.color)
	const nameColor = isLight(bg) ? '#1a1028' : GOLD
	const labelColor = isLight(bg) ? '#3b2760' : GOLD
	const textColor = isLight(bg) ? '#1a1028' : '#f7f4ff'
	const display = (input.nametag || input.name).trim().slice(0, 22) || 'Reader'
	const genres = wrap(input.genres?.trim() || 'Not set', 46, 2)
	const authors = wrap(input.authors?.trim() || 'Not set', 44, 2)
	const bio = wrap(input.bio?.trim() || 'No bio yet.', 88, 2)
	const avgPages = input.minutes > 0 ? (input.pages / input.minutes).toFixed(2) : '0'
	const avgMinutes = input.sprintsDone > 0 ? Math.round(input.minutes / input.sprintsDone) : 0
	const [background, avatar] = await Promise.all([
		imageDataUri(input.backgroundUrl),
		imageDataUri(input.avatarUrl),
	])
	const letter = escapeXml(display.slice(0, 1).toUpperCase())
	const backgroundLayer = background
		? `<image href="${background}" xlink:href="${background}" x="0" y="0" width="${WIDTH}" height="${HEIGHT}" preserveAspectRatio="xMidYMid slice"/>
       <rect width="${WIDTH}" height="${HEIGHT}" fill="${bg}" fill-opacity="0.62"/>`
		: `<rect width="${WIDTH}" height="${HEIGHT}" fill="${bg}"/>`
	const avatarLayer = avatar
		? `<g clip-path="url(#avatar)"><image href="${avatar}" xlink:href="${avatar}" x="48" y="36" width="250" height="250" preserveAspectRatio="xMidYMid slice"/></g>`
		: `<circle cx="173" cy="161" r="115" fill="#2a1058"/><text x="173" y="190" text-anchor="middle" fill="${GOLD}" font-size="84" font-family="${SVG_FONT_SANS}" font-weight="700">${letter}</text>`

	const bioLines = bio
		.map(
			(line, index) =>
				`<text x="80" y="${840 + index * 36}" fill="${textColor}" font-size="28" font-family="${SVG_FONT_SANS}">${escapeXml(line)}</text>`,
		)
		.join('')
	const name = escapeXml(display)
	const info = labeledRows(
		340,
		230,
		[
			['Preferred Genres:', genres],
			['Favorite Authors:', authors],
		],
		labelColor,
		textColor,
	)
	if (input.page === 1) {
		return renderSitePage({
			bg,
			backgroundLayer,
			avatarLayer,
			name,
			nameColor,
			labelColor,
			textColor,
			site: input.site ?? null,
		})
	}
	const stat = (x: number, y: number, label: string, value: string) => `
    <text x="${x}" y="${y}" text-anchor="middle" fill="${labelColor}" font-size="28" font-family="${SVG_FONT_SANS}" font-weight="700">${escapeXml(label)}</text>
    <text x="${x}" y="${y + 46}" text-anchor="middle" fill="${textColor}" font-size="32" font-family="${SVG_FONT_SANS}">${escapeXml(value)}</text>`

	return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <clipPath id="card"><rect width="${WIDTH}" height="${HEIGHT}" rx="28"/></clipPath>
    <clipPath id="avatar"><circle cx="173" cy="161" r="115"/></clipPath>
  </defs>
  <g clip-path="url(#card)">
    ${backgroundLayer}
    ${avatarLayer}
    <text x="344" y="112" fill="#2a1058" font-size="60" font-family="${SVG_FONT_SANS}" font-weight="700">${name}</text>
    <text x="340" y="108" fill="${nameColor}" font-size="60" font-family="${SVG_FONT_SANS}" font-weight="700">${name}</text>
    ${info}
    <rect x="48" y="370" width="1504" height="300" rx="24" fill="rgba(0,0,0,0.16)" stroke="rgba(255,255,255,0.9)" stroke-width="3"/>
    ${stat(300, 450, 'Sprints Done', String(input.sprintsDone))}
    ${stat(800, 450, 'Pages Read', String(input.pages))}
    ${stat(1260, 450, 'Total Sprint Time', formatClock(input.minutes))}
    ${stat(540, 590, 'Avg. Pages/Min', avgPages)}
    ${stat(1060, 590, 'Avg. Time/Sprint', formatClock(avgMinutes))}
    <rect x="48" y="760" width="1504" height="160" rx="22" fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="3"/>
    ${bioLines}
  </g>
</svg>`
}

function renderSitePage(opts: {
	bg: string
	backgroundLayer: string
	avatarLayer: string
	name: string
	nameColor: string
	labelColor: string
	textColor: string
	site: SiteCardStats | null
}): string {
	const site = opts.site
	const stat = (x: number, y: number, label: string, value: string) => `
    <text x="${x}" y="${y}" text-anchor="middle" fill="${opts.labelColor}" font-size="28" font-family="${SVG_FONT_SANS}" font-weight="700">${escapeXml(label)}</text>
    <text x="${x}" y="${y + 46}" text-anchor="middle" fill="${opts.textColor}" font-size="32" font-family="${SVG_FONT_SANS}">${escapeXml(value)}</text>`
	const reading = site?.linked
		? site.currentlyReading || 'Nothing listed'
		: 'Link this account with /register using your site email.'
	const recent = site?.linked && site.recentBooks.length
		? site.recentBooks.join(' · ')
		: site?.linked
			? 'No finished books yet.'
			: 'Website stats show up after the emails match.'
	const recentLines = wrap(recent, 70, 2)
		.map(
			(line, index) =>
				`<text x="80" y="${860 + index * 38}" fill="${opts.textColor}" font-size="28" font-family="${SVG_FONT_SANS}">${escapeXml(line)}</text>`,
		)
		.join('')
	return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <clipPath id="card"><rect width="${WIDTH}" height="${HEIGHT}" rx="28"/></clipPath>
    <clipPath id="avatar"><circle cx="173" cy="161" r="115"/></clipPath>
  </defs>
  <g clip-path="url(#card)">
    ${opts.backgroundLayer}
    ${opts.avatarLayer}
    <text x="346" y="128" fill="#2a1058" font-size="64" font-family="${SVG_FONT_SANS}" font-weight="700">${opts.name}</text>
    <text x="340" y="122" fill="${opts.nameColor}" font-size="64" font-family="${SVG_FONT_SANS}" font-weight="700">${opts.name}</text>
    <text x="340" y="210" fill="${opts.labelColor}" font-size="28" font-family="${SVG_FONT_SANS}" font-weight="700">Team:</text>
    <text x="460" y="210" fill="${opts.textColor}" font-size="28" font-family="${SVG_FONT_SANS}">${escapeXml(site?.teamName || 'Not linked')}</text>
    <text x="340" y="270" fill="${opts.labelColor}" font-size="28" font-family="${SVG_FONT_SANS}" font-weight="700">Reading:</text>
    <text x="500" y="270" fill="${opts.textColor}" font-size="26" font-family="${SVG_FONT_SANS}">${escapeXml(wrap(reading, 48, 1)[0] ?? '')}</text>
    <rect x="48" y="390" width="1504" height="340" rx="24" fill="rgba(0,0,0,0.16)" stroke="rgba(255,255,255,0.9)" stroke-width="3"/>
    ${stat(300, 470, 'Books finished', String(site?.booksFinished ?? 0))}
    ${stat(800, 470, 'Pages logged', String(site?.pagesLogged ?? 0))}
    ${stat(1280, 470, 'Points', String(site?.points ?? 0))}
    ${stat(540, 640, 'In progress', String(site?.booksInProgress ?? 0))}
    ${stat(1060, 640, 'Team', site?.teamName || '—')}
    <rect x="48" y="780" width="1504" height="150" rx="22" fill="rgba(0,0,0,0.18)" stroke="rgba(255,255,255,0.85)" stroke-width="3"/>
    <text x="80" y="820" fill="${opts.labelColor}" font-size="24" font-family="${SVG_FONT_SANS}" font-weight="700">Recent books</text>
    ${recentLines}
  </g>
</svg>`
}

function labeledRows(
	x: number,
	startY: number,
	rows: Array<[string, string[]]>,
	labelColor: string,
	textColor: string,
): string {
	let y = startY
	const parts: string[] = []
	for (const [label, lines] of rows) {
		const value = lines[0] ?? ''
		parts.push(
			`<text x="${x}" y="${y}" font-size="28" font-family="${SVG_FONT_SANS}"><tspan fill="${labelColor}" font-weight="700">${escapeXml(label)} </tspan><tspan fill="${textColor}">${escapeXml(value)}</tspan></text>`,
		)
		for (const extra of lines.slice(1)) {
			y += 34
			parts.push(
				`<text x="${x + 300}" y="${y}" fill="${textColor}" font-size="28" font-family="${SVG_FONT_SANS}">${escapeXml(extra)}</text>`,
			)
		}
		y += 48
	}
	return parts.join('')
}

function formatClock(minutes: number): string {
	if (minutes <= 0) return '0 min'
	const weeks = Math.floor(minutes / (60 * 24 * 7))
	const days = Math.floor((minutes % (60 * 24 * 7)) / (60 * 24))
	const hours = Math.floor((minutes % (60 * 24)) / 60)
	const mins = minutes % 60
	const parts: string[] = []
	if (weeks) parts.push(`${weeks} wk`)
	if (days) parts.push(`${days} ${days === 1 ? 'day' : 'days'}`)
	if (!weeks && hours) parts.push(`${hours} hr`)
	if (!weeks && mins) parts.push(`${mins} min`)
	if (parts.length === 0) parts.push('0 min')
	return parts.slice(0, 2).join(', ')
}

function cardCacheKey(input: ProfileCardInput): string {
	return JSON.stringify({
		name: input.name,
		nametag: input.nametag,
		color: input.color,
		backgroundUrl: input.backgroundUrl,
		avatarUrl: input.avatarUrl,
		genres: input.genres,
		authors: input.authors,
		bio: input.bio,
		pages: input.pages,
		minutes: input.minutes,
		sprintsDone: input.sprintsDone,
		page: input.page ?? 0,
		site: input.site ?? null,
	})
}

export async function renderProfileCardPng(input: ProfileCardInput): Promise<Buffer> {
	const key = cardCacheKey(input)
	const cached = pngCache.get(key)
	if (cached && Date.now() - cached.at < CACHE_MS) return cached.png
	const svg = await renderProfileCardSvg(input)
	const png = svgToPngFast(svg, 1100)
	pngCache.set(key, { at: Date.now(), png })
	return png
}
