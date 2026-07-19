import { Hono } from 'hono';
import { Submission } from '../db/models/Submission.js';
import { getSessionUser, requireAuth } from '../services/auth.js';
import {
	calculateScore,
	submissionToPublic,
	validateSubmission,
	type SubmissionInput,
} from '../services/scoring.js';
import { getSubmitStrategy } from '../services/submit-strategy.js';

function optionalDate(value: string | null | undefined): string | null {
	const trimmed = value?.trim();
	return trimmed || null;
}

export const submissionRoutes = new Hono();

submissionRoutes.get('/mine', async (c) => {
	const user = requireAuth(await getSessionUser(c));
	const rows = await Submission.find({ userId: user._id }).sort({
		createdAt: -1,
	});
	return c.json({ submissions: rows.map(submissionToPublic) });
});

submissionRoutes.get('/strategy', async (c) => {
	const user = requireAuth(await getSessionUser(c));
	if (user.status !== 'assigned' || !user.teamId) {
		return c.json({
			standingsAvailable: false,
			yourRank: null,
			yourTeamId: user.teamId,
			yourTeamName: null,
			suggestion: null,
			targetTeamId: null,
			targetTeamName: null,
			reason:
				'Get assigned to a realm first - then we can suggest gain vs attack.',
		});
	}
	const strategy = await getSubmitStrategy(user.teamId);
	return c.json(strategy);
});

submissionRoutes.post('/', async (c) => {
	const user = requireAuth(await getSessionUser(c));
	const body = await c.req.json<SubmissionInput>();

	const error = await validateSubmission(user, body);
	if (error) return c.json({ error }, 400);

	const score = calculateScore(user, body);

	const submission = await Submission.create({
		userId: user._id,
		bookTitle: body.bookTitle.trim(),
		bookAuthor: body.bookAuthor.trim(),
		pageCount: body.pageCount,
		format: body.format,
		startedAt: optionalDate(body.startedAt),
		finishedAt: optionalDate(body.finishedAt),
		submissionType: body.submissionType,
		targetTeamId: body.targetTeamId ?? null,
		promptIds: body.promptIds,
		bonusCompetition: body.bonusCompetition,
		bonusTeamPromptIds: body.bonusTeamPromptIds,
		pageBonus: score.pageBonus,
		promptPoints: score.promptPoints,
		bonusPoints: score.bonusPoints,
		totalImpact: score.totalImpact,
	});

	return c.json({
		submission: submissionToPublic(submission),
		breakdown: score,
	});
});
