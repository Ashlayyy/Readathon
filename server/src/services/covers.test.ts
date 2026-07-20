import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { isAllowedCoverUrl, lookupBookCover } from './covers.js'

describe('lookupBookCover', () => {
	it('prefers a title+author match over an unrelated cover hit', async () => {
		const originalFetch = globalThis.fetch

		globalThis.fetch = mock.fn(async () => {
			return new Response(
				JSON.stringify({
					docs: [
						{
							key: '/works/OL-wrong',
							title: 'Completely Different Book',
							author_name: ['Someone Else'],
							cover_i: 999,
							edition_count: 100,
						},
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
			const result = await lookupBookCover('The Name of the Wind', 'Patrick Rothfuss')
			assert.ok(result)
			assert.equal(result!.coverUrl, 'https://covers.openlibrary.org/b/id/12345-L.jpg')
		} finally {
			globalThis.fetch = originalFetch
		}
	})

	it('rejects weak title-only matches when author is provided', async () => {
		const originalFetch = globalThis.fetch

		globalThis.fetch = mock.fn(async () => {
			return new Response(
				JSON.stringify({
					docs: [
						{
							key: '/works/OL-noise',
							title: 'Wind',
							author_name: ['Unrelated Author'],
							cover_i: 1,
						},
					],
				}),
				{ status: 200, headers: { 'Content-Type': 'application/json' } },
			)
		}) as typeof fetch

		try {
			const result = await lookupBookCover('The Name of the Wind', 'Patrick Rothfuss')
			assert.equal(result, null)
		} finally {
			globalThis.fetch = originalFetch
		}
	})

	it('falls back across query shapes when first search is empty', async () => {
		const calls: string[] = []
		const originalFetch = globalThis.fetch

		globalThis.fetch = mock.fn(async (input: RequestInfo | URL) => {
			const url = String(input)
			calls.push(url)

			if (url.includes('author=')) {
				return new Response(JSON.stringify({ docs: [] }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				})
			}

			return new Response(
				JSON.stringify({
					docs: [
						{
							key: '/works/OL1W',
							title: 'The Name of the Wind',
							author_name: ['Patrick Rothfuss'],
							cover_i: 12345,
							edition_count: 40,
						},
					],
				}),
				{ status: 200, headers: { 'Content-Type': 'application/json' } },
			)
		}) as typeof fetch

		try {
			const result = await lookupBookCover('The Name of the Wind', 'Patrick Rothfuss')
			assert.ok(result)
			assert.equal(result!.coverUrl, 'https://covers.openlibrary.org/b/id/12345-L.jpg')
			assert.ok(calls.length >= 2, 'expected at least one author attempt then a fallback')
		} finally {
			globalThis.fetch = originalFetch
		}
	})
})

describe('isAllowedCoverUrl', () => {
	it('allows open library and local upload paths', () => {
		assert.equal(isAllowedCoverUrl(null), true)
		assert.equal(
			isAllowedCoverUrl('https://covers.openlibrary.org/b/id/12345-L.jpg'),
			true,
		)
		assert.equal(isAllowedCoverUrl('/api/covers/files/abc123.jpg'), true)
		assert.equal(isAllowedCoverUrl('/covers/files/abc123.jpg'), true)
		assert.equal(isAllowedCoverUrl('https://evil.example/x.png'), false)
	})
})
