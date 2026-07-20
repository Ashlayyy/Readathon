import type { ISubmission } from '../db/models/Submission.js';

export type Achievement = {
	id: string;
	label: string;
	description: string;
	earned: boolean;
	earnedAt: string | null;
};

type AchievementSubmission = Pick<
	ISubmission,
	'pageCount' | 'submissionType' | 'format'
> & { createdAt?: Date };

function sortByCreatedAt<T extends { createdAt?: Date }>(subs: T[]): T[] {
	return [...subs].sort(
		(a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0),
	);
}

function toIso(date: Date | undefined | null): string | null {
	return date ? date.toISOString() : null;
}

/**
 * Achievements are derived purely from a reader's own (non-deleted) submissions,
 * so this stays a pure function - callers own the DB query via `withActive`.
 */
export function computeAchievements(
	submissions: AchievementSubmission[],
): Achievement[] {
	const sorted = sortByCreatedAt(submissions);
	const totalCount = sorted.length;
	const sabotageCount = sorted.filter(
		(s) => s.submissionType === 'sabotage',
	).length;

	const doorstopperSub = sorted.find((s) => s.pageCount >= 500);
	const firstSabotageSub = sorted.find((s) => s.submissionType === 'sabotage');
	const fifthBookSub = totalCount >= 5 ? sorted[4] : undefined;

	const pacifistEarned = totalCount >= 3 && sabotageCount === 0;
	const thirdBookSub = totalCount >= 3 ? sorted[2] : undefined;

	const formats = new Set(sorted.map((s) => s.format));
	const formatSpecialistEarned = totalCount >= 3 && formats.size === 1;

	return [
		{
			id: 'doorstopper',
			label: 'Doorstopper',
			description: 'Log a book with 500 or more pages.',
			earned: Boolean(doorstopperSub),
			earnedAt: toIso(doorstopperSub?.createdAt),
		},
		{
			id: 'first_sabotage',
			label: 'First Sabotage',
			description: 'Submit your first sabotage against a rival realm.',
			earned: Boolean(firstSabotageSub),
			earnedAt: toIso(firstSabotageSub?.createdAt),
		},
		{
			id: 'five_book_club',
			label: 'Five Book Club',
			description: 'Log 5 or more books.',
			earned: totalCount >= 5,
			earnedAt: toIso(fifthBookSub?.createdAt),
		},
		{
			id: 'pacifist',
			label: 'Pacifist',
			description: 'Log 3 or more books without ever sabotaging.',
			earned: pacifistEarned,
			earnedAt: pacifistEarned ? toIso(thirdBookSub?.createdAt) : null,
		},
		{
			id: 'format_specialist',
			label: 'Format Specialist',
			description: 'Log 3 or more books, all in the same format.',
			earned: formatSpecialistEarned,
			earnedAt: formatSpecialistEarned ? toIso(thirdBookSub?.createdAt) : null,
		},
	];
}
