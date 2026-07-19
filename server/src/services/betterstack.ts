import { Logtail } from '@logtail/node'
import { APP_VERSION } from '../lib/version.js'

type LogFields = Record<string, unknown>

let logtail: Logtail | null = null
let heartbeatTimer: ReturnType<typeof setInterval> | null = null

function sourceToken(): string {
	return (process.env.BETTERSTACK_SOURCE_TOKEN ?? '').trim()
}

function heartbeatUrl(): string {
	return (process.env.BETTERSTACK_HEARTBEAT_URL ?? '').trim()
}

function ingestHost(): string | undefined {
	const host = (process.env.BETTERSTACK_INGESTING_HOST ?? '').trim()
	return host || undefined
}

export function isBetterStackLogsEnabled(): boolean {
	return Boolean(sourceToken())
}

function getLogtail(): Logtail | null {
	const token = sourceToken()
	if (!token) return null
	if (!logtail) {
		const endpoint =
			(process.env.BETTERSTACK_ENDPOINT ?? '').trim() ||
			(ingestHost() ? `https://${ingestHost()}` : undefined)
		logtail = endpoint
			? new Logtail(token, { endpoint })
			: new Logtail(token)
	}
	return logtail
}

function baseFields(fields?: LogFields): LogFields {
	return {
		app: 'readathon',
		app_version: APP_VERSION,
		env: process.env.NODE_ENV ?? 'development',
		...fields,
	}
}

/** Structured logger — mirrors to console always; ships to Better Stack when configured. */
export const log = {
	info(message: string, fields?: LogFields) {
		console.log(message, fields ?? '')
		void getLogtail()?.info(message, baseFields(fields))
	},
	warn(message: string, fields?: LogFields) {
		console.warn(message, fields ?? '')
		void getLogtail()?.warn(message, baseFields(fields))
	},
	error(message: string, fields?: LogFields) {
		console.error(message, fields ?? '')
		void getLogtail()?.error(message, baseFields(fields))
	},
	debug(message: string, fields?: LogFields) {
		if (process.env.NODE_ENV !== 'production') {
			console.debug(message, fields ?? '')
		}
		void getLogtail()?.debug(message, baseFields(fields))
	},
}

/**
 * Ping a Better Stack Uptime heartbeat URL (cron-style).
 * Create a Heartbeat monitor in Better Stack and paste its URL into BETTERSTACK_HEARTBEAT_URL.
 */
export async function pingBetterStackHeartbeat(): Promise<boolean> {
	const url = heartbeatUrl()
	if (!url) return false
	try {
		const res = await fetch(url, { method: 'GET' })
		if (!res.ok) {
			console.error('[betterstack] heartbeat ping failed', res.status)
			return false
		}
		return true
	} catch (e) {
		console.error('[betterstack] heartbeat ping error:', e)
		return false
	}
}

/** Start periodic heartbeats (default every 60s). No-op without BETTERSTACK_HEARTBEAT_URL. */
export function startBetterStackHeartbeat(intervalMs = 60_000): void {
	if (!heartbeatUrl() || heartbeatTimer) return
	void pingBetterStackHeartbeat()
	heartbeatTimer = setInterval(() => {
		void pingBetterStackHeartbeat()
	}, intervalMs)
	heartbeatTimer.unref?.()
	log.info('[betterstack] Heartbeat pinger started', { intervalMs })
}

export async function flushBetterStackLogs(): Promise<void> {
	if (!logtail) return
	try {
		await logtail.flush()
	} catch (e) {
		console.error('[betterstack] log flush failed:', e)
	}
}

export function betterStackStatus(): {
	logs: boolean
	heartbeat: boolean
} {
	return {
		logs: isBetterStackLogsEnabled(),
		heartbeat: Boolean(heartbeatUrl()),
	}
}
