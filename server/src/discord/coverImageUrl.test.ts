import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import {
	isDiscordInvalidImageUrlError,
	resolveDiscordCoverImageUrl,
} from './coverImageUrl.js'

describe('resolveDiscordCoverImageUrl', () => {
	const prevApi = process.env.API_URL

	before(() => {
		process.env.API_URL = 'https://api.bookbaddies.net'
	})

	after(() => {
		if (prevApi === undefined) delete process.env.API_URL
		else process.env.API_URL = prevApi
	})

	it('passes through Open Library https URLs', () => {
		assert.equal(
			resolveDiscordCoverImageUrl(
				'https://covers.openlibrary.org/b/id/12345-L.jpg',
			),
			'https://covers.openlibrary.org/b/id/12345-L.jpg',
		)
	})

	it('absolutizes uploaded /covers/files via API_URL (public API host)', () => {
		assert.equal(
			resolveDiscordCoverImageUrl('/covers/files/abc123.jpg'),
			'https://api.bookbaddies.net/covers/files/abc123.jpg',
		)
	})

	it('absolutizes /api/covers/files paths to the same public path', () => {
		assert.equal(
			resolveDiscordCoverImageUrl('/api/covers/files/abc123.webp'),
			'https://api.bookbaddies.net/covers/files/abc123.webp',
		)
	})

	it('drops relative/malformed values that Discord would reject', () => {
		assert.equal(resolveDiscordCoverImageUrl('/somewhere/else.png'), undefined)
		assert.equal(resolveDiscordCoverImageUrl('not-a-url'), undefined)
		assert.equal(resolveDiscordCoverImageUrl(''), undefined)
		assert.equal(resolveDiscordCoverImageUrl(null), undefined)
	})

	it('uses localhost API default when API_URL is unset', () => {
		delete process.env.API_URL
		assert.equal(
			resolveDiscordCoverImageUrl('/covers/files/x.png'),
			'http://localhost:3001/api/covers/files/x.png',
		)
		process.env.API_URL = 'https://api.bookbaddies.net'
	})
})

describe('isDiscordInvalidImageUrlError', () => {
	it('detects Discord invalid image URL responses', () => {
		assert.equal(
			isDiscordInvalidImageUrlError(
				'Discord bot returned 400: {"message": "Invalid Form Body", "code": 50035, "errors": {"embeds": {"0": {"image": {"url": {"_errors": [{"code": "URL_TYPE_INVALID_URL", "message": "Not a well formed URL."}]}}}}}}',
			),
			true,
		)
		assert.equal(isDiscordInvalidImageUrlError('network timeout'), false)
	})
})
