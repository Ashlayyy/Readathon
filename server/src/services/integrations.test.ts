import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { isPostHogEnabled } from './posthog.js'
import { betterStackStatus, isBetterStackLogsEnabled } from './betterstack.js'

describe('integrations env toggles', () => {
	const saved: Record<string, string | undefined> = {}

	beforeEach(() => {
		for (const key of [
			'POSTHOG_API_KEY',
			'BETTERSTACK_SOURCE_TOKEN',
			'BETTERSTACK_HEARTBEAT_URL',
		]) {
			saved[key] = process.env[key]
			delete process.env[key]
		}
	})

	afterEach(() => {
		for (const [key, value] of Object.entries(saved)) {
			if (value === undefined) delete process.env[key]
			else process.env[key] = value
		}
	})

	it('PostHog is disabled when POSTHOG_API_KEY is unset', () => {
		assert.equal(isPostHogEnabled(), false)
	})

	it('PostHog is enabled when POSTHOG_API_KEY is set', () => {
		process.env.POSTHOG_API_KEY = 'phx_test'
		assert.equal(isPostHogEnabled(), true)
	})

	it('Better Stack logs/heartbeat report independently', () => {
		assert.deepEqual(betterStackStatus(), { logs: false, heartbeat: false })
		assert.equal(isBetterStackLogsEnabled(), false)

		process.env.BETTERSTACK_SOURCE_TOKEN = 'token'
		assert.equal(isBetterStackLogsEnabled(), true)
		assert.deepEqual(betterStackStatus(), { logs: true, heartbeat: false })

		process.env.BETTERSTACK_HEARTBEAT_URL = 'https://example.com/hb'
		assert.deepEqual(betterStackStatus(), { logs: true, heartbeat: true })
	})
})
