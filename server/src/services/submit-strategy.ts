import { calculateStandings, type TeamStanding } from './scoring.js';

const CLOSE_TEAM_XP_GAP = 40;

/** Rough expected impact of a single sabotage submission, used only to preview gap-closing math. */
const ESTIMATED_SABOTAGE_XP = 25;

export type SubmitStrategyRival = {
	teamId: string;
	teamName: string;
	/** their totalTeamXp - your totalTeamXp. Positive = they're ahead of your realm. */
	xpGap: number;
	/** how much a typical sabotage would close this gap by, if they're ahead. */
	ifSabotageCloseBy: number;
};

export type SubmitStrategy = {
	standingsAvailable: boolean;
	yourTeamId: string | null;
	yourTeamName: string | null;
	yourTeamXp: number | null;
	suggestion: 'add' | 'sabotage' | null;
	targetTeamId: string | null;
	targetTeamName: string | null;
	gapToClose: number | null;
	estimatedCloseBy: number | null;
	reason: string;
	rivals: SubmitStrategyRival[];
};

export async function getSubmitStrategy(
	userTeamId: string,
): Promise<SubmitStrategy> {
	const standings = await calculateStandings();
	return buildSubmitStrategy(standings, userTeamId);
}

function teamXpGap(ahead: TeamStanding, behind: TeamStanding): number {
	return ahead.totalTeamXp - behind.totalTeamXp;
}

function closestRivalByTeamXp(
	standings: TeamStanding[],
	myTeamId: string,
): TeamStanding | null {
	return (
		standings
			.filter((t) => t.teamId !== myTeamId)
			.sort((a, b) => b.totalTeamXp - a.totalTeamXp)[0] ?? null
	);
}

function estimatedSabotageCloseBy(xpGap: number): number {
	return Math.min(Math.abs(xpGap), ESTIMATED_SABOTAGE_XP);
}

function buildRivals(
	standings: TeamStanding[],
	my: TeamStanding,
): SubmitStrategyRival[] {
	return standings
		.filter((t) => t.teamId !== my.teamId)
		.map((t) => {
			const xpGap = teamXpGap(t, my);
			return {
				teamId: t.teamId,
				teamName: t.teamName,
				xpGap,
				ifSabotageCloseBy: estimatedSabotageCloseBy(xpGap),
			};
		})
		.sort((a, b) => b.xpGap - a.xpGap);
}

export function buildSubmitStrategy(
	standings: Awaited<ReturnType<typeof calculateStandings>>,
	userTeamId: string,
): SubmitStrategy {
	const myIndex = standings.findIndex((t) => t.teamId === userTeamId);

	if (myIndex === -1) {
		return {
			standingsAvailable: true,
			yourTeamId: userTeamId,
			yourTeamName: null,
			yourTeamXp: null,
			suggestion: null,
			targetTeamId: null,
			targetTeamName: null,
			gapToClose: null,
			estimatedCloseBy: null,
			reason:
				'Pick add points to help your realm, or sabotage to slow a rival.',
			rivals: [],
		};
	}

	const my = standings[myIndex]!;
	const frontRunner = standings[0]!;
	const rivals = buildRivals(standings, my);
	const closestRival = closestRivalByTeamXp(standings, my.teamId);
	const amFrontRunner = my.teamId === frontRunner.teamId;

	if (amFrontRunner) {
		if (closestRival) {
			const xpGap = teamXpGap(my, closestRival);
			if (xpGap <= CLOSE_TEAM_XP_GAP) {
				const estimatedCloseBy = estimatedSabotageCloseBy(xpGap);
				return {
					standingsAvailable: true,
					yourTeamId: my.teamId,
					yourTeamName: my.teamName,
					yourTeamXp: my.totalTeamXp,
					suggestion: 'sabotage',
					targetTeamId: closestRival.teamId,
					targetTeamName: closestRival.teamName,
					gapToClose: xpGap,
					estimatedCloseBy,
					reason: `${closestRival.teamName} is only ${xpGap} team points behind your realm. Sabotaging them protects your gap by about ${estimatedCloseBy} points.`,
					rivals,
				};
			}
			return {
				standingsAvailable: true,
				yourTeamId: my.teamId,
				yourTeamName: my.teamName,
				yourTeamXp: my.totalTeamXp,
				suggestion: 'add',
				targetTeamId: null,
				targetTeamName: null,
				gapToClose: xpGap,
				estimatedCloseBy: null,
				reason: `Your realm is ${xpGap} team points ahead of ${closestRival.teamName}. Adding points widens the gap.`,
				rivals,
			};
		}

		return {
			standingsAvailable: true,
			yourTeamId: my.teamId,
			yourTeamName: my.teamName,
			yourTeamXp: my.totalTeamXp,
			suggestion: 'add',
			targetTeamId: null,
			targetTeamName: null,
			gapToClose: null,
			estimatedCloseBy: null,
			reason: "Your realm is ahead - keep adding points to stay ahead.",
			rivals,
		};
	}

	const gapToFrontRunner = teamXpGap(frontRunner, my);
	const teamAbove = myIndex > 0 ? standings[myIndex - 1]! : null;
	const gapToTeamAbove = teamAbove ? teamXpGap(teamAbove, my) : null;

	if (gapToFrontRunner <= CLOSE_TEAM_XP_GAP) {
		return {
			standingsAvailable: true,
			yourTeamId: my.teamId,
			yourTeamName: my.teamName,
			yourTeamXp: my.totalTeamXp,
			suggestion: 'add',
			targetTeamId: null,
			targetTeamName: null,
			gapToClose: gapToFrontRunner,
			estimatedCloseBy: null,
			reason: `${frontRunner.teamName} is ${gapToFrontRunner} team points ahead of your realm. Adding points is the fastest way to close the gap.`,
			rivals,
		};
	}

	if (
		teamAbove &&
		teamAbove.teamId !== frontRunner.teamId &&
		gapToTeamAbove !== null &&
		gapToTeamAbove <= CLOSE_TEAM_XP_GAP
	) {
		return {
			standingsAvailable: true,
			yourTeamId: my.teamId,
			yourTeamName: my.teamName,
			yourTeamXp: my.totalTeamXp,
			suggestion: 'add',
			targetTeamId: null,
			targetTeamName: null,
			gapToClose: gapToTeamAbove,
			estimatedCloseBy: null,
			reason: `${teamAbove.teamName} is ${gapToTeamAbove} team points ahead of your realm, and ${frontRunner.teamName} leads by ${gapToFrontRunner} overall. Adding points helps you close both gaps.`,
			rivals,
		};
	}

	if (teamAbove && teamAbove.teamId === frontRunner.teamId) {
		return {
			standingsAvailable: true,
			yourTeamId: my.teamId,
			yourTeamName: my.teamName,
			yourTeamXp: my.totalTeamXp,
			suggestion: 'add',
			targetTeamId: null,
			targetTeamName: null,
			gapToClose: gapToFrontRunner,
			estimatedCloseBy: null,
			reason: `${frontRunner.teamName} is ${gapToFrontRunner} team points ahead of your realm. Adding points helps ${my.teamName} move into the lead.`,
			rivals,
		};
	}

	return {
		standingsAvailable: true,
		yourTeamId: my.teamId,
		yourTeamName: my.teamName,
		yourTeamXp: my.totalTeamXp,
		suggestion: 'add',
		targetTeamId: null,
		targetTeamName: null,
		gapToClose: gapToFrontRunner,
		estimatedCloseBy: null,
		reason: `${frontRunner.teamName} is ${gapToFrontRunner} team points ahead of your realm. Adding points helps ${my.teamName} close the gap - sabotage can slow down a specific rival instead.`,
		rivals,
	};
}
