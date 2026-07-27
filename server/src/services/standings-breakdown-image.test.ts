import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { generateBreakdownSvg } from './standings-breakdown-image.js'
import { getStaticConfig } from '../config.js'
import type { StandingsBreakdown } from './standings-breakdown.js'

function breakdownFixture(): StandingsBreakdown {
	return {
		teams: [
			{
				teamId: 'wielders',
				teamName: 'Wielders',
				color: '#d4634a',
				icon: '⚔',
				members: [
					{
						userId: 'u1',
						displayName: 'Ash',
						xpGained: 120,
						xpDealt: 30,
						addCount: 2,
						sabotageCount: 1,
					},
					{
						userId: 'u2',
						displayName: 'Zero Dealt',
						xpGained: 50,
						xpDealt: 0,
						addCount: 1,
						sabotageCount: 0,
					},
				],
				attacksFromOthers: [
					{
						userId: 'x1',
						displayName: 'Rival Reader',
						attackerTeamId: 'riders',
						attackerTeamName: 'Riders',
						damage: 45,
					},
				],
			},
			{
				teamId: 'riders',
				teamName: 'Riders',
				color: '#4a90d4',
				icon: '🐎',
				members: [],
				attacksFromOthers: [],
			},
		],
	}
}

describe('generateBreakdownSvg', () => {
	it('includes event name, week label, members, and attack section', () => {
		const svg = generateBreakdownSvg(breakdownFixture(), 'Week of Jul 13, 2026')
		const eventName = getStaticConfig().event.name as string

		assert.match(svg, /^<\?xml version="1\.0"/)
		assert.match(svg, new RegExp(`${eventName} - Week of Jul 13, 2026 · Score breakdown`))
		assert.match(svg, />Wielders</)
		assert.match(svg, />Ash</)
		assert.match(svg, />Attacked by rivals</)
		assert.match(svg, />Rival Reader \(Riders\)/)
		assert.match(svg, />No members assigned yet</)
	})

	it('escapes XML in names and shows zero dealt as 0', () => {
		const svg = generateBreakdownSvg(
			{
				teams: [
					{
						teamId: 'x',
						teamName: 'Team <script>',
						color: '#888',
						icon: '◆',
						members: [
							{
								userId: 'u',
								displayName: 'A & B',
								xpGained: 10,
								xpDealt: 0,
								addCount: 1,
								sabotageCount: 0,
							},
						],
						attacksFromOthers: [],
					},
				],
			},
			'Week "Quotes"',
		)

		assert.doesNotMatch(svg, /<script>/)
		assert.match(svg, /Team &lt;script&gt;/)
		assert.match(svg, /A &amp; B/)
		assert.match(svg, />0</)
	})
})
