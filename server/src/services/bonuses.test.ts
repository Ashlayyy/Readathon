import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { resolveTeamBonusPrompts } from './prompts.js'
import {
	calculateScore,
	normalizeGlobalBonusFields,
	resolveGlobalBonusId,
	type SubmissionInput,
} from './scoring.js'
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

describe('resolveTeamBonusPrompts', () => {
	it('uses JSON when DB list is empty', () => {
		const json = [{ id: 'a', label: 'A', points: 10 }]
		assert.deepEqual(resolveTeamBonusPrompts(json, []), json)
	})

	it('uses DB only when at least one DB row exists', () => {
		const json = [{ id: 'a', label: 'A', points: 10 }]
		const db = [{ id: 'b', label: 'B', points: 20 }]
		assert.deepEqual(resolveTeamBonusPrompts(json, db), db)
	})
})

describe('resolveGlobalBonusId', () => {
	const globals = [
		{ id: 'competition-trials' },
		{ id: 'dual-timeline' },
	]

	it('prefers explicit id', () => {
		assert.equal(
			resolveGlobalBonusId(
				{ bonusCompetition: true, bonusGlobalPromptId: 'dual-timeline' },
				globals,
			),
			'dual-timeline',
		)
	})

	it('falls back to first global when only bonusCompetition is set', () => {
		assert.equal(
			resolveGlobalBonusId({ bonusCompetition: true }, globals),
			'competition-trials',
		)
	})

	it('returns null when neither is set', () => {
		assert.equal(
			resolveGlobalBonusId({ bonusCompetition: false }, globals),
			null,
		)
	})
})

describe('global bonus scoring', () => {
	const config = getConfig()

	it('scores a non-first global bonus by id', () => {
		const dual = config.globalBonuses.find((g) => g.id === 'dual-timeline')
		assert.ok(dual, 'dual-timeline should exist in config')

		const input: SubmissionInput = {
			bookTitle: 'Two Times',
			bookAuthor: 'Author',
			pageCount: 100,
			format: 'ebook',
			submissionType: 'add',
			promptIds: [],
			bonusCompetition: true,
			bonusGlobalPromptId: 'dual-timeline',
			bonusTeamPromptIds: [],
			startedAt: '2026-07-01',
			finishedAt: '2026-07-02',
		}
		const score = calculateScore(mockUser('wielders'), input)
		assert.ok(score.bonusDetails.some((b) => b.id === 'dual-timeline'))
		assert.equal(
			score.bonusDetails.find((b) => b.id === 'dual-timeline')?.points,
			dual!.points,
		)
	})

	it('normalizeGlobalBonusFields keeps competition flag in sync', () => {
		assert.deepEqual(
			normalizeGlobalBonusFields(
				{ bonusCompetition: false, bonusGlobalPromptId: 'rivals-to-allies' },
				config.globalBonuses,
			),
			{
				bonusGlobalPromptId: 'rivals-to-allies',
				bonusCompetition: true,
			},
		)
		assert.deepEqual(
			normalizeGlobalBonusFields(
				{ bonusCompetition: false, bonusGlobalPromptId: null },
				config.globalBonuses,
			),
			{ bonusGlobalPromptId: null, bonusCompetition: false },
		)
	})
})
