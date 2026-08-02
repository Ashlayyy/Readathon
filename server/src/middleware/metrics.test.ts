import assert from 'node:assert/strict'
import { describe, it, mock, afterEach } from 'node:test'
import { Hono } from 'hono'
import { metricsMiddleware } from './metrics.js'
import * as metricsService from '../services/metrics.js'

afterEach(() => {
	mock.restoreAll()
})

function buildApp() {
	const app = new Hono()
	app.use('*', metricsMiddleware)
	app.get('/api/health', (c) => c.json({ ok: true }))
	app.get('/metrics', (c) => c.text('metrics'))
	return app
}

describe('metricsMiddleware', () => {
	it('records request count and duration for normal routes', async () => {
		const inc = mock.fn()
		const observe = mock.fn()
		mock.method(metricsService.httpRequestsTotal, 'labels', () => ({ inc }))
		mock.method(metricsService.httpRequestDuration, 'labels', () => ({ observe }))

		const res = await buildApp().request('http://localhost/api/health')
		assert.equal(res.status, 200)

		assert.equal(inc.mock.callCount(), 1)
		assert.equal(observe.mock.callCount(), 1)
		assert.deepEqual(metricsService.httpRequestsTotal.labels.mock.calls[0]?.arguments, [
			'GET',
			'/api/health',
			'200',
		])
	})

	it('skips instrumentation for the /metrics scrape endpoint', async () => {
		const inc = mock.fn()
		mock.method(metricsService.httpRequestsTotal, 'labels', () => ({ inc }))
		mock.method(metricsService.httpRequestDuration, 'labels', () => ({ observe: mock.fn() }))

		const res = await buildApp().request('http://localhost/metrics')
		assert.equal(res.status, 200)
		assert.equal(inc.mock.callCount(), 0)
	})
})

describe('normalizeRoute', () => {
	it('collapses object ids and numeric segments', () => {
		assert.equal(
			metricsService.normalizeRoute('/api/users/507f1f77bcf86cd799439011'),
			'/api/users/:id',
		)
		assert.equal(metricsService.normalizeRoute('/api/posts/42/comments'), '/api/posts/:n/comments')
		assert.equal(metricsService.normalizeRoute('/weeks/2026-W29'), '/weeks/:n-W29')
	})
})
