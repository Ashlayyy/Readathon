import { mkdir, writeFile, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const COVER_UPLOAD_DIR = join(__dirname, '../../data/uploads/covers')
export const AVATAR_UPLOAD_DIR = join(__dirname, '../../data/uploads/avatars')

const MAX_BYTES = 2 * 1024 * 1024
const ALLOWED: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/jpg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
}

export type ImageUploadResult =
	| { ok: true; url: string; filename: string }
	| { ok: false; error: string }

async function saveImageDataUrl(
	dataUrl: string,
	dir: string,
	urlPrefix: string,
	label: string,
): Promise<ImageUploadResult> {
	const match = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(
		dataUrl.trim(),
	)
	if (!match) {
		return { ok: false, error: `${label} must be a JPEG, PNG, or WebP image.` }
	}

	const mime = match[1]!.toLowerCase()
	const ext = ALLOWED[mime]
	if (!ext) {
		return { ok: false, error: `${label} must be a JPEG, PNG, or WebP image.` }
	}

	let buffer: Buffer
	try {
		buffer = Buffer.from(match[2]!.replace(/\s+/g, ''), 'base64')
	} catch {
		return { ok: false, error: 'Invalid image data.' }
	}

	if (!buffer.length) return { ok: false, error: 'Empty image.' }
	if (buffer.length > MAX_BYTES) {
		return { ok: false, error: `${label} must be 2 MB or smaller.` }
	}

	await mkdir(dir, { recursive: true })
	const filename = `${Date.now()}-${randomBytes(6).toString('hex')}.${ext}`
	await writeFile(join(dir, filename), buffer)

	return {
		ok: true,
		filename,
		url: `${urlPrefix}/${filename}`,
	}
}

/**
 * Persist a cover from a data URL (data:image/...;base64,...).
 */
export async function saveCoverDataUrl(dataUrl: string): Promise<
	{ ok: true; coverUrl: string; filename: string } | { ok: false; error: string }
> {
	const result = await saveImageDataUrl(
		dataUrl,
		COVER_UPLOAD_DIR,
		'/covers/files',
		'Cover',
	)
	if (!result.ok) return result
	return { ok: true, filename: result.filename, coverUrl: result.url }
}

export async function saveAvatarDataUrl(dataUrl: string): Promise<
	{ ok: true; avatarUrl: string; filename: string } | { ok: false; error: string }
> {
	const result = await saveImageDataUrl(
		dataUrl,
		AVATAR_UPLOAD_DIR,
		'/avatars/files',
		'Avatar',
	)
	if (!result.ok) return result
	return { ok: true, filename: result.filename, avatarUrl: result.url }
}

function safeFilePath(dir: string, filename: string): string | null {
	if (!/^[a-zA-Z0-9._-]+$/.test(filename)) return null
	if (filename.includes('..')) return null
	return join(dir, filename)
}

export function coverFilePath(filename: string): string | null {
	return safeFilePath(COVER_UPLOAD_DIR, filename)
}

export function avatarFilePath(filename: string): string | null {
	return safeFilePath(AVATAR_UPLOAD_DIR, filename)
}

/** Best-effort delete of a previously uploaded local avatar. */
export async function deleteLocalAvatarFile(avatarUrl: string | null | undefined): Promise<void> {
	if (!avatarUrl) return
	const match = /\/avatars\/files\/([a-zA-Z0-9._-]+)$/.exec(avatarUrl.trim())
	if (!match) return
	const path = avatarFilePath(match[1]!)
	if (!path || !existsSync(path)) return
	try {
		await unlink(path)
	} catch {
		/* ignore */
	}
}

export type CoverUploadResult =
	| { ok: true; coverUrl: string; filename: string }
	| { ok: false; error: string }
