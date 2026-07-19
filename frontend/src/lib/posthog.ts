import posthog from 'posthog-js'
import type { PublicUser } from './api'
import { APP_VERSION } from './version'

let initialized = false

function key(): string {
	return (import.meta.env.VITE_POSTHOG_KEY ?? '').trim()
}

function host(): string {
	return (
		(import.meta.env.VITE_POSTHOG_HOST ?? '').trim() ||
		'https://eu.i.posthog.com'
	)
}

/** True when a project API key is configured (safe no-op otherwise). */
export function isPostHogEnabled(): boolean {
	return Boolean(key())
}

/**
 * Init PostHog once. Call from main.ts — no-ops when VITE_POSTHOG_KEY is unset
 * so local/dev stays quiet until you opt in.
 */
export function initPostHog(): void {
	if (initialized || !isPostHogEnabled()) return
	initialized = true

	posthog.init(key(), {
		api_host: host(),
		person_profiles: 'identified_only',
		capture_pageview: false, // we send pageviews from the Vue router
		capture_pageleave: true,
		persistence: 'localStorage+cookie',
	})

	posthog.register({
		app: 'readathon',
		app_version: APP_VERSION,
	})
}

export function capturePageview(path: string): void {
	if (!initialized) return
	posthog.capture('$pageview', { $current_url: window.location.href, path })
}

export function identifyUser(user: PublicUser | null): void {
	if (!initialized) return
	if (!user) {
		posthog.reset()
		return
	}
	posthog.identify(user.id, {
		email: user.email ?? undefined,
		name: user.displayName,
		team_id: user.teamId ?? undefined,
		status: user.status,
		is_admin: user.isAdmin,
	})
}

export function captureEvent(
	event: string,
	properties?: Record<string, unknown>,
): void {
	if (!initialized) return
	posthog.capture(event, properties)
}

export { posthog }
