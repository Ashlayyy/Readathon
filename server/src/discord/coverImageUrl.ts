/**
 * Discord embeds only accept absolute http(s) image URLs.
 * Uploaded covers are stored as `/covers/files/...` (or `/api/covers/files/...`).
 *
 * Production serves the API on `API_URL` (e.g. https://api.bookbaddies.net) where
 * nginx maps public `/covers/files/*` → Hono `/api/covers/files/*`. Do NOT use
 * FRONTEND_URL + `/api/...` — that path is usually wrong and Discord shows a blank embed.
 */

import { apiPublicUrl, getApiPublicBase } from '../lib/urls.js'

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

	// Same public path the frontend uses via VITE_API_URL / apiUrl().
	return apiPublicUrl(`/covers/files/${local[1]}`)
}

/**
 * Only probe covers we host ourselves. Open Library (and similar CDNs) often
 * time out / block HEAD from the VPS even though Discord can fetch them fine.
 */
export function shouldProbeDiscordCoverUrl(imageUrl: string): boolean {
	try {
		const target = new URL(imageUrl)
		const apiBase = new URL(getApiPublicBase())
		return target.host === apiBase.host
	} catch {
		return false
	}
}

/** True when Discord rejected an embed because of a bad image URL. */
export function isDiscordInvalidImageUrlError(error: string | undefined): boolean {
	if (!error) return false
	return (
		/URL_TYPE_INVALID/i.test(error) ||
		(/Invalid Form Body/i.test(error) && /image/i.test(error) && /url/i.test(error))
	)
}

/**
 * Quick reachability check so we don't hand Discord a 404/HTML URL for *our* uploads.
 * Returns the URL if it looks fetchable; otherwise undefined.
 */
export async function verifyDiscordCoverImageUrl(
	imageUrl: string,
): Promise<{ ok: true; url: string; status: number } | { ok: false; url: string; status?: number; error: string }> {
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), 4000)
	try {
		// Prefer HEAD; some hosts only allow GET — fall back once.
		let res = await fetch(imageUrl, {
			method: 'HEAD',
			redirect: 'follow',
			signal: controller.signal,
		})
		if (res.status === 405 || res.status === 501) {
			res = await fetch(imageUrl, {
				method: 'GET',
				redirect: 'follow',
				signal: controller.signal,
				headers: { Range: 'bytes=0-0' },
			})
		}
		const contentType = res.headers.get('content-type') ?? ''
		if (!res.ok) {
			return {
				ok: false,
				url: imageUrl,
				status: res.status,
				error: `HTTP ${res.status}`,
			}
		}
		if (contentType && !/^image\//i.test(contentType) && !/octet-stream/i.test(contentType)) {
			return {
				ok: false,
				url: imageUrl,
				status: res.status,
				error: `Unexpected content-type: ${contentType}`,
			}
		}
		return { ok: true, url: imageUrl, status: res.status }
	} catch (e) {
		return {
			ok: false,
			url: imageUrl,
			error: e instanceof Error ? e.message : 'Cover URL probe failed',
		}
	} finally {
		clearTimeout(timer)
	}
}
