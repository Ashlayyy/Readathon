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
import { connectDb } from './db/connect.js';
import { User } from './db/models/User.js';
import { Submission } from './db/models/Submission.js';
import { withActive } from './db/activeSubmission.js';
import { refreshPromptsCache, getConfig } from './services/prompts.js';
import {
	refreshSiteSettingsCache,
	getSiteSettingsSync,
	getActiveMonthlyEventSync,
} from './services/siteSettings.js';
import { enrichActiveMonthlyEvent } from './services/monthlyThemeExtras.js';
import { PublishedStandings } from './db/models/PublishedStandings.js';
import { startScheduledPublishChecker } from './services/scheduledPublish.js';
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

app.use(
	'*',
	cors({
		origin: frontendOrigin,
		credentials: true,
	}),
);

app.use('*', metricsMiddleware);

/** Prometheus scrape target. Optional bearer: METRICS_TOKEN */
app.get('/metrics', async (c) => {
	const token = process.env.METRICS_TOKEN?.trim();
	if (token) {
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

app.get('/api/health', (c) =>
	c.json({
		status: 'ok',
		version: APP_VERSION,
		pngFonts: getSvgFontStatus(),
		pngText: getSvgTextPathStatus(),
		integrations: {
			posthog: isPostHogEnabled(),
			betterstack: betterStackStatus(),
		},
	}),
);

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
	const subs = await Submission.find(withActive());

	const userIds = [...new Set(subs.map((s) => s.userId.toString()))];
	const users = await User.find({ _id: { $in: userIds } });
	const teamByUserId = new Map(
		users.map((u) => [u._id.toString(), u.teamId]),
	);

	const withEffectiveDate = subs.map((sub) => ({
		sub,
		effectiveDate: sub.finishedAt
			? new Date(sub.finishedAt)
			: (sub.createdAt ?? new Date(0)),
	}));

	withEffectiveDate.sort(
		(a, b) => b.effectiveDate.getTime() - a.effectiveDate.getTime(),
	);

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
	});
});

function svgInline(c: { header: (k: string, v: string) => void; body: (b: string) => Response }, svg: string, cacheSeconds = 300) {
	c.header('Content-Type', 'image/svg+xml; charset=utf-8');
	c.header('Content-Disposition', 'inline');
	c.header('Cache-Control', `public, max-age=${cacheSeconds}`);
	return c.body(svg);
}

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
app.use('/api/covers/upload', writeLimiter);
app.route('/api/covers', coverRoutes);
app.route('/api/avatars', avatarRoutes);
app.use('/api/admin/*', adminLimiter);
app.route('/api/admin', adminRoutes);

const __dirname = dirname(fileURLToPath(import.meta.url));
const distPath = join(__dirname, '../../frontend/dist');
const isProduction = process.env.NODE_ENV === 'production';

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

	await connectDb();
	await Promise.all([refreshPromptsCache(), refreshSiteSettingsCache()]);

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
	await Promise.allSettled([shutdownPostHog(), flushBetterStackLogs()]);
	process.exit(0);
}

process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));

main().catch((err) => {
	console.error('Failed to start server:', err);
	process.exit(1);
});
