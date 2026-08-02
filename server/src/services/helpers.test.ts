import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ACTIVE_SUB_FILTER, withActive } from '../db/activeSubmission.js'
import { normalizeRoute } from '../services/metrics.js'
import { booksMatch } from '../services/scoring.js'
import {
	DISCORD_TEST_WEBHOOK_CONTENT,
	formatDiscordWrapRange,
} from '../services/discord.js'

describe('withActive', () => {
	it('exports deletedAt: null as the active filter', () => {
		assert.deepEqual(ACTIVE_SUB_FILTER, { deletedAt: null })
	})

	it('merges deletedAt: null onto an empty filter', () => {
		assert.deepEqual(withActive(), { deletedAt: null })
	})

	it('preserves existing filter keys', () => {
		assert.deepEqual(withActive({ userId: 'abc', submissionType: 'add' }), {
			userId: 'abc',
			submissionType: 'add',
			deletedAt: null,
		})
	})

	it('overwrites a caller-provided deletedAt', () => {
		assert.deepEqual(withActive({ deletedAt: new Date() }), {
			deletedAt: null,
		})
	})
})

describe('normalizeRoute', () => {
	it('strips query strings', () => {
		assert.equal(normalizeRoute('/api/foo?x=1'), '/api/foo')
	})

	it('collapses Mongo ObjectIds', () => {
		assert.equal(
			normalizeRoute('/api/admin/submissions/507f1f77bcf86cd799439011'),
			'/api/admin/submissions/:id',
		)
	})

	it('collapses numeric path segments', () => {
		assert.equal(normalizeRoute('/api/things/42/edit'), '/api/things/:n/edit')
	})

	it('collapses week keys', () => {
		assert.equal(normalizeRoute('/api/standings/W29'), '/api/standings/:week')
	})
})

describe('booksMatch', () => {
	it('matches case-insensitively and trims whitespace', () => {
		assert.equal(
			booksMatch(
				{ bookTitle: '  The Crucible ', bookAuthor: 'Miller' },
				{ bookTitle: 'the crucible', bookAuthor: ' miller ' },
			),
			true,
		)
	})

	it('rejects different titles', () => {
		assert.equal(
			booksMatch(
				{ bookTitle: 'A', bookAuthor: 'Same' },
				{ bookTitle: 'B', bookAuthor: 'Same' },
			),
			false,
		)
	})

	it('rejects different authors', () => {
		assert.equal(
			booksMatch(
				{ bookTitle: 'Same', bookAuthor: 'A' },
				{ bookTitle: 'Same', bookAuthor: 'B' },
			),
			false,
		)
	})
})

describe('Discord test webhook content', () => {
	it('is exactly the agreed smoke-test string with no role mention', () => {
		assert.equal(DISCORD_TEST_WEBHOOK_CONTENT, 'This is a test message!')
		assert.doesNotMatch(DISCORD_TEST_WEBHOOK_CONTENT, /<@&?\d+>/)
		assert.doesNotMatch(DISCORD_TEST_WEBHOOK_CONTENT, /@everyone|@here/i)
	})
})

describe('formatDiscordWrapRange', () => {
	it('formats ISO wrap labels into a readable range', () => {
		assert.equal(
			formatDiscordWrapRange('2026-07-06 → 2026-08-02 (4 weeks)'),
			'Jul 6 - Aug 2, 2026',
		)
	})
})
