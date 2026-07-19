import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const COVER_UPLOAD_DIR = join(__dirname, '../../data/uploads/covers')

const MAX_BYTES = 2 * 1024 * 1024
const ALLOWED: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/jpg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
}

export type CoverUploadResult =
	| { ok: true; coverUrl: string; filename: string }
	| { ok: false; error: string }

/**
 * Persist a cover from a data URL (data:image/...;base64,...).
 */
export async function saveCoverDataUrl(dataUrl: string): Promise<CoverUploadResult> {
	const match = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(
		dataUrl.trim(),
	)
	if (!match) {
		return { ok: false, error: 'Cover must be a JPEG, PNG, or WebP image.' }
	}

	const mime = match[1].toLowerCase()
	const ext = ALLOWED[mime]
	if (!ext) {
		return { ok: false, error: 'Cover must be a JPEG, PNG, or WebP image.' }
	}

	let buffer: Buffer
	try {
		buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64')
	} catch {
		return { ok: false, error: 'Invalid image data.' }
	}

	if (!buffer.length) return { ok: false, error: 'Empty image.' }
	if (buffer.length > MAX_BYTES) {
		return { ok: false, error: 'Cover must be 2 MB or smaller.' }
	}

	await mkdir(COVER_UPLOAD_DIR, { recursive: true })
	const filename = `${Date.now()}-${randomBytes(6).toString('hex')}.${ext}`
	await writeFile(join(COVER_UPLOAD_DIR, filename), buffer)

	return {
		ok: true,
		filename,
		coverUrl: `/covers/files/${filename}`,
	}
}

export function coverFilePath(filename: string): string | null {
	if (!/^[a-zA-Z0-9._-]+$/.test(filename)) return null
	if (filename.includes('..')) return null
	return join(COVER_UPLOAD_DIR, filename)
}
