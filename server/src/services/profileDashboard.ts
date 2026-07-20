import { type HydratedDocument } from 'mongoose';
import { withActive } from '../db/activeSubmission.js';
import { Submission, type ISubmission } from '../db/models/Submission.js';
import { type IUser, User } from '../db/models/User.js';
import { getWeekInfo } from '../utils/week.js';

export type ProfileDashboard = {
	booksLogged: number;
	pointsContributed: number;
	sabotageDealt: number;
	sabotageTaken: number;
	streakWeeks: number;
	teamAvgBooks: number | null;
	teamAvgPoints: number | null;
	vsTeam: { booksDelta: number; pointsDelta: number } | null;
};

function round1(n: number): number {
	return Math.round(n * 10) / 10;
}

/** Sabotage "damage" excludes page bonus - matches standings/breakdown dealt/lost math. */
function sabotageDamage(
	sub: Pick<ISubmission, 'promptPoints' | 'bonusPoints'>,
): number {
	return Math.abs(sub.promptPoints + sub.bonusPoints);
}

/**
 * Consecutive ISO weeks (ending this week) with at least one submission.
 * Returns 0 if the reader has nothing logged in the current week.
 */
export function computeStreakWeeks(dates: Date[]): number {
	if (dates.length === 0) return 0;

	const weekKeys = new Set(dates.map((d) => getWeekInfo(d).weekKey));
	const cursor = new Date();
	const { weekKey: currentWeekKey } = getWeekInfo(cursor);
	if (!weekKeys.has(currentWeekKey)) return 0;

	let streak = 0;
	while (weekKeys.has(getWeekInfo(cursor).weekKey)) {
		streak++;
		cursor.setDate(cursor.getDate() - 7);
	}
	return streak;
}

/**
 * Builds the personal dashboard for a reader. `ownSubmissions` should already be
 * filtered to this user's non-deleted submissions (callers typically have this
 * loaded for the profile response already, so we avoid re-querying it here).
 */
export async function buildProfileDashboard(
	user: HydratedDocument<IUser>,
	ownSubmissions: ISubmission[],
): Promise<ProfileDashboard> {
	const booksLogged = ownSubmissions.length;
	const pointsContributed = ownSubmissions
		.filter((s) => s.submissionType === 'add')
		.reduce((sum, s) => sum + s.totalImpact, 0);
	const sabotageDealt = ownSubmissions
		.filter((s) => s.submissionType === 'sabotage')
		.reduce((sum, s) => sum + sabotageDamage(s), 0);

	const streakWeeks = computeStreakWeeks(
		ownSubmissions.map((s) => s.createdAt ?? new Date()),
	);

	let sabotageTaken = 0;
	let teamAvgBooks: number | null = null;
	let teamAvgPoints: number | null = null;
	let vsTeam: ProfileDashboard['vsTeam'] = null;

	if (user.teamId) {
		const [sabotagesAgainstTeam, teammates] = await Promise.all([
			Submission.find(
				withActive({ submissionType: 'sabotage', targetTeamId: user.teamId }),
			),
			User.find({ status: 'assigned', teamId: user.teamId }),
		]);

		sabotageTaken = sabotagesAgainstTeam.reduce(
			(sum, s) => sum + sabotageDamage(s),
			0,
		);

		if (teammates.length > 0) {
			const teammateIds = teammates.map((t) => t._id);
			const teamSubs = await Submission.find(
				withActive({ userId: { $in: teammateIds } }),
			);

			const perMember = new Map<string, { books: number; points: number }>();
			for (const t of teammates) {
				perMember.set(t._id.toString(), { books: 0, points: 0 });
			}
			for (const sub of teamSubs) {
				const entry = perMember.get(sub.userId.toString());
				if (!entry) continue;
				entry.books++;
				if (sub.submissionType === 'add') entry.points += sub.totalImpact;
			}

			const totals = [...perMember.values()].reduce(
				(acc, e) => ({
					books: acc.books + e.books,
					points: acc.points + e.points,
				}),
				{ books: 0, points: 0 },
			);

			teamAvgBooks = round1(totals.books / teammates.length);
			teamAvgPoints = round1(totals.points / teammates.length);
			vsTeam = {
				booksDelta: round1(booksLogged - teamAvgBooks),
				pointsDelta: round1(pointsContributed - teamAvgPoints),
			};
		}
	}

	return {
		booksLogged,
		pointsContributed,
		sabotageDealt,
		sabotageTaken,
		streakWeeks,
		teamAvgBooks,
		teamAvgPoints,
		vsTeam,
	};
}
