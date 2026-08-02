import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach, mock } from 'node:test'
import {
	betterStackStatus,
	flushBetterStackLogs,
	isBetterStackLogsEnabled,
	log,
	pingBetterStackHeartbeat,
} from './betterstack.js'

describe('betterstack helpers', () => {
	const saved: Record<string, string | undefined> = {}

	beforeEach(() => {
		for (const key of [
			'BETTERSTACK_SOURCE_TOKEN',
			'BETTERSTACK_HEARTBEAT_URL',
			'BETTERSTACK_INGESTING_HOST',
			'BETTERSTACK_ENDPOINT',
			'NODE_ENV',
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

	it('reports logs and heartbeat status from env', () => {
		assert.deepEqual(betterStackStatus(), { logs: false, heartbeat: false })
		process.env.BETTERSTACK_SOURCE_TOKEN = 'src'
		assert.equal(isBetterStackLogsEnabled(), true)
		process.env.BETTERSTACK_HEARTBEAT_URL = 'https://uptime.example/hb'
		assert.deepEqual(betterStackStatus(), { logs: true, heartbeat: true })
	})

	it('pingBetterStackHeartbeat returns false without a URL', async () => {
		assert.equal(await pingBetterStackHeartbeat(), false)
	})

	it('pingBetterStackHeartbeat follows fetch success/failure', async () => {
		process.env.BETTERSTACK_HEARTBEAT_URL = 'https://uptime.example/hb'
		const originalFetch = globalThis.fetch

		globalThis.fetch = mock.fn(async () => new Response('', { status: 200 })) as typeof fetch
		assert.equal(await pingBetterStackHeartbeat(), true)

		globalThis.fetch = mock.fn(async () => new Response('', { status: 503 })) as typeof fetch
		assert.equal(await pingBetterStackHeartbeat(), false)

		globalThis.fetch = originalFetch
	})

	it('log mirrors to console and flush is safe without a client', async () => {
		const infoSpy = mock.method(console, 'log', () => {})
		log.info('hello', { x: 1 })
		assert.equal(infoSpy.mock.callCount(), 1)
		await flushBetterStackLogs()
	})

	it('log.debug prints outside production', () => {
		process.env.NODE_ENV = 'development'
		const debugSpy = mock.method(console, 'debug', () => {})
		log.debug('trace')
		assert.equal(debugSpy.mock.callCount(), 1)
	})
})
