import { Hono } from 'hono';
import { Submission } from '../db/models/Submission.js';
import { withActive } from '../db/activeSubmission.js';
import { getSessionUser, requireAuth } from '../services/auth.js';
import {
	calculateScore,
	findDuplicateSubmission,
	submissionToPublic,
	validateSubmission,
	type SubmissionInput,
} from '../services/scoring.js';
import { getSubmitStrategy } from '../services/submit-strategy.js';
import { getTeamById } from '../services/prompts.js';
import { captureServerEvent } from '../services/posthog.js';
import { notifyTeamChatSubmission } from '../services/discord.js';
import { buildTeamChatMessage } from '../services/teamChatMessage.js';
import {
	getActiveMonthlyEventSync,
	getSiteSettingsAdminSync,
} from '../services/siteSettings.js';
import { submissionsCreatedTotal } from '../services/metrics.js';

function optionalDate(value: string | null | undefined): string | null {
	const trimmed = value?.trim();
	return trimmed || null;
}

export const submissionRoutes = new Hono();

submissionRoutes.get('/mine', async (c) => {
	const user = requireAuth(await getSessionUser(c));
	const rows = await Submission.find(withActive({ userId: user._id })).sort({
		createdAt: -1,
	});
	return c.json({ submissions: rows.map(submissionToPublic) });
});

submissionRoutes.get('/strategy', async (c) => {
	const user = requireAuth(await getSessionUser(c));
	if (user.status !== 'assigned' || !user.teamId) {
		return c.json({
			standingsAvailable: false,
			yourTeamId: user.teamId,
			yourTeamName: null,
			yourTeamXp: null,
			suggestion: null,
			targetTeamId: null,
			targetTeamName: null,
			gapToClose: null,
			estimatedCloseBy: null,
			reason:
				'Get assigned to a realm first - then we can suggest gain vs attack.',
			rivals: [],
		});
	}
	const strategy = await getSubmitStrategy(user.teamId);
	return c.json(strategy);
});

submissionRoutes.get('/check-duplicate', async (c) => {
	const user = requireAuth(await getSessionUser(c));
	const title = c.req.query('title')?.trim() ?? '';
	const author = c.req.query('author')?.trim() ?? '';

	if (!title || !author) return c.json({ duplicate: false });

	const duplicate = await findDuplicateSubmission(user._id, title, author);
	return c.json({ duplicate });
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
		coverUrl: body.coverUrl?.trim() || null,
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

	submissionsCreatedTotal
		.labels(body.submissionType, body.format || 'unknown')
		.inc();

	captureServerEvent(user._id.toString(), 'submission_created', {
		submission_type: body.submissionType,
		format: body.format,
		page_count: body.pageCount,
		team_id: user.teamId,
		target_team_id: body.targetTeamId ?? null,
	});

	// Fire-and-forget, optional realm chat webhook - never blocks or fails the submission.
	const teamName = user.teamId ? getTeamById(user.teamId)?.name : null;
	if (teamName) {
		const targetTeamName = body.targetTeamId
			? getTeamById(body.targetTeamId)?.name ?? null
			: null;
		const settings = getSiteSettingsAdminSync();
		const liveSlot = getActiveMonthlyEventSync();
		const themeTemplates =
			body.submissionType === 'sabotage'
				? liveSlot?.discordTemplates?.sabotage
				: liveSlot?.discordTemplates?.add;
		const globalTemplates =
			body.submissionType === 'sabotage'
				? settings.teamChatSabotageTemplates
				: settings.teamChatAddTemplates;
		notifyTeamChatSubmission(
			user.teamId,
			buildTeamChatMessage(
				{
					displayName: user.displayName,
					bookTitle: submission.bookTitle,
					teamName,
					submissionType: body.submissionType,
					targetTeamName,
				},
				{
					templates:
						themeTemplates && themeTemplates.length > 0
							? themeTemplates
							: globalTemplates,
				},
			),
			submission.coverUrl?.trim() || null,
		);
	}

	return c.json({
		submission: submissionToPublic(submission),
		breakdown: score,
	});
});

/** Owner-only: change cover art on an existing log (upload URL or Open Library). */
submissionRoutes.patch('/:id/cover', async (c) => {
	const user = requireAuth(await getSessionUser(c));
	const submission = await Submission.findOne(
		withActive({ _id: c.req.param('id'), userId: user._id }),
	);
	if (!submission) return c.json({ error: 'Submission not found' }, 404);

	const body = await c.req.json<{ coverUrl?: string | null }>();
	const raw = body.coverUrl?.trim() || null;
	const { isAllowedCoverUrl } = await import('../services/covers.js');
	if (!isAllowedCoverUrl(raw)) {
		return c.json({ error: 'Invalid cover URL' }, 400);
	}

	submission.coverUrl = raw;
	await submission.save();
	return c.json({ submission: submissionToPublic(submission) });
});
