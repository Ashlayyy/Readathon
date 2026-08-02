import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { generateVibesSvg } from './vibes-image.js'
import { getStaticConfig } from '../config.js'
import type { PublicStandingsVibes } from './adminAnalytics.js'

function vibesFixture(): PublicStandingsVibes {
	return {
		weekKey: '2026-W29',
		weekLabel: 'Week of Jul 13, 2026',
		rangeLabel: 'Jul 13 - Jul 19',
		overview: {
			submissions: 10,
			activeReaders: 6,
			addCount: 7,
			sabotageCount: 3,
			chaosRatio: 30,
			competitionRate: 15,
			avgPages: 250,
			totalPages: 2500,
		},
		byType: [],
		byFormat: [
			{ id: 'paperback', label: 'Paperback', count: 4 },
			{ id: 'ebook', label: 'Ebook', count: 3 },
		],
		byPageTier: [],
		dogpile: [
			{
				teamId: 'moon',
				teamName: 'Moon',
				damageTaken: 120,
				hitCount: 5,
				booksLogged: 8,
			},
			{
				teamId: 'sun',
				teamName: 'Sun',
				damageTaken: 40,
				hitCount: 2,
				booksLogged: 6,
			},
		],
		byTeam: [],
	}
}

describe('generateVibesSvg', () => {
	it('includes event name, week label, formats, and sabotage panel', () => {
		const svg = generateVibesSvg(vibesFixture())
		const eventName = getStaticConfig().event.name as string

		assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
		assert.match(svg, new RegExp(`${eventName} - Week of Jul 13, 2026`))
		assert.match(svg, />FORMATS</)
		assert.match(svg, />MOST SABOTAGED</)
		assert.match(svg, />Paperback</)
		assert.match(svg, />Moon</)
		assert.match(svg, /Weekly reading vibes/)
	})

	it('escapes XML in user-facing labels', () => {
		const svg = generateVibesSvg({
			...vibesFixture(),
			weekLabel: 'Week <script>',
			byFormat: [{ id: 'ab', label: 'A & B', count: 1 }],
			dogpile: [
				{
					teamId: 'x',
					teamName: 'Team "Quotes"',
					damageTaken: 1,
					hitCount: 1,
					booksLogged: 1,
				},
			],
		})

		assert.doesNotMatch(svg, /<script>/)
		assert.match(svg, /Week &lt;script&gt;/)
		assert.match(svg, /A &amp; B/)
		assert.match(svg, /Team &quot;Quotes&quot;/)
	})
})
