import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Hono } from 'hono'
import { rateLimit } from './rateLimit.js'

function buildApp(opts: { windowMs?: number; max?: number; keyPrefix?: string } = {}) {
	const app = new Hono()
	app.use(
		'/test/*',
		rateLimit({
			windowMs: opts.windowMs ?? 60_000,
			max: opts.max ?? 1,
			keyPrefix: opts.keyPrefix ?? 'rl-test',
		}),
	)
	app.get('/test/ok', (c) => c.json({ ok: true }))
	return app
}

async function get(
	app: Hono,
	path: string,
	headers: Record<string, string> = {},
): Promise<Response> {
	return app.request(path, { headers })
}

describe('rateLimit', () => {
	it('allows requests up to max then returns 429', async () => {
		const app = buildApp({ max: 1, keyPrefix: 'single-hit' })

		const first = await get(app, 'http://localhost/test/ok')
		assert.equal(first.status, 200)

		const second = await get(app, 'http://localhost/test/ok')
		assert.equal(second.status, 429)
		const body = (await second.json()) as { error: string }
		assert.match(body.error, /Too many requests/)
		assert.ok(second.headers.get('Retry-After'))
	})

	it('keys buckets separately by x-forwarded-for', async () => {
		const app = buildApp({ max: 1, keyPrefix: 'xff-key' })

		const aliceFirst = await get(app, 'http://localhost/test/ok', {
			'x-forwarded-for': '203.0.113.1',
		})
		const aliceSecond = await get(app, 'http://localhost/test/ok', {
			'x-forwarded-for': '203.0.113.1',
		})
		const bobFirst = await get(app, 'http://localhost/test/ok', {
			'x-forwarded-for': '203.0.113.2',
		})

		assert.equal(aliceFirst.status, 200)
		assert.equal(aliceSecond.status, 429)
		assert.equal(bobFirst.status, 200)
	})

	it('uses the first address in a comma-separated x-forwarded-for chain', async () => {
		const app = buildApp({ max: 1, keyPrefix: 'xff-chain' })

		const first = await get(app, 'http://localhost/test/ok', {
			'x-forwarded-for': '198.51.100.10, 10.0.0.1',
		})
		const second = await get(app, 'http://localhost/test/ok', {
			'x-forwarded-for': '198.51.100.10, 10.0.0.2',
		})

		assert.equal(first.status, 200)
		assert.equal(second.status, 429)
	})
})
