import assert from 'node:assert/strict'
import { describe, it, afterEach } from 'node:test'
import { apiPublicUrl, getApiPublicBase } from './urls.js'

describe('getApiPublicBase', () => {
	const original = process.env.API_URL

	afterEach(() => {
		if (original === undefined) delete process.env.API_URL
		else process.env.API_URL = original
	})

	it('defaults to localhost when API_URL is unset', () => {
		delete process.env.API_URL
		assert.equal(getApiPublicBase(), 'http://localhost:3001/api')
	})

	it('trims and strips trailing slash from API_URL', () => {
		process.env.API_URL = '  https://api.example.com/  '
		assert.equal(getApiPublicBase(), 'https://api.example.com')
	})
})

describe('apiPublicUrl', () => {
	const original = process.env.API_URL

	afterEach(() => {
		if (original === undefined) delete process.env.API_URL
		else process.env.API_URL = original
	})

	it('joins base and path with a leading slash', () => {
		process.env.API_URL = 'https://api.example.com'
		assert.equal(apiPublicUrl('/auth/verify'), 'https://api.example.com/auth/verify')
	})

	it('adds a slash when path omits one', () => {
		process.env.API_URL = 'https://api.example.com'
		assert.equal(apiPublicUrl('config'), 'https://api.example.com/config')
	})
})
