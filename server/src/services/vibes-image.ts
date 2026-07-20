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

/** Compact weekly vibes card for Discord + optional web use. */
export function generateVibesSvg(vibes: PublicStandingsVibes): string {
	const eventName = getStaticConfig().event.name as string
	const width = 800
	const rowH = 36
	const teams = [...vibes.dogpile].sort(
		(a, b) => b.damageTaken - a.damageTaken || b.hitCount - a.hitCount,
	)
	const formats = vibes.byFormat.slice(0, 3)
	const bodyStart = 150
	const height = bodyStart + Math.max(teams.length, 1) * rowH + 90

	const o = vibes.overview
	const formatLines = formats
		.map((f, i) => {
			const y = bodyStart + i * 28
			return `<text x="40" y="${y}" fill="#c9c2b8" font-size="14" font-family="${SVG_FONT_SANS}">${escapeXml(f.label)}: ${f.count}</text>`
		})
		.join('\n')

	const teamLines = teams
		.map((t, i) => {
			const y = bodyStart + i * rowH
			return `
      <text x="420" y="${y}" fill="#f4efe8" font-size="15" font-family="${SVG_FONT_SANS}" font-weight="600">${escapeXml(t.teamName)}</text>
      <text x="420" y="${y + 16}" fill="#9a9188" font-size="12" font-family="${SVG_FONT_SANS}">${t.hitCount} hits · −${t.damageTaken} dmg · ${t.booksLogged} books</text>`
		})
		.join('\n')

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#0f0e14"/>
  <text x="400" y="36" text-anchor="middle" fill="#d4634a" font-size="22" font-family="${SVG_FONT_SANS}" font-weight="700">${escapeXml(eventName)} — ${escapeXml(vibes.weekLabel)}</text>
  <text x="400" y="60" text-anchor="middle" fill="#9a9188" font-size="13" font-family="${SVG_FONT_SANS}">Weekly reading vibes (frozen at publish)</text>

  <text x="40" y="100" fill="#f4efe8" font-size="28" font-family="${SVG_FONT_SANS}" font-weight="700">${o.submissions}</text>
  <text x="40" y="120" fill="#9a9188" font-size="12" font-family="${SVG_FONT_SANS}">books · ${o.totalPages} pages · avg ${o.avgPages}</text>

  <text x="220" y="100" fill="#ff8a6a" font-size="28" font-family="${SVG_FONT_SANS}" font-weight="700">${o.chaosRatio}%</text>
  <text x="220" y="120" fill="#9a9188" font-size="12" font-family="${SVG_FONT_SANS}">sabotage · ${o.sabotageCount} atk / ${o.addCount} add</text>

  <text x="400" y="100" fill="#f4efe8" font-size="28" font-family="${SVG_FONT_SANS}" font-weight="700">${o.competitionRate}%</text>
  <text x="400" y="120" fill="#9a9188" font-size="12" font-family="${SVG_FONT_SANS}">competition bonus</text>

  <text x="560" y="100" fill="#f4efe8" font-size="28" font-family="${SVG_FONT_SANS}" font-weight="700">${o.activeReaders}</text>
  <text x="560" y="120" fill="#9a9188" font-size="12" font-family="${SVG_FONT_SANS}">active readers</text>

  <text x="40" y="148" fill="#d4634a" font-size="13" font-family="${SVG_FONT_SANS}" font-weight="700">FORMATS</text>
  ${formatLines || `<text x="40" y="${bodyStart}" fill="#9a9188" font-size="14" font-family="${SVG_FONT_SANS}">No books this week</text>`}

  <text x="420" y="148" fill="#d4634a" font-size="13" font-family="${SVG_FONT_SANS}" font-weight="700">MOST SABOTAGED</text>
  ${teamLines}
</svg>`
}
