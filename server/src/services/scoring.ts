import { pageCountBonus } from '../config.js';
import { getConfigWithPrompts, getPromptById, getTeamById } from './prompts.js';
import { type HydratedDocument } from 'mongoose';
import { type IUser, User } from '../db/models/User.js';
import { Submission, type ISubmission } from '../db/models/Submission.js';

export type SubmissionInput = {
	bookTitle: string;
	bookAuthor: string;
	pageCount: number;
	format: string;
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

export async function findDuplicateSubmission(
	userId: import('mongoose').Types.ObjectId,
	bookTitle: string,
	bookAuthor: string,
	excludeSubmissionId?: string,
): Promise<boolean> {
	const { title, author } = normalizeBook(bookTitle, bookAuthor);
	const existing = await Submission.find({ userId });

	return existing.some((sub) => {
		if (excludeSubmissionId && sub._id.toString() === excludeSubmissionId)
			return false;
		const n = normalizeBook(sub.bookTitle, sub.bookAuthor);
		return n.title === title && n.author === author;
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

	if (
		await findDuplicateSubmission(
			user._id,
			input.bookTitle,
			input.bookAuthor,
			options?.excludeSubmissionId,
		)
	) {
		return 'You have already submitted this book.';
	}

	if (
		input.startedAt?.trim() &&
		!/^\d{4}-\d{2}-\d{2}$/.test(input.startedAt.trim())
	) {
		return 'Start date must be YYYY-MM-DD.';
	}

	if (
		input.finishedAt?.trim() &&
		!/^\d{4}-\d{2}-\d{2}$/.test(input.finishedAt.trim())
	) {
		return 'Finish date must be YYYY-MM-DD.';
	}

	if (input.pageCount < 1) {
		return 'Page count must be at least 1.';
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

export async function calculateStandings(): Promise<TeamStanding[]> {
	const config = getConfigWithPrompts();

	const assignedUsers = await User.find({
		status: 'assigned',
		teamId: { $ne: null },
	});
	const memberCounts = new Map<string, number>();
	const userTeamMap = new Map<string, string>();

	for (const u of assignedUsers) {
		if (u.teamId) {
			memberCounts.set(u.teamId, (memberCounts.get(u.teamId) ?? 0) + 1);
			userTeamMap.set(u._id.toString(), u.teamId);
		}
	}

	const gained = new Map<string, number>();
	const lost = new Map<string, number>();
	const dealt = new Map<string, number>();

	const allSubs = await Submission.find();
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
