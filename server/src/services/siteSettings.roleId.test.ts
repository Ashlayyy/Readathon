import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { normalizeDiscordRoleId } from './siteSettings.js'

describe('normalizeDiscordRoleId', () => {
	it('returns bare digit snowflakes unchanged', () => {
		assert.equal(normalizeDiscordRoleId('123456789012345678'), '123456789012345678')
	})

	it('unwraps pasted Discord role mention syntax', () => {
		assert.equal(normalizeDiscordRoleId('<@&123456789012345678>'), '123456789012345678')
	})

	it('trims whitespace', () => {
		assert.equal(normalizeDiscordRoleId('  123456789012345678  '), '123456789012345678')
	})

	it('extracts a snowflake from messy paste text', () => {
		assert.equal(
			normalizeDiscordRoleId('Role ID: 123456789012345678 (copy this)'),
			'123456789012345678',
		)
	})
})
