import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const PREFIX = 'enc:v1:'

function encryptionKey(): Buffer {
	const raw =
		process.env.SETTINGS_ENCRYPTION_KEY?.trim() ||
		process.env.SESSION_SECRET?.trim() ||
		''
	if (!raw) {
		throw new Error(
			'SETTINGS_ENCRYPTION_KEY (or SESSION_SECRET) is required to encrypt Discord secrets',
		)
	}
	return createHash('sha256').update(raw, 'utf8').digest()
}

export function isEncryptedSecret(value: string): boolean {
	return value.startsWith(PREFIX)
}

/** Encrypt a plaintext secret for DB storage. Empty string stays empty. */
export function encryptSecret(plaintext: string): string {
	const trimmed = plaintext.trim()
	if (!trimmed) return ''
	if (isEncryptedSecret(trimmed)) return trimmed

	const key = encryptionKey()
	const iv = randomBytes(12)
	const cipher = createCipheriv('aes-256-gcm', key, iv)
	const encrypted = Buffer.concat([
		cipher.update(trimmed, 'utf8'),
		cipher.final(),
	])
	const tag = cipher.getAuthTag()
	return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`
}

/** Decrypt a stored secret. Plaintext legacy values pass through. */
export function decryptSecret(stored: string): string {
	const trimmed = stored.trim()
	if (!trimmed) return ''
	if (!isEncryptedSecret(trimmed)) return trimmed

	const parts = trimmed.slice(PREFIX.length).split(':')
	if (parts.length !== 3) {
		throw new Error('Invalid encrypted secret format')
	}
	const [ivB64, tagB64, dataB64] = parts
	const key = encryptionKey()
	const iv = Buffer.from(ivB64!, 'base64')
	const tag = Buffer.from(tagB64!, 'base64')
	const data = Buffer.from(dataB64!, 'base64')
	const decipher = createDecipheriv('aes-256-gcm', key, iv)
	decipher.setAuthTag(tag)
	return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

export function hasEncryptionKeyConfigured(): boolean {
	return Boolean(
		process.env.SETTINGS_ENCRYPTION_KEY?.trim() ||
			process.env.SESSION_SECRET?.trim(),
	)
}
