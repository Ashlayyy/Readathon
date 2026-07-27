import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { magicLinkEmailHtml, magicLinkEmailText } from './emailTemplates.js'
import { getStaticConfig } from '../config.js'

describe('magicLinkEmailHtml', () => {
	it('includes event branding, recipient email, and sign-in link', () => {
		const { event, copy } = getStaticConfig()
		const link = 'https://api.example.com/auth/verify?token=abc'
		const email = 'reader@example.com'
		const html = magicLinkEmailHtml(link, email)

		assert.match(html, /<!DOCTYPE html>/)
		assert.match(html, new RegExp(String(event.name)))
		assert.match(html, new RegExp(String(event.subtitle)))
		assert.match(html, new RegExp(String((copy as { enterCta: string }).enterCta)))
		assert.match(html, /reader@example\.com/)
		assert.match(html, new RegExp(link.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
		assert.match(html, /15 minutes/)
	})
})

describe('magicLinkEmailText', () => {
	it('includes event title and the magic link', () => {
		const { event } = getStaticConfig()
		const link = 'https://api.example.com/auth/verify?token=abc'
		const text = magicLinkEmailText(link)

		assert.match(text, new RegExp(String(event.name)))
		assert.match(text, new RegExp(String(event.subtitle)))
		assert.match(text, new RegExp(link.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
		assert.match(text, /15 minutes/)
	})
})
