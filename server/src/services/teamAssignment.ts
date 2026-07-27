import { getStaticConfig } from '../config.js'
import { User } from '../db/models/User.js'
import { Submission } from '../db/models/Submission.js'
import { TeamAssignmentSet } from '../db/models/TeamAssignmentSet.js'
import { withActive } from '../db/activeSubmission.js'
import mongoose from 'mongoose'
import { getTeamById } from './prompts.js'
import {
	calculateStandings,
	type TeamStanding,
} from './scoring.js'
import {
	calculateStandingsBreakdown,
	type StandingsBreakdown,
} from './standings-breakdown.js'

export type TeamAssignmentRow = {
	userId: string
	displayName: string
	isAdmin: boolean
	currentTeamId: string | null
	proposedTeamId: string
	/** Individual activity that travels with this reader (gain + attack). */
	contribution: number
}

export type TeamAssignmentPreview = {
	assignments: TeamAssignmentRow[]
	standings: TeamStanding[]
	breakdown: StandingsBreakdown
	individuals: {
		userId: string
		displayName: string
		teamId: string
		teamName: string
		xpGained: number
		xpDealt: number
		total: number
	}[]
}

function fisherYatesShuffle<T>(items: T[]): T[] {
	const arr = [...items]
	for (let i = arr.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1))
		;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
	}
	return arr
}

/** Pending + assigned readers; optionally include admins. */
export async function loadAssignableUsers(includeAdmins: boolean) {
	const filter: Record<string, unknown> = {
		status: { $in: ['pending', 'assigned'] },
	}
	if (!includeAdmins) {
		filter.isAdmin = { $ne: true }
	}
	return User.find(filter).sort({ displayName: 1 })
}

/** Per-user activity that follows them to a new team (same basis as individual standings). */
export async function loadUserContributions(
	userIds: string[],
): Promise<Map<string, number>> {
	const totals = new Map<string, number>()
	for (const id of userIds) totals.set(id, 0)
	if (userIds.length === 0) return totals

	const subs = await Submission.find(
		withActive({
			userId: {
				$in: userIds.map((id) => new mongoose.Types.ObjectId(id)),
			},
		}),
	).select('userId submissionType promptPoints bonusPoints pageBonus')

	for (const sub of subs) {
		const id = sub.userId.toString()
		const promptAndBonus = sub.promptPoints + sub.bonusPoints
		let add = 0
		if (sub.submissionType === 'add') {
			add = promptAndBonus + sub.pageBonus
		} else if (sub.submissionType === 'sabotage') {
			add = Math.abs(promptAndBonus) + sub.pageBonus
		} else {
			add = sub.pageBonus
		}
		totals.set(id, (totals.get(id) ?? 0) + add)
	}
	return totals
}

/**
 * Spread readers across teams. **Equal headcount has priority**; among equally
 * sized teams, assign to the one with the lowest contribution total.
 * Highest contributors first so points still spread as evenly as headcount allows.
 */
export function assignBalancedByContribution<
	T extends { _id: { toString(): string } },
>(users: T[], teamIds: string[], contributionByUser: Map<string, number>): Map<string, string> {
	const result = new Map<string, string>()
	if (teamIds.length === 0 || users.length === 0) return result

	const load = teamIds.map(() => ({ points: 0, members: 0 }))

	// Randomize first so equal-contribution ties (and same totals) vary between "Again" runs.
	const ordered = fisherYatesShuffle(users).sort((a, b) => {
		const ca = contributionByUser.get(a._id.toString()) ?? 0
		const cb = contributionByUser.get(b._id.toString()) ?? 0
		return cb - ca
	})

	for (const user of ordered) {
		let best = 0
		for (let i = 1; i < load.length; i++) {
			const cur = load[i]!
			const champ = load[best]!
			// Headcount first — keep team sizes as equal as possible.
			if (cur.members < champ.members) best = i
			else if (cur.members === champ.members && cur.points < champ.points) best = i
		}
		const teamId = teamIds[best]!
		const userId = user._id.toString()
		const pts = contributionByUser.get(userId) ?? 0
		result.set(userId, teamId)
		load[best]!.points += pts
		load[best]!.members += 1
	}

	return result
}

/**
 * Build a points-balanced team proposal (does not write to the DB).
 * Also returns hypothetical standings under that proposal.
 */
export async function previewTeamAssignments(
	includeAdmins: boolean,
): Promise<TeamAssignmentPreview | { error: string }> {
	const teamIds = getStaticConfig().teams.map((t) => t.id)
	if (teamIds.length === 0) {
		return { error: 'No teams configured.' }
	}

	const users = await loadAssignableUsers(includeAdmins)
	if (users.length === 0) {
		return { error: 'No users available to assign.' }
	}

	const userIds = users.map((u) => u._id.toString())
	const contributionByUser = await loadUserContributions(userIds)
	const proposed = assignBalancedByContribution(users, teamIds, contributionByUser)

	const assignments: TeamAssignmentRow[] = users.map((user) => {
		const userId = user._id.toString()
		return {
			userId,
			displayName: user.displayName,
			isAdmin: Boolean(user.isAdmin),
			currentTeamId: user.teamId ?? null,
			proposedTeamId: proposed.get(userId) ?? teamIds[0]!,
			contribution: contributionByUser.get(userId) ?? 0,
		}
	})

	return enrichPreview(assignments)
}

/**
 * Rebuild a full preview from an edited assignment list (manual moves).
 * Keeps display names / contributions in sync with the DB.
 */
export async function enrichFromAssignments(
	updates: ApplyAssignment[],
): Promise<TeamAssignmentPreview | { error: string }> {
	if (!Array.isArray(updates) || updates.length === 0) {
		return { error: 'No assignments to preview.' }
	}

	const normalized: ApplyAssignment[] = []
	for (const u of updates) {
		const userId = typeof u.userId === 'string' ? u.userId.trim() : ''
		const teamId = typeof u.teamId === 'string' ? u.teamId.trim() : ''
		if (!userId || !teamId) {
			return { error: 'Each assignment needs userId and teamId.' }
		}
		if (!getTeamById(teamId)) {
			return { error: `Invalid team: ${teamId}` }
		}
		normalized.push({ userId, teamId })
	}

	const userIds = normalized.map((u) => u.userId)
	const users = await User.find({
		_id: { $in: userIds.map((id) => new mongoose.Types.ObjectId(id)) },
	})
	const userById = new Map(users.map((u) => [u._id.toString(), u]))
	const contributionByUser = await loadUserContributions(userIds)

	const assignments: TeamAssignmentRow[] = []
	for (const entry of normalized) {
		const user = userById.get(entry.userId)
		if (!user) continue
		assignments.push({
			userId: entry.userId,
			displayName: user.displayName,
			isAdmin: Boolean(user.isAdmin),
			currentTeamId: user.teamId ?? null,
			proposedTeamId: entry.teamId,
			contribution: contributionByUser.get(entry.userId) ?? 0,
		})
	}

	if (assignments.length === 0) {
		return { error: 'No valid users in this assignment list.' }
	}

	return enrichPreview(assignments)
}

/**
 * Recompute standings for a manually edited assignment list
 * (keeps current display names / contribution from DB).
 */
export async function enrichFromProposedAssignments(
	updates: ApplyAssignment[],
): Promise<TeamAssignmentPreview | { error: string }> {
	if (!Array.isArray(updates) || updates.length === 0) {
		return { error: 'No assignments to preview.' }
	}

	const normalized: ApplyAssignment[] = []
	for (const u of updates) {
		const userId = typeof u.userId === 'string' ? u.userId.trim() : ''
		const teamId = typeof u.teamId === 'string' ? u.teamId.trim() : ''
		if (!userId || !teamId) {
			return { error: 'Each assignment needs userId and teamId.' }
		}
		if (!getTeamById(teamId)) {
			return { error: `Invalid team: ${teamId}` }
		}
		normalized.push({ userId, teamId })
	}

	const userIds = normalized.map((a) => a.userId)
	const users = await User.find({
		_id: { $in: userIds.map((id) => new mongoose.Types.ObjectId(id)) },
	})
	const userById = new Map(users.map((u) => [u._id.toString(), u]))
	const contributionByUser = await loadUserContributions(userIds)

	const assignments: TeamAssignmentRow[] = []
	for (const entry of normalized) {
		const user = userById.get(entry.userId)
		if (!user) continue
		assignments.push({
			userId: entry.userId,
			displayName: user.displayName,
			isAdmin: Boolean(user.isAdmin),
			currentTeamId: user.teamId ?? null,
			proposedTeamId: entry.teamId,
			contribution: contributionByUser.get(entry.userId) ?? 0,
		})
	}

	if (assignments.length === 0) {
		return { error: 'No valid users in assignments.' }
	}

	return enrichPreview(assignments)
}

/** Standings/breakdown for an existing proposal (e.g. after toggle). */
export async function enrichPreview(
	assignments: TeamAssignmentRow[],
): Promise<TeamAssignmentPreview> {
	const override = new Map<string, string>()
	for (const a of assignments) {
		override.set(a.userId, a.proposedTeamId)
	}

	// Keep current teams for people not in this shuffle (e.g. admins when excluded).
	const assignedIds = new Set(assignments.map((a) => a.userId))
	const others = await User.find({
		status: 'assigned',
		teamId: { $ne: null },
	}).select('_id teamId')
	for (const u of others) {
		const id = u._id.toString()
		if (assignedIds.has(id) || !u.teamId) continue
		override.set(id, u.teamId)
	}

	const [standings, breakdown] = await Promise.all([
		calculateStandings(override),
		calculateStandingsBreakdown(override),
	])

	const individuals = breakdown.teams
		.flatMap((team) =>
			team.members.map((m) => ({
				userId: m.userId,
				displayName: m.displayName,
				teamId: team.teamId,
				teamName: team.teamName,
				xpGained: m.xpGained,
				xpDealt: m.xpDealt,
				total: m.xpGained + m.xpDealt,
			})),
		)
		.sort((a, b) => {
			if (b.total !== a.total) return b.total - a.total
			if (b.xpDealt !== a.xpDealt) return b.xpDealt - a.xpDealt
			return a.displayName.localeCompare(b.displayName)
		})

	return { assignments, standings, breakdown, individuals }
}

export type ApplyAssignment = { userId: string; teamId: string }

export async function applyTeamAssignments(
	updates: ApplyAssignment[],
): Promise<{ assigned: number } | { error: string }> {
	if (!Array.isArray(updates) || updates.length === 0) {
		return { error: 'No assignments to apply.' }
	}

	const normalized: ApplyAssignment[] = []
	for (const u of updates) {
		const userId = typeof u.userId === 'string' ? u.userId.trim() : ''
		const teamId = typeof u.teamId === 'string' ? u.teamId.trim() : ''
		if (!userId || !teamId) {
			return { error: 'Each assignment needs userId and teamId.' }
		}
		if (!getTeamById(teamId)) {
			return { error: `Invalid team: ${teamId}` }
		}
		normalized.push({ userId, teamId })
	}

	await Promise.all(
		normalized.map((u) =>
			User.findByIdAndUpdate(u.userId, {
				teamId: u.teamId,
				status: 'assigned',
			}),
		),
	)

	return { assigned: normalized.length }
}

/** @deprecated Prefer preview + apply. Kept for simple one-shot assign of pending only. */
export async function assignTeamsRandomly(): Promise<{ assigned: number }> {
	const pending = await User.find({ status: 'pending', isAdmin: { $ne: true } })
	if (pending.length === 0) return { assigned: 0 }

	const teamIds = getStaticConfig().teams.map((t) => t.id)
	if (teamIds.length === 0) return { assigned: 0 }

	const shuffled = fisherYatesShuffle(pending)
	await Promise.all(
		shuffled.map((user, i) =>
			User.findByIdAndUpdate(user._id, {
				teamId: teamIds[i % teamIds.length],
				status: 'assigned',
			}),
		),
	)
	return { assigned: shuffled.length }
}

export const ASSIGNMENT_SET_SLOTS = [1, 2, 3] as const
export type AssignmentSetSlot = (typeof ASSIGNMENT_SET_SLOTS)[number]

export type SavedAssignmentSetSummary = {
	slot: AssignmentSetSlot
	label: string
	includeAdmins: boolean
	savedAt: string | null
	count: number
	empty: boolean
}

function isSlot(n: number): n is AssignmentSetSlot {
	return n === 1 || n === 2 || n === 3
}

async function ensureAssignmentSetSlots(): Promise<void> {
	await Promise.all(
		ASSIGNMENT_SET_SLOTS.map((slot) =>
			TeamAssignmentSet.updateOne(
				{ slot },
				{ $setOnInsert: { slot, label: '', includeAdmins: false, assignments: [], savedAt: null } },
				{ upsert: true },
			),
		),
	)
}

export async function listAssignmentSets(): Promise<SavedAssignmentSetSummary[]> {
	await ensureAssignmentSetSlots()
	const rows = await TeamAssignmentSet.find({ slot: { $in: [...ASSIGNMENT_SET_SLOTS] } }).sort({
		slot: 1,
	})
	const bySlot = new Map(rows.map((r) => [r.slot, r]))
	return ASSIGNMENT_SET_SLOTS.map((slot) => {
		const row = bySlot.get(slot)
		const count = row?.assignments?.length ?? 0
		return {
			slot,
			label: row?.label?.trim() || `Set ${slot}`,
			includeAdmins: Boolean(row?.includeAdmins),
			savedAt: row?.savedAt ? row.savedAt.toISOString() : null,
			count,
			empty: count === 0,
		}
	})
}

export async function saveAssignmentSet(
	slot: number,
	input: {
		label?: string
		includeAdmins?: boolean
		assignments: ApplyAssignment[]
	},
): Promise<SavedAssignmentSetSummary | { error: string }> {
	if (!isSlot(slot)) return { error: 'Slot must be 1, 2, or 3.' }
	if (!Array.isArray(input.assignments) || input.assignments.length === 0) {
		return { error: 'Nothing to save — generate a preview first.' }
	}

	const normalized: ApplyAssignment[] = []
	for (const u of input.assignments) {
		const userId = typeof u.userId === 'string' ? u.userId.trim() : ''
		const teamId = typeof u.teamId === 'string' ? u.teamId.trim() : ''
		if (!userId || !teamId) {
			return { error: 'Each assignment needs userId and teamId.' }
		}
		if (!getTeamById(teamId)) {
			return { error: `Invalid team: ${teamId}` }
		}
		normalized.push({ userId, teamId })
	}

	const label =
		typeof input.label === 'string' && input.label.trim()
			? input.label.trim().slice(0, 80)
			: `Set ${slot}`

	await TeamAssignmentSet.findOneAndUpdate(
		{ slot },
		{
			$set: {
				label,
				includeAdmins: Boolean(input.includeAdmins),
				assignments: normalized,
				savedAt: new Date(),
			},
		},
		{ upsert: true },
	)

	const sets = await listAssignmentSets()
	return sets.find((s) => s.slot === slot)!
}

export async function clearAssignmentSet(
	slot: number,
): Promise<SavedAssignmentSetSummary | { error: string }> {
	if (!isSlot(slot)) return { error: 'Slot must be 1, 2, or 3.' }
	await TeamAssignmentSet.findOneAndUpdate(
		{ slot },
		{
			$set: {
				label: `Set ${slot}`,
				includeAdmins: false,
				assignments: [],
				savedAt: null,
			},
		},
		{ upsert: true },
	)
	const sets = await listAssignmentSets()
	return sets.find((s) => s.slot === slot)!
}

/** Hydrate a saved set into a full preview (current names, contributions, standings). */
export async function previewAssignmentSet(
	slot: number,
): Promise<TeamAssignmentPreview | { error: string }> {
	if (!isSlot(slot)) return { error: 'Slot must be 1, 2, or 3.' }
	await ensureAssignmentSetSlots()
	const row = await TeamAssignmentSet.findOne({ slot })
	if (!row || !row.assignments?.length) {
		return { error: `Set ${slot} is empty.` }
	}

	const userIds = row.assignments.map((a) => a.userId)
	const users = await User.find({
		_id: { $in: userIds.map((id) => new mongoose.Types.ObjectId(id)) },
	})
	const userById = new Map(users.map((u) => [u._id.toString(), u]))
	const contributionByUser = await loadUserContributions(userIds)

	const assignments: TeamAssignmentRow[] = []
	for (const entry of row.assignments) {
		if (!getTeamById(entry.teamId)) continue
		const user = userById.get(entry.userId)
		if (!user) continue
		assignments.push({
			userId: entry.userId,
			displayName: user.displayName,
			isAdmin: Boolean(user.isAdmin),
			currentTeamId: user.teamId ?? null,
			proposedTeamId: entry.teamId,
			contribution: contributionByUser.get(entry.userId) ?? 0,
		})
	}

	if (assignments.length === 0) {
		return { error: `Set ${slot} has no valid users left.` }
	}

	return enrichPreview(assignments)
}

export async function applyAssignmentSet(
	slot: number,
): Promise<{ assigned: number } | { error: string }> {
	if (!isSlot(slot)) return { error: 'Slot must be 1, 2, or 3.' }
	const row = await TeamAssignmentSet.findOne({ slot })
	if (!row || !row.assignments?.length) {
		return { error: `Set ${slot} is empty.` }
	}
	return applyTeamAssignments(
		row.assignments.map((a) => ({ userId: a.userId, teamId: a.teamId })),
	)
}
