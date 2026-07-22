import type { ISubmission } from '../db/models/Submission.js';

export type Achievement = {
	id: string;
	label: string;
	description: string;
	icon: string;
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

function normalizeFormat(format: string | undefined): string {
	return (format ?? '').trim().toLowerCase();
}

/**
 * Achievements are derived purely from a reader's own (non-deleted) submissions,
 * so this stays a pure function - callers own the DB query via `withActive`.
 * All eight can be earned together (no mutual exclusivity).
 */
export function computeAchievements(
	submissions: AchievementSubmission[],
): Achievement[] {
	const sorted = sortByCreatedAt(submissions);
	const totalCount = sorted.length;
	const sabotageSubs = sorted.filter((s) => s.submissionType === 'sabotage');
	const sabotageCount = sabotageSubs.length;
	const totalPages = sorted.reduce((sum, s) => sum + (s.pageCount ?? 0), 0);

	const doorstopperSub = sorted.find((s) => s.pageCount >= 500);
	const firstSabotageSub = sabotageSubs[0];
	const fifthBookSub = totalCount >= 5 ? sorted[4] : undefined;
	const tenthBookSub = totalCount >= 10 ? sorted[9] : undefined;
	const fifthSabotageSub = sabotageCount >= 5 ? sabotageSubs[4] : undefined;

	const formats = new Set(sorted.map((s) => normalizeFormat(s.format)).filter(Boolean));
	const formatCounts = new Map<string, { count: number; thirdAt?: Date }>();
	for (const s of sorted) {
		const f = normalizeFormat(s.format);
		if (!f) continue;
		const entry = formatCounts.get(f) ?? { count: 0 };
		entry.count += 1;
		if (entry.count === 3) entry.thirdAt = s.createdAt;
		formatCounts.set(f, entry);
	}
	let formatSpecialistAt: Date | undefined;
	let formatSpecialistEarned = false;
	for (const entry of formatCounts.values()) {
		if (entry.count >= 3) {
			formatSpecialistEarned = true;
			formatSpecialistAt = entry.thirdAt;
			break;
		}
	}

	const formatExplorerFormats = ['physical', 'ebook', 'audiobook'] as const;
	const hasAllFormats = formatExplorerFormats.every((f) => formats.has(f));
	let formatExplorerAt: Date | undefined;
	if (hasAllFormats) {
		const seen = new Set<string>();
		for (const s of sorted) {
			const f = normalizeFormat(s.format);
			if ((formatExplorerFormats as readonly string[]).includes(f)) {
				seen.add(f);
				if (seen.size === formatExplorerFormats.length) {
					formatExplorerAt = s.createdAt;
					break;
				}
			}
		}
	}

	let pageHoarderAt: Date | undefined;
	if (totalPages >= 2000) {
		let running = 0;
		for (const s of sorted) {
			running += s.pageCount ?? 0;
			if (running >= 2000) {
				pageHoarderAt = s.createdAt;
				break;
			}
		}
	}

	return [
		{
			id: 'doorstopper',
			label: 'Doorstopper',
			description: 'Log a book with 500 or more pages.',
			icon: '📖',
			earned: Boolean(doorstopperSub),
			earnedAt: toIso(doorstopperSub?.createdAt),
		},
		{
			id: 'first_sabotage',
			label: 'First Sabotage',
			description: 'Submit your first sabotage against a rival realm.',
			icon: '⚔️',
			earned: Boolean(firstSabotageSub),
			earnedAt: toIso(firstSabotageSub?.createdAt),
		},
		{
			id: 'five_book_club',
			label: 'Five Book Club',
			description: 'Log 5 or more books.',
			icon: '📚',
			earned: totalCount >= 5,
			earnedAt: toIso(fifthBookSub?.createdAt),
		},
		{
			id: 'format_specialist',
			label: 'Format Specialist',
			description: 'Log 3 or more books in the same format.',
			icon: '🎧',
			earned: formatSpecialistEarned,
			earnedAt: toIso(formatSpecialistAt),
		},
		{
			id: 'page_hoarder',
			label: 'Page Hoarder',
			description: 'Log 2,000 or more pages across all books.',
			icon: '📄',
			earned: totalPages >= 2000,
			earnedAt: toIso(pageHoarderAt),
		},
		{
			id: 'saboteur',
			label: 'Saboteur',
			description: 'Land 5 or more sabotages.',
			icon: '💥',
			earned: sabotageCount >= 5,
			earnedAt: toIso(fifthSabotageSub?.createdAt),
		},
		{
			id: 'decade_club',
			label: 'Decade Club',
			description: 'Log 10 or more books.',
			icon: '🔟',
			earned: totalCount >= 10,
			earnedAt: toIso(tenthBookSub?.createdAt),
		},
		{
			id: 'format_explorer',
			label: 'Format Explorer',
			description: 'Log at least one physical book, ebook, and audiobook.',
			icon: '🗺️',
			earned: hasAllFormats,
			earnedAt: toIso(formatExplorerAt),
		},
	];
}
