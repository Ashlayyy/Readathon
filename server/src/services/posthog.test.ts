import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach, mock } from 'node:test'
import {
	captureServerEvent,
	getPostHog,
	isPostHogEnabled,
	shutdownPostHog,
} from './posthog.js'

describe('posthog helpers', () => {
	const saved: Record<string, string | undefined> = {}

	beforeEach(() => {
		saved.POSTHOG_API_KEY = process.env.POSTHOG_API_KEY
		saved.POSTHOG_HOST = process.env.POSTHOG_HOST
		delete process.env.POSTHOG_API_KEY
		delete process.env.POSTHOG_HOST
	})

	afterEach(async () => {
		await shutdownPostHog()
		if (saved.POSTHOG_API_KEY === undefined) delete process.env.POSTHOG_API_KEY
		else process.env.POSTHOG_API_KEY = saved.POSTHOG_API_KEY
		if (saved.POSTHOG_HOST === undefined) delete process.env.POSTHOG_HOST
		else process.env.POSTHOG_HOST = saved.POSTHOG_HOST
	})

	it('getPostHog returns null without an API key', () => {
		assert.equal(getPostHog(), null)
		assert.equal(isPostHogEnabled(), false)
	})

	it('captureServerEvent is a no-op when disabled', () => {
		assert.doesNotThrow(() => captureServerEvent('user-1', 'test_event', { foo: 1 }))
	})

	it('creates a client when configured and capture does not throw', () => {
		process.env.POSTHOG_API_KEY = 'phc_test_key'
		process.env.POSTHOG_HOST = 'https://eu.i.posthog.com'
		assert.equal(isPostHogEnabled(), true)
		assert.ok(getPostHog())
		assert.doesNotThrow(() =>
			captureServerEvent('', 'server_boot', { route: '/health' }),
		)
	})

	it('logs capture failures without throwing', () => {
		process.env.POSTHOG_API_KEY = 'phc_test_key'
		const client = getPostHog()!
		const errorSpy = mock.method(console, 'error', () => {})
		mock.method(client, 'capture', () => {
			throw new Error('network down')
		})

		captureServerEvent('u1', 'fail_event')
		assert.equal(errorSpy.mock.callCount(), 1)
	})
})
