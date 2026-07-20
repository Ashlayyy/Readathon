import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildDraftText, type LeaderGap } from './standingsDigest.js'
import type { PublicStandingsVibes } from './adminAnalytics.js'

function vibes(partial: Partial<PublicStandingsVibes['overview']> = {}): PublicStandingsVibes {
	return {
		weekKey: '2026-W29',
		weekLabel: 'Week of Jul 13, 2026',
		rangeLabel: 'This week',
		overview: {
			submissions: 12,
			activeReaders: 8,
			addCount: 9,
			sabotageCount: 3,
			chaosRatio: 25,
			competitionRate: 10,
			avgPages: 320,
			totalPages: 3840,
			...partial,
		},
		byType: [],
		byFormat: [],
		byPageTier: [],
		dogpile: [],
		byTeam: [],
	}
}

describe('buildDraftText', () => {
	it('includes week label, book count, sabotage rate, and notify line', () => {
		const text = buildDraftText({
			weekLabel: 'Week of Jul 13, 2026',
			vibes: vibes(),
			leaderGap: {
				leaderTeamName: 'Sun',
				secondTeamName: 'Moon',
				gapXp: 42,
			},
			notify: { emailCount: 5, discordConfigured: true },
		})

		assert.match(text, /\*\*Week of Jul 13, 2026 Vibes\*\*/)
		assert.match(text, /Sun.*leads by \*\*42 XP\*\*.*Moon/)
		assert.match(text, /12 books logged/)
		assert.match(text, /25% sabotage rate/)
		assert.match(text, /5 emails \+ Discord/)
	})

	it('uses singular grammar for one book / one attack', () => {
		const text = buildDraftText({
			weekLabel: 'Quiet Week',
			vibes: vibes({
				submissions: 1,
				addCount: 1,
				sabotageCount: 1,
				chaosRatio: 100,
				competitionRate: 0,
				avgPages: 100,
				totalPages: 100,
			}),
			leaderGap: null,
			notify: { emailCount: 1, discordConfigured: false },
		})

		assert.match(text, /1 book logged/)
		assert.match(text, /1 attack vs 1 add/)
		assert.doesNotMatch(text, /competition bonus/)
		assert.match(text, /1 email\./)
		assert.doesNotMatch(text, /Discord/)
	})

	it('omits leader gap when there is no second place', () => {
		const gap: LeaderGap = null
		const text = buildDraftText({
			weekLabel: 'Solo',
			vibes: vibes({ submissions: 0, addCount: 0, sabotageCount: 0, chaosRatio: 0 }),
			leaderGap: gap,
			notify: { emailCount: 0, discordConfigured: false },
		})
		assert.doesNotMatch(text, /leads by/)
	})
})
