import assert from 'node:assert/strict'
import { describe, it, mock, afterEach } from 'node:test'
import mongoose from 'mongoose'
import { User } from '../db/models/User.js'
import { Submission } from '../db/models/Submission.js'
import { calculateStandingsBreakdown } from './standings-breakdown.js'
import { getStaticConfig } from '../config.js'

const userA = new mongoose.Types.ObjectId()
const userB = new mongoose.Types.ObjectId()
const teams = getStaticConfig().teams
const teamA = teams[0]!
const teamB = teams[1]!

afterEach(() => {
	mock.restoreAll()
})

describe('calculateStandingsBreakdown', () => {
	it('aggregates add and sabotage stats per member and team attacks', async () => {
		mock.method(User, 'find', async () => [
			{
				_id: userA,
				displayName: 'Alice',
				teamId: teamA.id,
				status: 'assigned',
			},
			{
				_id: userB,
				displayName: 'Bob',
				teamId: teamB.id,
				status: 'assigned',
			},
		])

		mock.method(Submission, 'find', async () => [
			{
				userId: userA,
				submissionType: 'add',
				promptPoints: 50,
				bonusPoints: 10,
				pageBonus: 5,
				targetTeamId: null,
			},
			{
				userId: userB,
				submissionType: 'sabotage',
				promptPoints: -20,
				bonusPoints: 0,
				pageBonus: 2,
				targetTeamId: teamA.id,
			},
			{
				userId: userB,
				submissionType: 'sabotage',
				promptPoints: -10,
				bonusPoints: 0,
				pageBonus: 0,
				targetTeamId: teamA.id,
			},
		])

		const result = await calculateStandingsBreakdown()
		const wielders = result.teams.find((t) => t.teamId === teamA.id)!
		const riders = result.teams.find((t) => t.teamId === teamB.id)!

		const alice = wielders.members.find((m) => m.displayName === 'Alice')!
		assert.equal(alice.xpGained, 65)
		assert.equal(alice.addCount, 1)

		const bob = riders.members.find((m) => m.displayName === 'Bob')!
		assert.equal(bob.xpDealt, 30)
		assert.equal(bob.sabotageCount, 2)
		assert.equal(bob.xpGained, 2)

		assert.equal(wielders.attacksFromOthers.length, 1)
		assert.equal(wielders.attacksFromOthers[0]!.displayName, 'Bob')
		assert.equal(wielders.attacksFromOthers[0]!.damage, 30)
	})
})
