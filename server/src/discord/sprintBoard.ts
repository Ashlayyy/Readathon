import { SVG_FONT_SANS } from '../lib/svgFonts.js'
import { svgToPngFast } from '../services/svgToPng.js'
import { activeMinutes, formatMinutes, pagesRead, type Participant } from './sprintState.js'

const WIDTH = 1000
const ROW = 148

function escapeXml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
}

async function imageDataUri(url: string | null | undefined): Promise<string | null> {
	const target = url?.trim()
	if (!target || !/^https:\/\//i.test(target)) return null
	try {
		const res = await fetch(target, { signal: AbortSignal.timeout(4000) })
		if (!res.ok) return null
		const type = (res.headers.get('content-type') || '').split(';')[0]?.trim() || ''
		if (type !== 'image/png' && type !== 'image/jpeg') return null
		const bytes = Buffer.from(await res.arrayBuffer())
		if (bytes.length === 0 || bytes.length > 1_500_000) return null
		return `data:${type};base64,${bytes.toString('base64')}`
	} catch {
		return null
	}
}

function rankColor(rank: number): string {
	if (rank === 1) return '#e6b325'
	if (rank === 2) return '#c5ced6'
	if (rank === 3) return '#d4894c'
	return '#8eacbf'
}

export async function renderSprintBoardSvg(input: {
	durationMinutes: number
	startsAt: number
	endsAt: number
	participants: Participant[]
	avatars: Record<string, string | null>
}): Promise<string> {
	const ranked = [...input.participants].sort((a, b) => pagesRead(b) - pagesRead(a)).slice(0, 12)
	const extra = input.participants.length - ranked.length
	const height = 210 + Math.max(ranked.length, 1) * ROW + (extra > 0 ? 40 : 24)
	const duration = escapeXml(formatMinutes(input.durationMinutes))
	const pictures = await Promise.all(ranked.map((person) => imageDataUri(input.avatars[person.userId])))
	const rows = ranked
		.map((person, index) => {
			const y = 188 + index * ROW
			const rank = index + 1
			const color = rankColor(rank)
			const picture = pictures[index]
			const name = escapeXml(person.username.slice(0, 28) || 'Reader')
			const read = pagesRead(person)
			const pages = read === 1 ? '1 page' : `${read} pages`
			const minutes = formatMinutes(activeMinutes(person, input.startsAt, input.endsAt))
			const letter = escapeXml((person.username.trim().slice(0, 1) || 'R').toUpperCase())
			const face = picture
				? `<g clip-path="url(#face${index})"><image href="${picture}" xlink:href="${picture}" x="54" y="${y}" width="108" height="108" preserveAspectRatio="xMidYMid slice"/></g>`
				: `<circle cx="108" cy="${y + 54}" r="54" fill="#d5e8f2"/><text x="108" y="${y + 70}" text-anchor="middle" fill="#245066" font-size="42" font-family="${SVG_FONT_SANS}" font-weight="700">${letter}</text>`
			return `
				<circle cx="108" cy="${y + 54}" r="58" fill="none" stroke="${color}" stroke-width="6"/>
				${face}
				<circle cx="148" cy="${y + 96}" r="18" fill="${color}"/>
				<text x="148" y="${y + 103}" text-anchor="middle" fill="#1c3340" font-size="18" font-family="${SVG_FONT_SANS}" font-weight="700">${rank}</text>
				<text x="196" y="${y + 36}" fill="#1c3340" font-size="32" font-family="${SVG_FONT_SANS}" font-weight="700">#${rank} — ${name}</text>
				<text x="196" y="${y + 70}" fill="#245066" font-size="22" font-family="${SVG_FONT_SANS}">Read ${escapeXml(pages)}</text>
				<text x="196" y="${y + 98}" fill="#245066" font-size="22" font-family="${SVG_FONT_SANS}">Started on page ${person.startPage}</text>
				<text x="560" y="${y + 98}" fill="#245066" font-size="22" font-family="${SVG_FONT_SANS}">Took part for ${escapeXml(minutes)}</text>`
		})
		.join('')
	const empty =
		ranked.length === 0
			? `<text x="500" y="280" text-anchor="middle" fill="#245066" font-size="28" font-family="${SVG_FONT_SANS}">Nobody joined this sprint.</text>`
			: ''
	const more =
		extra > 0
			? `<text x="500" y="${height - 28}" text-anchor="middle" fill="#5d7c8c" font-size="20" font-family="${SVG_FONT_SANS}">+ ${extra} more</text>`
			: ''
	const clips = ranked
		.map(
			(_, index) =>
				`<clipPath id="face${index}"><circle cx="108" cy="${188 + index * ROW + 54}" r="54"/></clipPath>`,
		)
		.join('')
	return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}">
  <defs>${clips}</defs>
  <rect width="${WIDTH}" height="${height}" rx="36" fill="#e7f6fb"/>
  <text x="500" y="78" text-anchor="middle" fill="#1c3340" font-size="52" font-family="${SVG_FONT_SANS}" font-weight="700">Leaderboard</text>
  <text x="500" y="128" text-anchor="middle" fill="#1f9d55" font-size="30" font-family="${SVG_FONT_SANS}" font-weight="700">Duration: ${duration}</text>
  ${rows}
  ${empty}
  ${more}
</svg>`
}

export async function renderSprintBoardPng(input: {
	durationMinutes: number
	startsAt: number
	endsAt: number
	participants: Participant[]
	avatars: Record<string, string | null>
}): Promise<Buffer> {
	const svg = await renderSprintBoardSvg(input)
	return svgToPngFast(svg, 1000)
}
