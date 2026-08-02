import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'
import { Hono } from 'hono'
import { mock } from 'node:test'
import { sign } from 'hono/jwt'
import { User } from '../db/models/User.js'
import { startMemoryMongo, type MemoryMongo } from '../test/memoryMongo.js'
import { coverRoutes } from './covers.js'

describe('cover routes', () => {
	let db: MemoryMongo

	before(async () => {
		db = await startMemoryMongo()
	})

	after(async () => {
		await db.stop()
	})

	function app() {
		const hono = new Hono()
		hono.route('/api/covers', coverRoutes)
		return hono
	}

	it('GET /lookup requires a title of at least 2 characters', async () => {
		const res = await app().request('http://localhost/api/covers/lookup?title=x')
		assert.equal(res.status, 400)
		const body = (await res.json()) as { error: string }
		assert.match(body.error, /Title is required/)
	})

	it('POST /upload requires image data for an authenticated user', async () => {
		const user = await User.create({
			displayName: 'Cover Reader',
			email: 'cover@example.test',
		})
		const token = await sign(
			{ userId: user._id.toString(), exp: Math.floor(Date.now() / 1000) + 3600 },
			'dev-secret-change-in-production',
			'HS256',
		)

		const res = await app().request('http://localhost/api/covers/upload', {
			method: 'POST',
			headers: {
				Cookie: `realm_session=${token}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({}),
		})

		assert.equal(res.status, 400)
		assert.deepEqual(await res.json(), { error: 'Image data is required' })
	})

	it('GET /lookup returns the best Open Library cover match', async () => {
		const originalFetch = globalThis.fetch
		globalThis.fetch = mock.fn(async () => {
			return new Response(
				JSON.stringify({
					docs: [
						{
							key: '/works/OL1W',
							title: 'The Name of the Wind',
							author_name: ['Patrick Rothfuss'],
							cover_i: 12345,
							edition_count: 50,
						},
					],
				}),
				{ status: 200, headers: { 'Content-Type': 'application/json' } },
			)
		}) as typeof fetch

		try {
			const res = await app().request(
				'http://localhost/api/covers/lookup?title=The%20Name%20of%20the%20Wind&author=Patrick%20Rothfuss',
			)
			assert.equal(res.status, 200)
			const body = (await res.json()) as {
				cover: { coverUrl: string } | null
				candidates: unknown[]
			}
			assert.ok(body.cover)
			assert.equal(body.cover!.coverUrl, 'https://covers.openlibrary.org/b/id/12345-L.jpg')
			assert.ok(Array.isArray(body.candidates))
		} finally {
			globalThis.fetch = originalFetch
		}
	})
})
