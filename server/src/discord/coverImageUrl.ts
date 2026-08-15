/**
 * Discord embeds only accept absolute http(s) image URLs.
 * Uploaded covers are stored as `/covers/files/...` (or `/api/covers/files/...`).
 */

function publicSiteOrigin(): string | null {
	const raw =
		process.env.PUBLIC_BASE_URL?.trim() ||
		process.env.FRONTEND_URL?.trim() ||
		''
	if (!raw) return null
	try {
		const u = new URL(raw)
		if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
		return u.origin
	} catch {
		return null
	}
}

/**
 * Turn a stored coverUrl into a Discord-safe embed image URL, or undefined
 * when we should send text only (relative/unknown/malformed).
 */
export function resolveDiscordCoverImageUrl(
	coverUrl: string | null | undefined,
): string | undefined {
	const raw = coverUrl?.trim()
	if (!raw) return undefined

	if (/^https?:\/\//i.test(raw)) {
		try {
			const u = new URL(raw)
			if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined
			return u.href
		} catch {
			return undefined
		}
	}

	const local = raw.match(/^\/(?:api\/)?covers\/files\/([a-zA-Z0-9._-]+)$/i)
	if (!local) return undefined

	const origin = publicSiteOrigin()
	if (!origin) return undefined

	return `${origin}/api/covers/files/${local[1]}`
}

/** True when Discord rejected an embed because of a bad image URL. */
export function isDiscordInvalidImageUrlError(error: string | undefined): boolean {
	if (!error) return false
	return (
		/URL_TYPE_INVALID/i.test(error) ||
		(/Invalid Form Body/i.test(error) && /image/i.test(error) && /url/i.test(error))
	)
}
