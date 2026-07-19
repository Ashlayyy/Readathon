import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { pageCountBonus } from '../config.js'
import { calculateScore, type SubmissionInput } from './scoring.js'
import { getConfig } from './prompts.js'
import type { HydratedDocument } from 'mongoose'
import type { IUser } from '../db/models/User.js'

function mockUser(teamId: string): HydratedDocument<IUser> {
	return {
		_id: { toString: () => 'user1' } as IUser['_id'],
		teamId,
		status: 'assigned',
		displayName: 'Test',
		email: 'test@example.com',
	} as HydratedDocument<IUser>
}

describe('pageCountBonus', () => {
	it('returns 0 for very short books', () => {
		assert.equal(pageCountBonus(1), 0)
	})

	it('returns a positive bonus inside a configured tier', () => {
		const mid = pageCountBonus(250)
		assert.ok(mid > 0)
	})

	it('never returns a negative bonus', () => {
		for (const pages of [0, 50, 100, 200, 400, 800, 2000]) {
			assert.ok(pageCountBonus(pages) >= 0)
		}
	})
})

describe('calculateScore extras', () => {
	const config = getConfig()
	const positivePrompt = config.prompts.positive[0]!
	const negativePrompt = config.prompts.negative[0]!

	it('add total equals prompts + bonuses + page bonus', () => {
		const input: SubmissionInput = {
			bookTitle: 'Sum Check',
			bookAuthor: 'Author',
			pageCount: 300,
			format: 'physical',
			submissionType: 'add',
			promptIds: [positivePrompt.id],
			bonusCompetition: false,
			bonusTeamPromptIds: [],
		}
		const score = calculateScore(mockUser('clerics'), input)
		assert.equal(
			score.totalImpact,
			score.promptPoints + score.bonusPoints + score.pageBonus,
		)
	})

	it('sabotage uses negative prompt points while page bonus stays non-negative', () => {
		const input: SubmissionInput = {
			bookTitle: 'Attack',
			bookAuthor: 'Author',
			pageCount: 300,
			format: 'physical',
			submissionType: 'sabotage',
			targetTeamId: 'rogues',
			promptIds: [negativePrompt.id],
			bonusCompetition: false,
			bonusTeamPromptIds: [],
		}
		const score = calculateScore(mockUser('clerics'), input)
		assert.ok(score.promptPoints < 0)
		assert.ok(score.pageBonus >= 0)
		assert.equal(
			score.totalImpact,
			score.promptPoints + score.bonusPoints + score.pageBonus,
		)
	})
})
