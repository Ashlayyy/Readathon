import assert from 'node:assert/strict'
import { describe, it, mock, afterEach } from 'node:test'
import { Submission } from '../db/models/Submission.js'
import {
	applyCoverUpdates,
	listCoverProposals,
	streamCoverLookups,
	type CoverApplyUpdate,
} from './coverBackfill.js'

const allowedCover = 'https://covers.openlibrary.org/b/id/12345-L.jpg'

const submissionRow = {
	_id: { toString: () => '507f1f77bcf86cd799439011' },
	bookTitle: 'Dune',
	bookAuthor: 'Frank Herbert',
	coverUrl: '  https://covers.openlibrary.org/b/id/1-L.jpg  ',
}

function stubActiveSubmissions() {
	mock.method(Submission, 'find', () => ({
		sort: async () => [submissionRow],
	}))
}

describe('applyCoverUpdates validation', () => {
	it('rejects empty updates', async () => {
		const result = await applyCoverUpdates([])
		assert.deepEqual(result, {
			ok: false,
			error: 'Select at least one cover to apply.',
		})
	})

	it('rejects non-array input', async () => {
		const result = await applyCoverUpdates(null as unknown as CoverApplyUpdate[])
		assert.equal(result.ok, false)
	})

	it('rejects batches over the max size', async () => {
		const updates = Array.from({ length: 501 }, (_, i) => ({
			id: String(i),
			coverUrl: allowedCover,
		}))
		const result = await applyCoverUpdates(updates)
		assert.match((result as { error: string }).error, /Too many updates/)
	})

	it('rejects rows missing id or coverUrl', async () => {
		const result = await applyCoverUpdates([{ id: '  ', coverUrl: allowedCover }])
		assert.equal(result.ok, false)
		assert.match((result as { error: string }).error, /id and coverUrl/)
	})

	it('rejects disallowed cover URLs', async () => {
		const result = await applyCoverUpdates([
			{ id: '507f1f77bcf86cd799439011', coverUrl: 'https://evil.example/x.png' },
		])
		assert.equal(result.ok, false)
		assert.match((result as { error: string }).error, /Disallowed cover URL/)
	})
})

describe('listCoverProposals', () => {
	afterEach(() => {
		mock.restoreAll()
	})

	it('maps active submissions', async () => {
		stubActiveSubmissions()
		const rows = await listCoverProposals()

		assert.equal(rows.length, 1)
		assert.deepEqual(rows[0], {
			id: '507f1f77bcf86cd799439011',
			bookTitle: 'Dune',
			bookAuthor: 'Frank Herbert',
			currentCoverUrl: 'https://covers.openlibrary.org/b/id/1-L.jpg',
			proposedCoverUrl: null,
		})
	})
})

describe('streamCoverLookups', () => {
	const originalFetch = globalThis.fetch

	afterEach(() => {
		globalThis.fetch = originalFetch
		mock.restoreAll()
	})

	it('reports progress and counts lookups', async () => {
		stubActiveSubmissions()
		globalThis.fetch = mock.fn(async () => {
			return new Response(
				JSON.stringify({
					docs: [
						{
							key: '/works/OL1W',
							title: 'Dune',
							author_name: ['Frank Herbert'],
							cover_i: 12345,
							edition_count: 50,
						},
					],
				}),
				{ status: 200, headers: { 'Content-Type': 'application/json' } },
			)
		}) as typeof fetch

		const progress: { id: string; proposedCoverUrl: string | null }[] = []
		const result = await streamCoverLookups(async (update) => {
			progress.push(update)
		})

		assert.equal(result.lookedUp, 1)
		assert.deepEqual(progress, [
			{ id: '507f1f77bcf86cd799439011', proposedCoverUrl: allowedCover },
		])
	})
})

describe('applyCoverUpdates success', () => {
	afterEach(() => {
		mock.restoreAll()
	})

	it('updates allowed covers', async () => {
		const updateOneMock = mock.method(Submission, 'updateOne', async () => ({
			matchedCount: 1,
		}))

		const result = await applyCoverUpdates([
			{ id: '507f1f77bcf86cd799439011', coverUrl: allowedCover },
		])

		assert.deepEqual(result, { ok: true, updated: 1, skipped: 0 })
		assert.equal(updateOneMock.mock.calls.length, 1)
	})
})
