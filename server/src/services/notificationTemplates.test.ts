import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
	answerNotificationEmail,
	standingsNotificationEmail,
} from './notificationTemplates.js'
import type { PublicStandingsVibes } from './adminAnalytics.js'
import type { TeamStanding } from './scoring.js'

function vibes(): PublicStandingsVibes {
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
		},
		byType: [],
		byFormat: [],
		byPageTier: [],
		dogpile: [],
		byTeam: [],
	}
}

function standings(): TeamStanding[] {
	return [
		{
			teamId: 'sun',
			teamName: 'Sun',
			memberCount: 5,
			xpGained: 100,
			xpDealt: 20,
			xpLost: 10,
			netXp: 90,
			totalTeamXp: 500,
			averagePerMember: 100,
			color: '#fff',
			icon: 'sun',
		},
		{
			teamId: 'moon',
			teamName: 'Moon',
			memberCount: 4,
			xpGained: 80,
			xpDealt: 15,
			xpLost: 5,
			netXp: 75,
			totalTeamXp: 420,
			averagePerMember: 105,
			color: '#ccc',
			icon: 'moon',
		},
	]
}

describe('answerNotificationEmail', () => {
	it('builds subject, html, and text with question and answer content', () => {
		const result = answerNotificationEmail({
			displayName: 'Ash',
			question: 'How do bonuses work?',
			answer: 'Stack them on one book.',
			adminName: 'Mod',
			profileUrl: 'https://app.example/profile?tab=questions',
		})

		assert.match(result.subject, /./)
		assert.match(result.html, /How do bonuses work\?/)
		assert.match(result.html, /Stack them on one book\./)
		assert.match(result.html, /Mod/)
		assert.match(result.text, /Ash/)
		assert.match(result.text, /profile\?tab=questions/)
	})
})

describe('standingsNotificationEmail', () => {
	it('includes week label, leader gap, vibes stats, and standings link', () => {
		const weekLabel = 'Week of Jul 13, 2026'
		const standingsUrl = 'https://app.example/standings'
		const result = standingsNotificationEmail({
			weekLabel,
			standingsUrl,
			vibes: vibes(),
			standings: standings(),
		})

		assert.match(result.subject, /Week of Jul 13, 2026/)
		assert.match(result.html, /Sun/)
		assert.match(result.html, /80 XP/)
		assert.match(result.html, /12/)
		assert.match(result.html, /25%/)
		assert.match(result.text, /Sun leads by 80 XP over Moon/)
		assert.match(result.text, /View standings: https:\/\/app\.example\/standings/)
	})

	it('works without optional vibes or standings', () => {
		const result = standingsNotificationEmail({
			weekLabel: 'Week of Jul 13, 2026',
			standingsUrl: 'https://app.example/standings',
		})

		assert.match(result.subject, /Week of Jul 13, 2026/)
		assert.doesNotMatch(result.text, /leads by/)
		assert.match(result.text, /View standings:/)
	})
})
