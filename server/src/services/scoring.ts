import { pageCountBonus } from '../config.js';
import { getConfigWithPrompts, getPromptById, getTeamById } from './prompts.js';
import { type HydratedDocument } from 'mongoose';
import { type IUser, User } from '../db/models/User.js';
import { Submission, type ISubmission } from '../db/models/Submission.js';
import { withActive } from '../db/activeSubmission.js';
import { isAllowedCoverUrl } from './covers.js';

export type SubmissionInput = {
	bookTitle: string;
	bookAuthor: string;
	pageCount: number;
	format: string;
	coverUrl?: string | null;
	startedAt?: string | null;
	finishedAt?: string | null;
	submissionType: 'add' | 'sabotage';
	targetTeamId?: string;
	promptIds: string[];
	bonusCompetition: boolean;
	bonusTeamPromptIds: string[];
};

function normalizeBook(title: string, author: string) {
	return {
		title: title.trim().toLowerCase(),
		author: author.trim().toLowerCase(),
	};
}

/** Exported for unit tests + duplicate-check helpers. */
export function booksMatch(
	a: { bookTitle: string; bookAuthor: string },
	b: { bookTitle: string; bookAuthor: string },
): boolean {
	const na = normalizeBook(a.bookTitle, a.bookAuthor);
	const nb = normalizeBook(b.bookTitle, b.bookAuthor);
	return na.title === nb.title && na.author === nb.author;
}

export async function findDuplicateSubmission(
	userId: import('mongoose').Types.ObjectId,
	bookTitle: string,
	bookAuthor: string,
	excludeSubmissionId?: string,
): Promise<boolean> {
	const existing = await Submission.find(withActive({ userId }));

	return existing.some((sub) => {
		if (excludeSubmissionId && sub._id.toString() === excludeSubmissionId)
			return false;
		return booksMatch(
			{ bookTitle: sub.bookTitle, bookAuthor: sub.bookAuthor },
			{ bookTitle, bookAuthor },
		);
	});
}

export type ScoreBreakdown = {
	promptPoints: number;
	bonusPoints: number;
	pageBonus: number;
	totalImpact: number;
	promptDetails: { id: string; label: string; points: number }[];
	bonusDetails: { id: string; label: string; points: number }[];
};

export async function validateSubmission(
	user: HydratedDocument<IUser>,
	input: SubmissionInput,
	options?: { excludeSubmissionId?: string },
): Promise<string | null> {
	if (user.status !== 'assigned' || !user.teamId) {
		return 'You must be assigned to a team before submitting.';
	}

	if (!input.bookTitle.trim() || !input.bookAuthor.trim()) {
		return 'Book title and author are required.';
	}

	// Duplicate books are no longer a hard block - the client warns readers via
	// GET /submissions/check-duplicate but they may still submit the same title again.

	const started = input.startedAt?.trim() ?? ''
	const finished = input.finishedAt?.trim() ?? ''
	const dateRe = /^\d{4}-\d{2}-\d{2}$/

	if (!started) {
		return 'Start date is required.';
	}
	if (!dateRe.test(started)) {
		return 'Start date must be YYYY-MM-DD.';
	}
	if (!finished) {
		return 'Finish date is required.';
	}
	if (!dateRe.test(finished)) {
		return 'Finish date must be YYYY-MM-DD.';
	}
	if (finished < started) {
		return 'Finish date cannot be before the start date.';
	}

	if (input.pageCount < 1) {
		return 'Page count must be at least 1.';
	}

	if (input.coverUrl != null && input.coverUrl !== '' && !isAllowedCoverUrl(input.coverUrl)) {
		return 'Invalid cover URL.';
	}

	const maxPrompts =
		(getConfigWithPrompts().scoringRules.maxPromptsPerBook as number) ?? 5;
	if (input.promptIds.length > maxPrompts) {
		return `Maximum ${maxPrompts} prompts per book.`;
	}

	// Zero prompts is allowed (page / competition / team bonuses can still apply).
	if (input.promptIds.length > 0) {
		const prompts = input.promptIds
			.map((id) => getPromptById(id))
			.filter(Boolean);
		if (prompts.length !== input.promptIds.length) {
			return 'Invalid prompt selection.';
		}

		const allPositive = prompts.every((p) => p!.points > 0);
		const allNegative = prompts.every((p) => p!.points < 0);

		if (!allPositive && !allNegative) {
			return 'All prompts must be either positive or negative - not mixed.';
		}

		if (input.submissionType === 'add' && !allPositive) {
			return 'Adding points requires positive prompts only.';
		}

		if (input.submissionType === 'sabotage' && !allNegative) {
			return 'Sabotage requires negative prompts only.';
		}
	}

	if (input.submissionType === 'sabotage') {
		if (!input.targetTeamId) return 'Select a team to attack.';
		if (input.targetTeamId === user.teamId)
			return 'You cannot attack your own team.';
		if (!getTeamById(input.targetTeamId)) return 'Invalid target team.';
	}

	const team = getTeamById(user.teamId);
	if (team) {
		const validBonusIds = team.bonusPrompts.map((p) => p.id);
		for (const id of input.bonusTeamPromptIds) {
			if (!validBonusIds.includes(id)) return 'Invalid team bonus prompt.';
		}
	}

	return null;
}

export function calculateScore(
	user: HydratedDocument<IUser>,
	input: SubmissionInput,
): ScoreBreakdown {
	const sign = input.submissionType === 'add' ? 1 : -1;
	const config = getConfigWithPrompts();
	const team = getTeamById(user.teamId!);

	const promptDetails = input.promptIds.map((id) => {
		const p = getPromptById(id)!;
		return { id: p.id, label: p.label, points: p.points };
	});
	const promptPoints = promptDetails.reduce((sum, p) => sum + p.points, 0);

	const bonusDetails: { id: string; label: string; points: number }[] = [];

	if (input.bonusCompetition) {
		const pts = (config.globalBonuses[0]?.points ?? 10) * sign;
		bonusDetails.push({
			id: 'competition-trials',
			label: config.globalBonuses[0]?.label ?? 'Competition / trials',
			points: pts,
		});
	}

	for (const id of input.bonusTeamPromptIds) {
		const tp = team?.bonusPrompts.find((p) => p.id === id);
		if (tp) {
			bonusDetails.push({
				id: tp.id,
				label: tp.label,
				points: tp.points * sign,
			});
		}
	}

	const bonusPoints = bonusDetails.reduce((sum, b) => sum + b.points, 0);
	const pageBonus = pageCountBonus(input.pageCount);
	const totalImpact = promptPoints + bonusPoints + pageBonus;

	return {
		promptPoints,
		bonusPoints,
		pageBonus,
		totalImpact,
		promptDetails,
		bonusDetails,
	};
}

export type TeamStanding = {
	teamId: string;
	teamName: string;
	memberCount: number;
	xpGained: number;
	xpDealt: number;
	xpLost: number;
	netXp: number;
	totalTeamXp: number;
	averagePerMember: number;
	color: string;
	icon: string;
};

/**
 * @param teamByUserId optional override map (userId → teamId) for hypothetical previews
 */
export async function calculateStandings(
	teamByUserId?: Map<string, string>,
): Promise<TeamStanding[]> {
	const config = getConfigWithPrompts();

	const memberCounts = new Map<string, number>();
	const userTeamMap = new Map<string, string>();

	if (teamByUserId) {
		for (const [userId, teamId] of teamByUserId) {
			if (!teamId) continue;
			userTeamMap.set(userId, teamId);
			memberCounts.set(teamId, (memberCounts.get(teamId) ?? 0) + 1);
		}
	} else {
		const assignedUsers = await User.find({
			status: 'assigned',
			teamId: { $ne: null },
		});
		for (const u of assignedUsers) {
			if (u.teamId) {
				memberCounts.set(u.teamId, (memberCounts.get(u.teamId) ?? 0) + 1);
				userTeamMap.set(u._id.toString(), u.teamId);
			}
		}
	}

	const gained = new Map<string, number>();
	const lost = new Map<string, number>();
	const dealt = new Map<string, number>();

	const allSubs = await Submission.find(withActive());
	for (const sub of allSubs) {
		const teamId = userTeamMap.get(sub.userId.toString());
		if (!teamId) continue;

		const promptAndBonus = sub.promptPoints + sub.bonusPoints;

		if (sub.submissionType === 'add') {
			gained.set(
				teamId,
				(gained.get(teamId) ?? 0) + promptAndBonus + sub.pageBonus,
			);
		} else if (sub.submissionType === 'sabotage' && sub.targetTeamId) {
			const attackPoints = Math.abs(promptAndBonus);
			lost.set(
				sub.targetTeamId,
				(lost.get(sub.targetTeamId) ?? 0) + attackPoints,
			);
			dealt.set(teamId, (dealt.get(teamId) ?? 0) + attackPoints);
			gained.set(teamId, (gained.get(teamId) ?? 0) + sub.pageBonus);
		}
	}

	return config.teams
		.map((team) => {
			const members = memberCounts.get(team.id) ?? 0;
			const xpGained = gained.get(team.id) ?? 0;
			const xpDealt = dealt.get(team.id) ?? 0;
			const xpLost = lost.get(team.id) ?? 0;
			const netXp = xpGained - xpLost;
			const startingTeamXp =
				(config.scoringRules as { startingTeamXp?: number }).startingTeamXp ??
				0;
			const totalTeamXp = startingTeamXp + netXp;
			const activityPerMember = xpGained + xpDealt;
			return {
				teamId: team.id,
				teamName: team.name,
				memberCount: members,
				xpGained,
				xpDealt,
				xpLost,
				netXp,
				totalTeamXp,
				averagePerMember:
					members > 0 ? Math.round((activityPerMember / members) * 10) / 10 : 0,
				color: team.color ?? '#888',
				icon: team.icon ?? '◆',
			};
		})
		.sort((a, b) => {
			const useAverage =
				(config.scoringRules as { standingsUseAveragePerMember?: boolean })
					.standingsUseAveragePerMember ?? false;
			return useAverage
				? b.averagePerMember - a.averagePerMember
				: b.totalTeamXp - a.totalTeamXp;
		});
}

export function submissionToPublic(sub: ISubmission & { createdAt?: Date }) {
	return {
		id: sub._id.toString(),
		bookTitle: sub.bookTitle,
		bookAuthor: sub.bookAuthor,
		pageCount: sub.pageCount,
		format: sub.format,
		coverUrl: (sub as { coverUrl?: string | null }).coverUrl ?? null,
		startedAt: sub.startedAt,
		finishedAt: sub.finishedAt,
		submissionType: sub.submissionType,
		targetTeamId: sub.targetTeamId,
		promptIds: sub.promptIds,
		bonusCompetition: sub.bonusCompetition,
		bonusTeamPromptIds: sub.bonusTeamPromptIds,
		pageBonus: sub.pageBonus,
		promptPoints: sub.promptPoints,
		bonusPoints: sub.bonusPoints,
		totalImpact: sub.totalImpact,
		createdAt: sub.createdAt,
	};
}
