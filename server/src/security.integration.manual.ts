/**
 * Manual security verification - run with: npm run test:security
 * Requires MONGODB_URI in server/.env
 */
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import { Hono } from 'hono';
import { sign } from 'hono/jwt';
import { config as loadEnv } from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectDb, disconnectDb } from './db/connect.js';
import { Prompt } from './db/models/Prompt.js';
import { User } from './db/models/User.js';
import { authRoutes } from './routes/auth.js';
import { adminRoutes } from './routes/admin.js';
import {
	validateSubmission,
	type SubmissionInput,
} from './services/scoring.js';
import { refreshPromptsCache } from './services/prompts.js';
import { getStaticConfig } from './config.js';

loadEnv({ path: join(dirname(fileURLToPath(import.meta.url)), '../.env') });

const RUN_ID = Date.now();
const TEST_ASSIGNED = `security-assigned-${RUN_ID}@test.local`;
const TEST_NONADMIN = `security-nonadmin-${RUN_ID}@test.local`;
const TEST_REGISTER = `security-register-${RUN_ID}@test.local`;
const DRAFT_PROMPT_ID = `draft-security-test-${RUN_ID}`;

const SESSION_SECRET =
	process.env.SESSION_SECRET ?? 'dev-secret-change-in-production';

function buildApp() {
	const app = new Hono();
	app.route('/api/auth', authRoutes);
	app.route('/api/admin', adminRoutes);
	return app;
}

function cookieFromResponse(res: Response): string | null {
	const set = res.headers.getSetCookie?.() ?? [];
	const legacy = res.headers.get('set-cookie');
	const all = set.length ? set : legacy ? [legacy] : [];
	const session = all.find((c) => c.startsWith('realm_session='));
	return session ? session.split(';')[0]! : null;
}

async function sessionCookieForUser(userId: string): Promise<string> {
	const token = await sign(
		{ userId, exp: Math.floor(Date.now() / 1000) + 3600 },
		SESSION_SECRET,
		'HS256',
	);
	return `realm_session=${token}`;
}

describe('security manual checks', () => {
	before(async () => {
		if (!process.env.MONGODB_URI) {
			throw new Error(
				'MONGODB_URI is required. Set it in server/.env to run security checks.',
			);
		}
		await connectDb();
		await refreshPromptsCache();
	});

	after(async () => {
		await Prompt.deleteMany({ promptId: DRAFT_PROMPT_ID });
		await User.deleteMany({
			email: { $in: [TEST_ASSIGNED, TEST_NONADMIN, TEST_REGISTER] },
		});
		await disconnectDb();
	});

	it('1) rejects submission that uses a draft (inactive) prompt ID', async () => {
		const teamId = getStaticConfig().teams[0]!.id;

		await Prompt.create({
			promptId: DRAFT_PROMPT_ID,
			kind: 'positive',
			gameName: 'Draft Test',
			label: 'Draft only prompt',
			description: 'Should not be submittable',
			points: 99,
			isActive: false,
		});
		await refreshPromptsCache();

		const user = await User.create({
			displayName: 'Security Test User',
			email: TEST_ASSIGNED,
			teamId,
			status: 'assigned',
		});

		const input: SubmissionInput = {
			bookTitle: 'Security Test Book',
			bookAuthor: 'Tester',
			pageCount: 200,
			format: 'ebook',
			coverUrl: 'https://covers.openlibrary.org/b/id/12345-L.jpg',
			submissionType: 'add',
			promptIds: [DRAFT_PROMPT_ID],
			bonusCompetition: false,
			bonusTeamPromptIds: [],
			startedAt: '2026-07-01',
			finishedAt: '2026-07-10',
		};

		const draftError = await validateSubmission(user, input);
		assert.equal(
			draftError,
			'Invalid prompt selection.',
			`expected draft rejection, got: ${draftError}`,
		);
	});

	it('2) returns 403 when non-admin POSTs /api/admin/prompts', async () => {
		const app = buildApp();
		const user = await User.create({
			displayName: 'Non Admin',
			email: TEST_NONADMIN,
			status: 'pending',
			isAdmin: false,
		});

		const cookie = await sessionCookieForUser(user._id.toString());

		const res = await app.request('/api/admin/prompts', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: cookie,
			},
			body: JSON.stringify({
				promptId: 'evil-prompt',
				kind: 'positive',
				label: 'Evil',
				points: 1,
			}),
		});

		assert.equal(
			res.status,
			403,
			`expected 403, got ${res.status}: ${await res.text()}`,
		);
	});

	it('3) register does not create a session before magic-link verify', async () => {
		const app = buildApp();

		const registerRes = await app.request('/api/auth/register', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				displayName: 'Register Security Test',
				email: TEST_REGISTER,
			}),
		});

		assert.equal(registerRes.status, 200);
		const registerBody = (await registerRes.json()) as {
			sent: boolean;
			message: string;
		};
		assert.equal(registerBody.sent, true);
		assert.ok(registerBody.message.toLowerCase().includes('sign-in link'));

		const registerCookie = cookieFromResponse(registerRes);
		assert.equal(
			registerCookie,
			null,
			'register must not set realm_session cookie',
		);

		const meRes = await app.request('/api/auth/me');
		const meBody = (await meRes.json()) as { user: unknown };
		assert.equal(
			meBody.user,
			null,
			'/auth/me should be null without verified session',
		);
	});
});
