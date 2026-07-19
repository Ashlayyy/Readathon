/**
 * Open Library cover lookup (server-side to avoid CORS / keep keys out of the browser).
 * Docs: https://openlibrary.org/dev/docs/api/search
 */

export type CoverLookupResult = {
	title: string
	author: string
	coverUrl: string | null
	openLibraryKey: string | null
}

function coverUrlFromId(coverId: number | undefined, size: 'S' | 'M' | 'L' = 'M'): string | null {
	if (!coverId) return null
	return `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg`
}

export async function lookupBookCover(
	title: string,
	author?: string,
): Promise<CoverLookupResult | null> {
	const qTitle = title.trim()
	if (qTitle.length < 2) return null

	const params = new URLSearchParams({
		title: qTitle,
		limit: '1',
		fields: 'key,title,author_name,cover_i',
	})
	const qAuthor = author?.trim()
	if (qAuthor) params.set('author', qAuthor)

	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), 8000)

	try {
		const res = await fetch(`https://openlibrary.org/search.json?${params}`, {
			signal: controller.signal,
			headers: { Accept: 'application/json' },
		})
		if (!res.ok) return null
		const data = (await res.json()) as {
			docs?: Array<{
				key?: string
				title?: string
				author_name?: string[]
				cover_i?: number
			}>
		}
		const doc = data.docs?.[0]
		if (!doc) return null
		return {
			title: doc.title ?? qTitle,
			author: doc.author_name?.[0] ?? qAuthor ?? '',
			coverUrl: coverUrlFromId(doc.cover_i),
			openLibraryKey: doc.key ?? null,
		}
	} catch (e) {
		console.error('[covers] Open Library lookup failed:', e)
		return null
	} finally {
		clearTimeout(timer)
	}
}
