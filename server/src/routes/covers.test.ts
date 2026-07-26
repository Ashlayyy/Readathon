import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { Hono } from 'hono'
import { mock } from 'node:test'
import { connectDb, disconnectDb } from '../db/connect.js'
import { coverRoutes } from './covers.js'

describe('cover routes', () => {
	let mongod: MongoMemoryServer
	const savedUri = process.env.MONGODB_URI

	before(async () => {
		mongod = await MongoMemoryServer.create()
		process.env.MONGODB_URI = mongod.getUri()
		await connectDb()
	})

	after(async () => {
		await disconnectDb()
		await mongod.stop()
		if (savedUri === undefined) delete process.env.MONGODB_URI
		else process.env.MONGODB_URI = savedUri
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
