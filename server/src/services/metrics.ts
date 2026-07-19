import client from 'prom-client'
import mongoose from 'mongoose'
import { User } from '../db/models/User.js'
import { Submission } from '../db/models/Submission.js'
import { Question } from '../db/models/Question.js'
import { withActive } from '../db/activeSubmission.js'

const register = new client.Registry()
client.collectDefaultMetrics({
	register,
	prefix: 'readathon_',
})

export const httpRequestsTotal = new client.Counter({
	name: 'readathon_http_requests_total',
	help: 'Total HTTP requests handled by the API',
	labelNames: ['method', 'route', 'status'] as const,
	registers: [register],
})

export const httpRequestDuration = new client.Histogram({
	name: 'readathon_http_request_duration_seconds',
	help: 'HTTP request duration in seconds',
	labelNames: ['method', 'route', 'status'] as const,
	buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
	registers: [register],
})

export const submissionsCreatedTotal = new client.Counter({
	name: 'readathon_submissions_created_total',
	help: 'Books logged (submissions created)',
	labelNames: ['type', 'format'] as const,
	registers: [register],
})

export const standingsPublishTotal = new client.Counter({
	name: 'readathon_standings_publish_total',
	help: 'Standings publish attempts',
	labelNames: ['result', 'source'] as const,
	registers: [register],
})

export const discordWebhookTotal = new client.Counter({
	name: 'readathon_discord_webhook_total',
	help: 'Discord webhook posts (standings publish, test, team chat)',
	labelNames: ['kind', 'result'] as const,
	registers: [register],
})

export const emailsSentTotal = new client.Counter({
	name: 'readathon_emails_sent_total',
	help: 'Transactional emails attempted',
	labelNames: ['kind', 'result'] as const,
	registers: [register],
})

const usersGauge = new client.Gauge({
	name: 'readathon_users',
	help: 'Users by status',
	labelNames: ['status'] as const,
	registers: [register],
})

const submissionsGauge = new client.Gauge({
	name: 'readathon_submissions',
	help: 'Submission counts',
	labelNames: ['state'] as const,
	registers: [register],
})

const questionsOpenGauge = new client.Gauge({
	name: 'readathon_questions_open',
	help: 'Unread / unanswered reader questions',
	registers: [register],
})

const mongodbUp = new client.Gauge({
	name: 'readathon_mongodb_up',
	help: '1 if MongoDB connection is ready, else 0',
	registers: [register],
})

const appInfo = new client.Gauge({
	name: 'readathon_app_info',
	help: 'Static app info (always 1)',
	labelNames: ['version'] as const,
	registers: [register],
})

let gaugeRefreshStarted = false
let lastGaugeRefresh = 0
const GAUGE_REFRESH_MS = 30_000

/** Collapse dynamic path segments so Prometheus cardinality stays low. */
export function normalizeRoute(path: string): string {
	const raw = path.split('?')[0] ?? path
	return raw
		.replace(
			/[0-9a-f]{24}/gi,
			':id',
		)
		.replace(/\/\d+/g, '/:n')
		.replace(/\/W\d{2}/gi, '/:week')
}

export function setAppVersion(version: string): void {
	appInfo.reset()
	appInfo.labels(version).set(1)
}

export async function refreshBusinessGauges(): Promise<void> {
	const now = Date.now()
	if (now - lastGaugeRefresh < GAUGE_REFRESH_MS) return
	lastGaugeRefresh = now

	mongodbUp.set(mongoose.connection.readyState === 1 ? 1 : 0)

	try {
		const [pending, assigned, activeSubs, deletedSubs, openQuestions] =
			await Promise.all([
				User.countDocuments({ status: 'pending' }),
				User.countDocuments({ status: 'assigned' }),
				Submission.countDocuments(withActive()),
				Submission.countDocuments({ deletedAt: { $ne: null } }),
				Question.countDocuments({ status: 'unread' }),
			])

		usersGauge.labels('pending').set(pending)
		usersGauge.labels('assigned').set(assigned)
		submissionsGauge.labels('active').set(activeSubs)
		submissionsGauge.labels('deleted').set(deletedSubs)
		questionsOpenGauge.set(openQuestions)
	} catch (e) {
		console.error('[metrics] gauge refresh failed:', e)
		mongodbUp.set(0)
	}
}

export function startMetricsGaugeRefresh(): void {
	if (gaugeRefreshStarted) return
	gaugeRefreshStarted = true
	void refreshBusinessGauges()
	setInterval(() => {
		void refreshBusinessGauges()
	}, GAUGE_REFRESH_MS).unref?.()
}

export async function renderMetrics(): Promise<string> {
	await refreshBusinessGauges()
	return register.metrics()
}

export function metricsContentType(): string {
	return register.contentType
}
