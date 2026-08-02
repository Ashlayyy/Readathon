import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
	decryptSecret,
	encryptSecret,
	isEncryptedSecret,
} from '../lib/secretsCrypto.js'

describe('secretsCrypto', () => {
	it('round-trips a bot token', () => {
		process.env.SETTINGS_ENCRYPTION_KEY = 'test-encryption-key-for-unit-tests'
		const plain = 'BotToken.ABCDEF.xyz'
		const enc = encryptSecret(plain)
		assert.equal(isEncryptedSecret(enc), true)
		assert.equal(decryptSecret(enc), plain)
	})

	it('leaves empty string empty', () => {
		process.env.SETTINGS_ENCRYPTION_KEY = 'test-encryption-key-for-unit-tests'
		assert.equal(encryptSecret(''), '')
		assert.equal(decryptSecret(''), '')
	})
})
