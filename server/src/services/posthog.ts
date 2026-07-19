import { PostHog } from 'posthog-node'
import { APP_VERSION } from '../lib/version.js'

let client: PostHog | null = null

function apiKey(): string {
	return (process.env.POSTHOG_API_KEY ?? '').trim()
}

function host(): string {
	return (
		(process.env.POSTHOG_HOST ?? '').trim() || 'https://eu.i.posthog.com'
	)
}

/** Lazy singleton — null when POSTHOG_API_KEY is unset. */
export function getPostHog(): PostHog | null {
	const key = apiKey()
	if (!key) return null
	if (!client) {
		client = new PostHog(key, {
			host: host(),
			flushAt: 10,
			flushInterval: 5000,
		})
	}
	return client
}

export function isPostHogEnabled(): boolean {
	return Boolean(apiKey())
}

/**
 * Fire-and-forget product analytics. Never throws — missing config is a silent no-op.
 */
export function captureServerEvent(
	distinctId: string,
	event: string,
	properties?: Record<string, unknown>,
): void {
	const ph = getPostHog()
	if (!ph) return
	try {
		ph.capture({
			distinctId: distinctId || 'anonymous',
			event,
			properties: {
				app: 'readathon',
				app_version: APP_VERSION,
				source: 'server',
				...properties,
			},
		})
	} catch (e) {
		console.error('[posthog] capture failed:', e)
	}
}

/** Flush pending events on shutdown (best-effort). */
export async function shutdownPostHog(): Promise<void> {
	if (!client) return
	try {
		await client.shutdown()
	} catch (e) {
		console.error('[posthog] shutdown failed:', e)
	} finally {
		client = null
	}
}
