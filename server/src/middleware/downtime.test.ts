import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { Hono } from 'hono'
import { createDowntimeGuard } from './downtime.js'

function buildApp(
	deps: Parameters<typeof createDowntimeGuard>[0],
	path = '/api/books',
) {
	const app = new Hono()
	app.use('*', createDowntimeGuard(deps))
	app.get(path, (c) => c.json({ ok: true }))
	app.get('/api/health', (c) => c.json({ status: 'ok' }))
	app.get('/api/config', (c) => c.json({ ok: true }))
	app.get('/api/auth/login', (c) => c.json({ ok: true }))
	return app
}

describe('createDowntimeGuard', () => {
	it('passes through when downtime mode is off', async () => {
		const app = buildApp({
			getSiteSettingsSync: () => ({ downtimeMode: false } as ReturnType<typeof import('../services/siteSettings.js').getSiteSettingsSync>),
			getSessionUser: mock.fn(async () => null),
			userIsAdmin: () => false,
		})

		const res = await app.request('http://localhost/api/books')
		assert.equal(res.status, 200)
	})

	it('allows exempt health and config paths during downtime', async () => {
		const deps = {
			getSiteSettingsSync: () => ({ downtimeMode: true } as ReturnType<typeof import('../services/siteSettings.js').getSiteSettingsSync>),
			getSessionUser: mock.fn(async () => null),
			userIsAdmin: () => false,
		}
		const app = buildApp(deps)

		assert.equal((await app.request('http://localhost/api/health')).status, 200)
		assert.equal((await app.request('http://localhost/api/config')).status, 200)
	})

	it('allows /api/auth routes during downtime', async () => {
		const app = buildApp({
			getSiteSettingsSync: () => ({ downtimeMode: true } as ReturnType<typeof import('../services/siteSettings.js').getSiteSettingsSync>),
			getSessionUser: mock.fn(async () => null),
			userIsAdmin: () => false,
		})

		const res = await app.request('http://localhost/api/auth/login')
		assert.equal(res.status, 200)
	})

	it('returns 503 for non-exempt routes when downtime is on', async () => {
		const app = buildApp({
			getSiteSettingsSync: () => ({ downtimeMode: true } as ReturnType<typeof import('../services/siteSettings.js').getSiteSettingsSync>),
			getSessionUser: mock.fn(async () => null),
			userIsAdmin: () => false,
		})

		const res = await app.request('http://localhost/api/books')
		assert.equal(res.status, 503)
		const body = (await res.json()) as { error: string; downtime: boolean }
		assert.match(body.error, /temporarily unavailable/)
		assert.equal(body.downtime, true)
	})

	it('allows admins through during downtime', async () => {
		const app = buildApp({
			getSiteSettingsSync: () => ({ downtimeMode: true } as ReturnType<typeof import('../services/siteSettings.js').getSiteSettingsSync>),
			getSessionUser: mock.fn(async () => ({ displayName: 'Admin' })),
			userIsAdmin: () => true,
		})

		const res = await app.request('http://localhost/api/books')
		assert.equal(res.status, 200)
	})
})
