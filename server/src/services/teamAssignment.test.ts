import assert from 'node:assert/strict'
import { describe, it, before, after, beforeEach } from 'node:test'
import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'
import { User } from '../db/models/User.js'
import { Submission } from '../db/models/Submission.js'
import {
	previewTeamAssignments,
	applyTeamAssignments,
} from './teamAssignment.js'

describe('teamAssignment', () => {
	let mongo: MongoMemoryServer

	before(async () => {
		mongo = await MongoMemoryServer.create()
		await mongoose.connect(mongo.getUri())
	})

	after(async () => {
		await mongoose.disconnect()
		await mongo.stop()
	})

	beforeEach(async () => {
		await Promise.all([User.deleteMany({}), Submission.deleteMany({})])
	})

	it('previews a balanced shuffle without writing', async () => {
		await User.create([
			{ displayName: 'A', email: 'a@t.com', status: 'pending', isAdmin: false },
			{ displayName: 'B', email: 'b@t.com', status: 'pending', isAdmin: false },
			{ displayName: 'C', email: 'c@t.com', status: 'assigned', teamId: 'riders', isAdmin: false },
			{ displayName: 'Admin', email: 'admin@t.com', status: 'assigned', teamId: 'riders', isAdmin: true },
		])

		const preview = await previewTeamAssignments(false)
		assert.ok(!('error' in preview))
		assert.equal(preview.assignments.length, 3)
		assert.ok(preview.assignments.every((a) => !a.isAdmin))
		assert.ok(preview.standings.length > 0)

		const stillPending = await User.countDocuments({ status: 'pending' })
		assert.equal(stillPending, 2)
	})

	it('includeAdmins adds admins to the shuffle', async () => {
		await User.create([
			{ displayName: 'A', email: 'a@t.com', status: 'assigned', teamId: 'riders', isAdmin: false },
			{ displayName: 'Admin', email: 'admin@t.com', status: 'assigned', teamId: 'riders', isAdmin: true },
		])

		const without = await previewTeamAssignments(false)
		assert.ok(!('error' in without))
		assert.equal(without.assignments.length, 1)

		const withAdmins = await previewTeamAssignments(true)
		assert.ok(!('error' in withAdmins))
		assert.equal(withAdmins.assignments.length, 2)
	})

	it('balances contribution points across teams', async () => {
		const users = await User.create([
			{ displayName: 'Heavy', email: 'h@t.com', status: 'assigned', teamId: 'riders', isAdmin: false },
			{ displayName: 'Mid', email: 'm@t.com', status: 'assigned', teamId: 'riders', isAdmin: false },
			{ displayName: 'Light', email: 'l@t.com', status: 'assigned', teamId: 'riders', isAdmin: false },
		])

		await Submission.create([
			{
				userId: users[0]!._id,
				bookTitle: 'H',
				bookAuthor: 'A',
				pageCount: 100,
				format: 'physical',
				submissionType: 'add',
				promptIds: [],
				bonusCompetition: false,
				bonusTeamPromptIds: [],
				promptPoints: 90,
				bonusPoints: 0,
				pageBonus: 10,
				totalImpact: 100,
			},
			{
				userId: users[1]!._id,
				bookTitle: 'M',
				bookAuthor: 'A',
				pageCount: 100,
				format: 'physical',
				submissionType: 'add',
				promptIds: [],
				bonusCompetition: false,
				bonusTeamPromptIds: [],
				promptPoints: 40,
				bonusPoints: 0,
				pageBonus: 10,
				totalImpact: 50,
			},
			{
				userId: users[2]!._id,
				bookTitle: 'L',
				bookAuthor: 'A',
				pageCount: 100,
				format: 'physical',
				submissionType: 'add',
				promptIds: [],
				bonusCompetition: false,
				bonusTeamPromptIds: [],
				promptPoints: 0,
				bonusPoints: 0,
				pageBonus: 10,
				totalImpact: 10,
			},
		])

		const preview = await previewTeamAssignments(false)
		assert.ok(!('error' in preview))

		const byTeam = new Map<string, number>()
		for (const a of preview.assignments) {
			byTeam.set(a.proposedTeamId, (byTeam.get(a.proposedTeamId) ?? 0) + a.contribution)
		}
		const totals = [...byTeam.values()]
		const max = Math.max(...totals)
		const min = Math.min(...totals)
		// 100 / 50 / 10 across 3 teams → greedy puts them on different teams; spread ≤ 100-10 if 2 share, but with 3 teams should be one each → max-min = 90
		assert.ok(max - min <= 90)
		assert.equal(new Set(preview.assignments.map((a) => a.proposedTeamId)).size, 3)

		const counts = new Map<string, number>()
		for (const a of preview.assignments) {
			counts.set(a.proposedTeamId, (counts.get(a.proposedTeamId) ?? 0) + 1)
		}
		assert.deepEqual([...counts.values()].sort(), [1, 1, 1])
	})

	it('keeps headcount equal before balancing points', async () => {
		const users = await User.create(
			Array.from({ length: 6 }, (_, i) => ({
				displayName: `U${i}`,
				email: `u${i}@t.com`,
				status: 'assigned' as const,
				teamId: 'riders',
				isAdmin: false,
			})),
		)

		// One very high scorer — must not pull extra teammates onto their team.
		await Submission.create({
			userId: users[0]!._id,
			bookTitle: 'H',
			bookAuthor: 'A',
			pageCount: 100,
			format: 'physical',
			submissionType: 'add',
			promptIds: [],
			bonusCompetition: false,
			bonusTeamPromptIds: [],
			promptPoints: 500,
			bonusPoints: 0,
			pageBonus: 0,
			totalImpact: 500,
		})

		const preview = await previewTeamAssignments(false)
		assert.ok(!('error' in preview))

		const counts = new Map<string, number>()
		for (const a of preview.assignments) {
			counts.set(a.proposedTeamId, (counts.get(a.proposedTeamId) ?? 0) + 1)
		}
		assert.deepEqual([...counts.values()].sort(), [2, 2, 2])
	})

	it('apply writes proposed teams', async () => {
		const users = await User.create([
			{ displayName: 'A', email: 'a@t.com', status: 'pending', isAdmin: false },
			{ displayName: 'B', email: 'b@t.com', status: 'pending', isAdmin: false },
		])

		const result = await applyTeamAssignments([
			{ userId: users[0]!._id.toString(), teamId: 'riders' },
			{ userId: users[1]!._id.toString(), teamId: 'wielders' },
		])
		assert.ok(!('error' in result))
		assert.equal(result.assigned, 2)

		const a = await User.findById(users[0]!._id)
		const b = await User.findById(users[1]!._id)
		assert.equal(a?.teamId, 'riders')
		assert.equal(a?.status, 'assigned')
		assert.equal(b?.teamId, 'wielders')
	})

	it('saves, previews, and applies assignment sets', async () => {
		const { TeamAssignmentSet } = await import('../db/models/TeamAssignmentSet.js')
		const {
			saveAssignmentSet,
			listAssignmentSets,
			previewAssignmentSet,
			applyAssignmentSet,
			clearAssignmentSet,
		} = await import('./teamAssignment.js')

		await TeamAssignmentSet.deleteMany({})
		const users = await User.create([
			{ displayName: 'A', email: 'a2@t.com', status: 'pending', isAdmin: false },
			{ displayName: 'B', email: 'b2@t.com', status: 'pending', isAdmin: false },
		])

		const saved = await saveAssignmentSet(1, {
			label: 'Option A',
			includeAdmins: false,
			assignments: [
				{ userId: users[0]!._id.toString(), teamId: 'riders' },
				{ userId: users[1]!._id.toString(), teamId: 'wielders' },
			],
		})
		assert.ok(!('error' in saved))
		assert.equal(saved.count, 2)
		assert.equal(saved.label, 'Option A')

		const listed = await listAssignmentSets()
		assert.equal(listed.length, 3)
		assert.equal(listed[0]!.empty, false)
		assert.equal(listed[1]!.empty, true)

		const preview = await previewAssignmentSet(1)
		assert.ok(!('error' in preview))
		assert.equal(preview.assignments.length, 2)

		const applied = await applyAssignmentSet(1)
		assert.ok(!('error' in applied))
		assert.equal(applied.assigned, 2)

		const a = await User.findById(users[0]!._id)
		assert.equal(a?.teamId, 'riders')

		const cleared = await clearAssignmentSet(1)
		assert.ok(!('error' in cleared))
		assert.equal(cleared.empty, true)
	})
})
