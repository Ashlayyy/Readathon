import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { downtimeGuard } from './middleware/downtime.js';
import { rateLimit } from './middleware/rateLimit.js';
import { metricsMiddleware } from './middleware/metrics.js';
import { connectDb, pingDb } from './db/connect.js';
import { AuthError } from './services/auth.js';
import { User } from './db/models/User.js';
import { Submission } from './db/models/Submission.js';
import { withActive } from './db/activeSubmission.js';
import { refreshPromptsCache, getConfig } from './services/prompts.js';
import {
	refreshSiteSettingsCache,
	getSiteSettingsSync,
	getSiteSettingsAdminSync,
	getActiveMonthlyEventSync,
} from './services/siteSettings.js';
import { enrichActiveMonthlyEvent } from './services/monthlyThemeExtras.js';
import { buildHallOfFame } from './services/hallOfFame.js';
import { PublishedStandings } from './db/models/PublishedStandings.js';
import { startScheduledPublishChecker } from './services/scheduledPublish.js';
import {
	startDiscordGateway,
	stopDiscordGateway,
	wireDiscordGatewaySettingsHook,
} from './discord/gateway.js';
import {
	metricsContentType,
	renderMetrics,
	setAppVersion,
	startMetricsGaugeRefresh,
} from './services/metrics.js';
import {
	betterStackStatus,
	flushBetterStackLogs,
	log,
	startBetterStackHeartbeat,
} from './services/betterstack.js';
import { isPostHogEnabled, shutdownPostHog } from './services/posthog.js';
import { adminRoutes } from './routes/admin.js';
import { authRoutes } from './routes/auth.js';
import { profileRoutes } from './routes/profile.js';
import { questionRoutes } from './routes/questions.js';
import { submissionRoutes } from './routes/submissions.js';
import { readerRoutes } from './routes/readers.js';
import { coverRoutes } from './routes/covers.js';
import { avatarRoutes } from './routes/avatars.js';
import { APP_VERSION } from './lib/version.js';
import { getSvgFontStatus } from './lib/svgFonts.js';
import { getSvgTextPathStatus } from './lib/svgTextPaths.js';
import { svgToPng } from './services/svgToPng.js';

loadEnv({ path: join(dirname(fileURLToPath(import.meta.url)), '../.env') });

const app = new Hono();
const frontendOrigin = process.env.FRONTEND_URL ?? 'http://localhost:5173';
const isProduction = process.env.NODE_ENV === 'production';

app.use('*', async (c, next) => {
	c.header('X-Content-Type-Options', 'nosniff');
	c.header('X-Frame-Options', 'DENY');
	c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
	c.header('X-DNS-Prefetch-Control', 'off');
	if (isProduction) {
		c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
	}
	await next();
});

app.onError((err, c) => {
	if (err instanceof AuthError) {
		const status =
			err.message === 'Not authenticated'
				? 401
				: err.message === 'Admin access required'
					? 403
					: 400;
		return c.json({ error: err.message }, status);
	}
	console.error(err);
	return c.json({ error: 'Internal server error' }, 500);
});

app.use(
	'*',
	cors({
		origin: frontendOrigin,
		credentials: true,
	}),
);

app.use('*', metricsMiddleware);

/** Prometheus scrape target. Requires METRICS_TOKEN in production. */
app.get('/metrics', async (c) => {
	const token = process.env.METRICS_TOKEN?.trim();
	if (!token) {
		if (isProduction) {
			return c.text('METRICS_TOKEN is not configured', 503);
		}
	} else {
		const auth = c.req.header('authorization') ?? '';
		if (auth !== `Bearer ${token}`) {
			return c.text('Unauthorized', 401);
		}
	}
	const body = await renderMetrics();
	return c.body(body, 200, { 'Content-Type': metricsContentType() });
});

setAppVersion(APP_VERSION);

const writeLimiter = rateLimit({
	windowMs: 60 * 1000,
	max: 30,
	keyPrefix: 'write',
});
const adminLimiter = rateLimit({
	windowMs: 60 * 1000,
	max: 60,
	keyPrefix: 'admin',
});

app.use('/api/*', downtimeGuard);

app.get('/api/health', async (c) => {
	const databaseOk = await pingDb();
	return c.json(
		{
			status: databaseOk ? 'ok' : 'degraded',
			version: APP_VERSION,
			database: databaseOk ? 'connected' : 'unavailable',
			pngFonts: getSvgFontStatus(),
			pngText: getSvgTextPathStatus(),
			integrations: {
				posthog: isPostHogEnabled(),
				betterstack: betterStackStatus(),
			},
		},
		databaseOk ? 200 : 503,
	);
});

app.get('/api/config', async (c) => {
	const config = getConfig();
	const live = getActiveMonthlyEventSync();
	if (live && config.site) {
		config.site.activeMonthlyEvent = await enrichActiveMonthlyEvent(live);
	}
	return c.json(config);
});

app.get('/api/roster', async (c) => {
	if (!getSiteSettingsSync().showTeamRosters) {
		return c.json({ error: 'Team rosters are not public' }, 404);
	}

	const config = getConfig();
	const assigned = await User.find({
		status: 'assigned',
		teamId: { $ne: null },
	}).sort({
		displayName: 1,
	});

	return c.json({
		teams: config.teams.map((team) => ({
			id: team.id,
			name: team.name,
			color: team.color,
			icon: team.icon,
			members: assigned
				.filter((u) => u.teamId === team.id)
				.map((u) => ({ id: u._id.toString(), displayName: u.displayName })),
		})),
	});
});

const SHELF_SIZE = 20;

/**
 * Public book club shelf - last N finished books, title + author + cover + realm.
 * No private notes, no reader names, so it's safe to show unauthenticated.
 */
app.get('/api/shelf', async (c) => {
	const config = getConfig();
	const subs = await Submission.aggregate([
		{ $match: withActive() },
		{
			$addFields: {
				effectiveDate: { $ifNull: ['$finishedAt', '$createdAt'] },
			},
		},
		{ $sort: { effectiveDate: -1 } },
		{ $limit: SHELF_SIZE },
	]);

	const userIds = [...new Set(subs.map((s) => s.userId.toString()))];
	const users = await User.find({ _id: { $in: userIds } });
	const teamByUserId = new Map(
		users.map((u) => [u._id.toString(), u.teamId]),
	);

	const withEffectiveDate = subs.map((sub) => ({
		sub,
		effectiveDate: sub.effectiveDate
			? new Date(sub.effectiveDate)
			: (sub.finishedAt
				? new Date(sub.finishedAt)
				: new Date(sub.createdAt ?? 0)),
	}));

	const shelf = withEffectiveDate.slice(0, SHELF_SIZE).map(({ sub, effectiveDate }) => {
		const teamId = teamByUserId.get(sub.userId.toString());
		const team = teamId ? config.teams.find((t) => t.id === teamId) : undefined;
		return {
			title: sub.bookTitle,
			author: sub.bookAuthor,
			coverUrl: sub.coverUrl?.trim() || null,
			realmName: team?.name ?? null,
			realmColor: team?.color ?? null,
			finishedAt: effectiveDate.toISOString(),
		};
	});

	return c.json({ shelf });
});

app.get('/api/standings', async (c) => {
	const published = await PublishedStandings.findOne({ isActive: true }).sort({
		createdAt: -1,
	});

	if (!published) {
		return c.json({ published: false, vibes: null });
	}

	const id = published._id.toString();
	let vibes = null;
	if (published.vibesJson) {
		try {
			vibes = JSON.parse(published.vibesJson);
		} catch {
			vibes = null;
		}
	}

	return c.json({
		published: true,
		publishedAt: published.createdAt,
		weekKey: published.weekKey,
		weekLabel: published.weekLabel,
		standings: JSON.parse(published.standingsJson),
		breakdown: published.breakdownJson
			? JSON.parse(published.breakdownJson)
			: null,
		imageUrl: `/standings/image.svg?id=${id}`,
		breakdownImageUrl: published.breakdownSvgData
			? `/standings/breakdown.svg?id=${id}`
			: null,
		vibesImageUrl: published.vibesSvgData
			? `/standings/vibes.svg?id=${id}`
			: null,
		vibes,
		wrapImageUrl: getSiteSettingsAdminSync().lastMonthlyWrapSvg?.trim()
			? '/standings/wrap.svg'
			: null,
		wrapLabel: getSiteSettingsAdminSync().lastMonthlyWrapLabel?.trim() || null,
		wrapPublishedAt: getSiteSettingsAdminSync().lastMonthlyWrapAt,
	});
});

function svgInline(c: { header: (k: string, v: string) => void; body: (b: string) => Response }, svg: string, cacheSeconds = 300) {
	c.header('Content-Type', 'image/svg+xml; charset=utf-8');
	c.header('Content-Disposition', 'inline');
	c.header('Cache-Control', `public, max-age=${cacheSeconds}`);
	return c.body(svg);
}

app.get('/api/standings/wrap.svg', async (c) => {
	const svg = getSiteSettingsAdminSync().lastMonthlyWrapSvg?.trim();
	if (!svg) return c.json({ error: 'No monthly wrap published yet' }, 404);
	return svgInline(c, svg, 120);
});

app.get('/api/hall-of-fame', async (c) => {
	const fame = await buildHallOfFame();
	return c.json({ fame });
});

app.get('/api/standings/image.svg', async (c) => {
	const published = await PublishedStandings.findOne({ isActive: true }).sort({
		createdAt: -1,
	});
	if (!published?.svgData) return c.json({ error: 'No published standings' }, 404);
	return svgInline(c, published.svgData);
});

app.get('/api/standings/breakdown.svg', async (c) => {
	const published = await PublishedStandings.findOne({ isActive: true }).sort({
		createdAt: -1,
	});
	if (!published?.breakdownSvgData) {
		return c.json({ error: 'No published breakdown' }, 404);
	}
	return svgInline(c, published.breakdownSvgData);
});

app.get('/api/standings/vibes.svg', async (c) => {
	const published = await PublishedStandings.findOne({ isActive: true }).sort({
		createdAt: -1,
	});
	if (!published?.vibesSvgData) {
		return c.json({ error: 'No published vibes' }, 404);
	}
	return svgInline(c, published.vibesSvgData);
});

/** Higher-res PNG for retina embeds / Discord-sized shares (optional). */
const WEB_PNG_WIDTH = 2400;

app.get('/api/standings/image.png', async (c) => {
	const published = await PublishedStandings.findOne({ isActive: true }).sort({
		createdAt: -1,
	});
	if (!published?.svgData) return c.json({ error: 'No published standings' }, 404);

	const png = svgToPng(published.svgData, WEB_PNG_WIDTH);
	c.header('Content-Type', 'image/png');
	c.header('Cache-Control', 'public, max-age=300');
	return c.body(new Uint8Array(png));
});

app.get('/api/standings/breakdown.png', async (c) => {
	const published = await PublishedStandings.findOne({ isActive: true }).sort({
		createdAt: -1,
	});
	if (!published?.breakdownSvgData) {
		return c.json({ error: 'No published breakdown' }, 404);
	}

	const png = svgToPng(published.breakdownSvgData, WEB_PNG_WIDTH);
	c.header('Content-Type', 'image/png');
	c.header('Cache-Control', 'public, max-age=300');
	return c.body(new Uint8Array(png));
});

app.route('/api/auth', authRoutes);
app.use('/api/submissions/*', writeLimiter);
app.route('/api/submissions', submissionRoutes);
app.use('/api/questions/*', writeLimiter);
app.route('/api/questions', questionRoutes);
app.use('/api/profile/avatar', writeLimiter);
app.route('/api/profile', profileRoutes);
app.route('/api/readers', readerRoutes);
app.use('/api/covers/lookup', writeLimiter);
app.use('/api/covers/upload', writeLimiter);
app.route('/api/covers', coverRoutes);
app.route('/api/avatars', avatarRoutes);
app.use('/api/admin/*', adminLimiter);
app.route('/api/admin', adminRoutes);

const __dirname = dirname(fileURLToPath(import.meta.url));
const distPath = join(__dirname, '../../frontend/dist');

if (isProduction && existsSync(distPath)) {
	app.use('*', async (c, next) => {
		if (c.req.path.startsWith('/api')) return next();
		return serveStatic({ root: distPath })(c, next);
	});
	app.get('*', async (c, next) => {
		if (c.req.path.startsWith('/api')) return next();
		return serveStatic({ root: distPath, path: 'index.html' })(c, next);
	});
}

const port = Number(process.env.PORT ?? 3001);

async function main() {
	if (isProduction) {
		const missing: string[] = [];
		if (!process.env.SESSION_SECRET?.trim() || process.env.SESSION_SECRET === 'dev-secret-change-in-production') {
			missing.push('SESSION_SECRET');
		}
		const frontend = process.env.FRONTEND_URL?.trim() ?? '';
		if (!frontend || /localhost|127\.0\.0\.1/i.test(frontend)) {
			missing.push('FRONTEND_URL');
		}
		const apiUrl = process.env.API_URL?.trim() ?? '';
		if (!apiUrl || /localhost|127\.0\.0\.1/i.test(apiUrl)) {
			missing.push('API_URL');
		}
		const emailFrom = process.env.EMAIL_FROM?.trim() ?? '';
		if (!emailFrom || emailFrom.includes('onboarding@resend.dev')) {
			missing.push('EMAIL_FROM');
		}
		if (missing.length) {
			console.error(
				`FATAL: Set ${missing.join(', ')} in server/.env before running in production.`,
			);
			process.exit(1);
		}
	}
	if (isProduction && !existsSync(distPath)) {
		console.warn(
			`Warning: frontend/dist not found at ${distPath}. Run "npm run build --prefix frontend" before starting in production.`,
		);
	}
	if (isProduction && !process.env.MONGODB_URI) {
		console.error(
			'FATAL: Set MONGODB_URI in server/.env for production (e.g. MongoDB Atlas).',
		);
		process.exit(1);
	}
	if (isProduction && !process.env.RESEND_API_KEY) {
		console.error(
			'FATAL: Set RESEND_API_KEY in server/.env for production email.',
		);
		process.exit(1);
	}
	if (isProduction && !process.env.METRICS_TOKEN) {
		console.error(
			'FATAL: Set METRICS_TOKEN in server/.env so /metrics is not public.',
		);
		process.exit(1);
	}

	await connectDb();
	await Promise.all([refreshPromptsCache(), refreshSiteSettingsCache()]);

	wireDiscordGatewaySettingsHook();
	await startDiscordGateway();

	// Checks every 60s whether it's time for the weekly (default Monday) scheduled publish.
	startScheduledPublishChecker();
	startMetricsGaugeRefresh();
	startBetterStackHeartbeat();

	const pngFonts = getSvgFontStatus();
	const pngText = getSvgTextPathStatus();
	if (!pngText.ready) {
		console.warn(
			'[png] DejaVu TTF files missing from server/assets/fonts - Discord standings images may render without text.',
		);
	} else if (!pngFonts.ready) {
		console.log(
			'[png] Text path mode active (Discord PNG text does not rely on system fonts).',
		);
	}

	serve({ fetch: app.fetch, port }, () => {
		const mode = isProduction ? 'production' : 'development';
		log.info(`Server running (${mode}) at http://localhost:${port}`, {
			posthog: isPostHogEnabled(),
			betterstack: betterStackStatus(),
		});
	});
}

async function gracefulShutdown(signal: string) {
	log.info(`Shutting down (${signal})…`);
	await Promise.allSettled([
		stopDiscordGateway(),
		shutdownPostHog(),
		flushBetterStackLogs(),
	]);
	process.exit(0);
}

process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));

main().catch((err) => {
	console.error('Failed to start server:', err);
	process.exit(1);
});
