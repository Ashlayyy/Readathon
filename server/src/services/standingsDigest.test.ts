import assert from 'node:assert/strict'
import { describe, it, mock, afterEach, before, after } from 'node:test'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { User } from '../db/models/User.js'
import { connectDb, disconnectDb } from '../db/connect.js'
import { buildDraftText, buildStandingsDigestDraft, type LeaderGap } from './standingsDigest.js'
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

	it('includes competition bonus line when competitionRate is positive', () => {
		const text = buildDraftText({
			weekLabel: 'Busy Week',
			vibes: vibes({ competitionRate: 25 }),
			leaderGap: null,
			notify: { emailCount: 2, discordConfigured: false },
		})
		assert.match(text, /25% of books claimed the competition bonus/)
	})
})

afterEach(() => {
	mock.restoreAll()
})

describe('buildStandingsDigestDraft', () => {
	let mongod: MongoMemoryServer
	const savedUri = process.env.MONGODB_URI

	before(async () => {
		mongod = await MongoMemoryServer.create()
		process.env.MONGODB_URI = mongod.getUri()
		await connectDb()
	})

	after(async () => {
		await disconnectDb()
		await mongod.stop()
		if (savedUri === undefined) delete process.env.MONGODB_URI
		else process.env.MONGODB_URI = savedUri
	})

	it('assembles a draft from an empty database', async () => {
		await User.create({
			displayName: 'Notify Me',
			email: 'notify@example.com',
			status: 'assigned',
			teamId: 'wielders',
			notifyStandings: true,
		})

		const draft = await buildStandingsDigestDraft({ preset: 'last7' })

		assert.equal(draft.notify.emailCount, 1)
		assert.equal(typeof draft.notify.discordConfigured, 'boolean')
		assert.equal(draft.range.preset, 'last7')
		assert.match(draft.draftText, /\*\*.*Vibes\*\*/)
		assert.match(draft.draftText, /Publishing will notify:/)
		assert.ok(Array.isArray(draft.standingsPreview))
		assert.ok(draft.vibes.overview)
	})
})
