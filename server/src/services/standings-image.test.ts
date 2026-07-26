import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { generateStandingsSvg, getStandingsImageTitle } from './standings-image.js'
import { getStaticConfig } from '../config.js'
import type { TeamStanding } from './scoring.js'

function standing(partial: Partial<TeamStanding> & Pick<TeamStanding, 'teamId' | 'teamName'>): TeamStanding {
	return {
		icon: '◆',
		color: '#888',
		memberCount: 5,
		xpGained: 100,
		xpDealt: 20,
		xpLost: 10,
		netXp: 90,
		totalTeamXp: 500,
		averagePerMember: 18,
		...partial,
	}
}

describe('standings image', () => {
	it('getStandingsImageTitle combines event name and week label', () => {
		const eventName = getStaticConfig().event.name as string
		assert.equal(getStandingsImageTitle('Week of Jul 13, 2026'), `${eventName} - Week of Jul 13, 2026`)
	})

	it('uses starting-pool subtitle when fewer than two teams', () => {
		const svg = generateStandingsSvg(
			[standing({ teamId: 'solo', teamName: 'Solo Realm', memberCount: 0 })],
			'Quiet Week',
		)
		assert.match(svg, /starting pool per realm/)
		assert.match(svg, /No members assigned yet/)
	})

	it('shows leader gap and trailing detail lines for multi-team standings', () => {
		const svg = generateStandingsSvg(
			[
				standing({
					teamId: 'a',
					teamName: 'Alpha',
					totalTeamXp: 800,
					memberCount: 8,
					xpGained: 200,
					xpDealt: 50,
				}),
				standing({
					teamId: 'b',
					teamName: 'Beta',
					totalTeamXp: 650,
					memberCount: 6,
					xpGained: 150,
					xpDealt: 30,
				}),
			],
			'Week of Jul 13, 2026',
		)

		assert.match(svg, /Alpha leads by 150 team points/)
		assert.match(svg, /150 points ahead/)
		assert.match(svg, /150 points behind leader/)
		assert.match(svg, /#1 Alpha ★/)
	})

	it('escapes XML in team names', () => {
		const svg = generateStandingsSvg(
			[standing({ teamId: 'x', teamName: 'Team <bad> & "Co"' })],
			'Week <test>',
		)
		assert.match(svg, /Team &lt;bad&gt; &amp; &quot;Co&quot;/)
	})
})
