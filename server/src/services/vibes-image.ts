import { getStaticConfig } from '../config.js'
import { SVG_FONT_SANS } from '../lib/svgFonts.js'
import type { PublicStandingsVibes } from './adminAnalytics.js'

function escapeXml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
}

function formatPages(n: number): string {
	return Math.round(n).toLocaleString('en-US')
}

type StatCard = {
	value: string
	valueColor: string
	kicker: string
	lines: string[]
}

function statCardSvg(
	x: number,
	y: number,
	w: number,
	h: number,
	card: StatCard,
): string {
	const cx = x + w / 2
	const line1 = card.lines[0] ?? ''
	const line2 = card.lines[1]
	return `
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="#1a1822" stroke="#2a2733"/>
  <text x="${cx}" y="${y + 22}" text-anchor="middle" fill="#9a9188" font-size="11" font-family="${SVG_FONT_SANS}" letter-spacing="0.06em">${escapeXml(card.kicker.toUpperCase())}</text>
  <text x="${cx}" y="${y + 58}" text-anchor="middle" fill="${card.valueColor}" font-size="32" font-family="${SVG_FONT_SANS}" font-weight="700">${escapeXml(card.value)}</text>
  <text x="${cx}" y="${y + 82}" text-anchor="middle" fill="#c9c2b8" font-size="12" font-family="${SVG_FONT_SANS}">${escapeXml(line1)}</text>
  ${
		line2
			? `<text x="${cx}" y="${y + 98}" text-anchor="middle" fill="#9a9188" font-size="11" font-family="${SVG_FONT_SANS}">${escapeXml(line2)}</text>`
			: ''
	}`
}

/** Compact weekly vibes card for Discord + optional web use. */
export function generateVibesSvg(vibes: PublicStandingsVibes): string {
	const eventName = getStaticConfig().event.name as string
	const width = 840
	const pad = 24
	const gap = 14
	const colW = (width - pad * 2 - gap) / 2
	const cardH = 112
	const o = vibes.overview

	const teams = [...vibes.dogpile].sort(
		(a, b) => b.damageTaken - a.damageTaken || b.hitCount - a.hitCount,
	)
	const formats = vibes.byFormat.slice(0, 4)

	const statsY = 78
	const sectionY = statsY + cardH * 2 + gap + 28
	const sectionHeaderH = 28
	const bodyStart = sectionY + sectionHeaderH
	const teamRowH = 40
	const formatRowH = 26
	const bodyH = Math.max(teams.length * teamRowH, formats.length * formatRowH, 28)
	const height = bodyStart + bodyH + 36

	const cards: StatCard[] = [
		{
			value: String(o.submissions),
			valueColor: '#f4efe8',
			kicker: 'Books',
			lines: [
				`${formatPages(o.totalPages)} pages`,
				`avg ${formatPages(o.avgPages)} per book`,
			],
		},
		{
			value: `${o.chaosRatio}%`,
			valueColor: '#ff8a6a',
			kicker: 'Sabotage',
			lines: [`${o.sabotageCount} attacks · ${o.addCount} adds`],
		},
		{
			value: `${o.competitionRate}%`,
			valueColor: '#f4efe8',
			kicker: 'Competition bonus',
			lines: ['of books used it'],
		},
		{
			value: String(o.activeReaders),
			valueColor: '#f4efe8',
			kicker: 'Active readers',
			lines: ['logged at least one book'],
		},
	]

	const positions = [
		{ x: pad, y: statsY },
		{ x: pad + colW + gap, y: statsY },
		{ x: pad, y: statsY + cardH + gap },
		{ x: pad + colW + gap, y: statsY + cardH + gap },
	]

	const statCards = cards
		.map((card, i) => {
			const p = positions[i]!
			return statCardSvg(p.x, p.y, colW, cardH, card)
		})
		.join('\n')

	const leftX = pad
	const rightX = pad + colW + gap

	const formatLines = formats.length
		? formats
				.map((f, i) => {
					const y = bodyStart + i * formatRowH
					return `<text x="${leftX + 14}" y="${y}" fill="#c9c2b8" font-size="14" font-family="${SVG_FONT_SANS}">${escapeXml(f.label)}</text>
      <text x="${leftX + colW - 14}" y="${y}" text-anchor="end" fill="#f4efe8" font-size="14" font-family="${SVG_FONT_SANS}" font-weight="600">${f.count}</text>`
				})
				.join('\n')
		: `<text x="${leftX + 14}" y="${bodyStart}" fill="#9a9188" font-size="14" font-family="${SVG_FONT_SANS}">No books this week</text>`

	const teamLines = teams.length
		? teams
				.map((t, i) => {
					const y = bodyStart + i * teamRowH
					return `
      <text x="${rightX + 14}" y="${y}" fill="#f4efe8" font-size="15" font-family="${SVG_FONT_SANS}" font-weight="600">${escapeXml(t.teamName)}</text>
      <text x="${rightX + 14}" y="${y + 18}" fill="#9a9188" font-size="12" font-family="${SVG_FONT_SANS}">${t.hitCount} hits · −${t.damageTaken} dmg · ${t.booksLogged} books</text>`
				})
				.join('\n')
		: `<text x="${rightX + 14}" y="${bodyStart}" fill="#9a9188" font-size="14" font-family="${SVG_FONT_SANS}">No sabotage hits</text>`

	const panelH = sectionHeaderH + bodyH + 16

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#0f0e14"/>
  <text x="${width / 2}" y="32" text-anchor="middle" fill="#d4634a" font-size="20" font-family="${SVG_FONT_SANS}" font-weight="700">${escapeXml(eventName)} — ${escapeXml(vibes.weekLabel)}</text>
  <text x="${width / 2}" y="54" text-anchor="middle" fill="#9a9188" font-size="13" font-family="${SVG_FONT_SANS}">Weekly reading vibes</text>

  ${statCards}

  <rect x="${leftX}" y="${sectionY}" width="${colW}" height="${panelH}" rx="10" fill="#1a1822" stroke="#2a2733"/>
  <text x="${leftX + 14}" y="${sectionY + 22}" fill="#d4634a" font-size="12" font-family="${SVG_FONT_SANS}" font-weight="700" letter-spacing="0.06em">FORMATS</text>
  ${formatLines}

  <rect x="${rightX}" y="${sectionY}" width="${colW}" height="${panelH}" rx="10" fill="#1a1822" stroke="#2a2733"/>
  <text x="${rightX + 14}" y="${sectionY + 22}" fill="#d4634a" font-size="12" font-family="${SVG_FONT_SANS}" font-weight="700" letter-spacing="0.06em">MOST SABOTAGED</text>
  ${teamLines}
</svg>`
}
