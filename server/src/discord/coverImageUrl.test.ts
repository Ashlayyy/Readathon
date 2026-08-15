import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import {
	isDiscordInvalidImageUrlError,
	resolveDiscordCoverImageUrl,
} from './coverImageUrl.js'

describe('resolveDiscordCoverImageUrl', () => {
	const prevFrontend = process.env.FRONTEND_URL
	const prevPublic = process.env.PUBLIC_BASE_URL

	before(() => {
		process.env.FRONTEND_URL = 'https://bookbaddies.net/'
		delete process.env.PUBLIC_BASE_URL
	})

	after(() => {
		if (prevFrontend === undefined) delete process.env.FRONTEND_URL
		else process.env.FRONTEND_URL = prevFrontend
		if (prevPublic === undefined) delete process.env.PUBLIC_BASE_URL
		else process.env.PUBLIC_BASE_URL = prevPublic
	})

	it('passes through Open Library https URLs', () => {
		assert.equal(
			resolveDiscordCoverImageUrl(
				'https://covers.openlibrary.org/b/id/12345-L.jpg',
			),
			'https://covers.openlibrary.org/b/id/12345-L.jpg',
		)
	})

	it('absolutizes uploaded /covers/files paths via FRONTEND_URL', () => {
		assert.equal(
			resolveDiscordCoverImageUrl('/covers/files/abc123.jpg'),
			'https://bookbaddies.net/api/covers/files/abc123.jpg',
		)
	})

	it('absolutizes /api/covers/files paths', () => {
		assert.equal(
			resolveDiscordCoverImageUrl('/api/covers/files/abc123.webp'),
			'https://bookbaddies.net/api/covers/files/abc123.webp',
		)
	})

	it('drops relative/malformed values that Discord would reject', () => {
		assert.equal(resolveDiscordCoverImageUrl('/somewhere/else.png'), undefined)
		assert.equal(resolveDiscordCoverImageUrl('not-a-url'), undefined)
		assert.equal(resolveDiscordCoverImageUrl(''), undefined)
		assert.equal(resolveDiscordCoverImageUrl(null), undefined)
	})

	it('prefers PUBLIC_BASE_URL when set', () => {
		process.env.PUBLIC_BASE_URL = 'https://cdn.example.com'
		assert.equal(
			resolveDiscordCoverImageUrl('/covers/files/x.png'),
			'https://cdn.example.com/api/covers/files/x.png',
		)
		delete process.env.PUBLIC_BASE_URL
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
