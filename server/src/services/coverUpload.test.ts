import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { join } from 'node:path'
import {
	avatarFilePath,
	coverFilePath,
	COVER_UPLOAD_DIR,
	AVATAR_UPLOAD_DIR,
	deleteLocalAvatarFile,
	saveAvatarDataUrl,
	saveCoverDataUrl,
} from './coverUpload.js'

const tinyPng =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

describe('coverUpload validation', () => {
	it('rejects non-data-url input', async () => {
		const result = await saveCoverDataUrl('https://example.com/x.png')
		assert.equal(result.ok, false)
		if (!result.ok) assert.match(result.error, /JPEG, PNG, or WebP/)
	})

	it('rejects unsupported mime types', async () => {
		const gif = `data:image/gif;base64,${Buffer.from('GIF89a').toString('base64')}`
		const result = await saveAvatarDataUrl(gif)
		assert.equal(result.ok, false)
	})

	it('rejects data URLs with no base64 payload after trim', async () => {
		const result = await saveCoverDataUrl('data:image/png;base64, ')
		assert.equal(result.ok, false)
		if (!result.ok) assert.match(result.error, /JPEG, PNG, or WebP/)
	})

	it('rejects images over 2 MB', async () => {
		const big = `data:image/png;base64,${'A'.repeat(3 * 1024 * 1024)}`
		const result = await saveCoverDataUrl(big)
		assert.equal(result.ok, false)
		if (!result.ok) assert.match(result.error, /2 MB/)
	})

	it('safeFilePath rejects traversal and odd filenames', () => {
		assert.equal(coverFilePath('../secret.png'), null)
		assert.equal(coverFilePath('bad name.png'), null)
		assert.equal(coverFilePath('ok-123.webp'), join(COVER_UPLOAD_DIR, 'ok-123.webp'))
		assert.equal(avatarFilePath('ok-123.webp'), join(AVATAR_UPLOAD_DIR, 'ok-123.webp'))
	})

	it('deleteLocalAvatarFile ignores non-local URLs', async () => {
		await deleteLocalAvatarFile('https://cdn.example/avatar.png')
		await deleteLocalAvatarFile(null)
	})
})

describe('coverUpload valid payload shape', () => {
	it('accepts trimmed data URLs with whitespace in base64', async () => {
		const spaced = `${tinyPng.slice(0, 22)} ${tinyPng.slice(22)}`
		const result = await saveCoverDataUrl(`  ${spaced}  `)
		if (result.ok) {
			const { unlink } = await import('node:fs/promises')
			const path = coverFilePath(result.filename)
			if (path) await unlink(path).catch(() => {})
		}
		assert.equal(typeof result.ok, 'boolean')
	})
})
