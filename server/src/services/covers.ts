/**
 * Open Library cover lookup (server-side to avoid CORS).
 * Docs: https://openlibrary.org/dev/docs/api/search
 *
 * Ranks hits by title/author similarity so we don't grab the first
 * random edition that happens to have cover art.
 */

export type CoverLookupResult = {
	title: string
	author: string
	coverUrl: string | null
	openLibraryKey: string | null
	score?: number
}

type OlDoc = {
	key?: string
	title?: string
	author_name?: string[]
	cover_i?: number
	edition_count?: number
}

function coverUrlFromId(coverId: number | undefined, size: 'S' | 'M' | 'L' = 'L'): string | null {
	if (!coverId) return null
	return `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg`
}

function normalize(s: string): string {
	return s
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/&/g, ' and ')
		.replace(/[^a-z0-9\s]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
}

function tokens(s: string): string[] {
	return normalize(s)
		.split(' ')
		.filter((t) => t.length > 1 && !['the', 'and', 'of', 'a', 'an'].includes(t))
}

function titleScore(queryTitle: string, docTitle: string | undefined): number {
	const q = normalize(queryTitle)
	const d = normalize(docTitle ?? '')
	if (!q || !d) return 0
	if (q === d) return 100
	if (d.startsWith(q) || q.startsWith(d)) {
		const shorter = Math.min(q.length, d.length)
		const longer = Math.max(q.length, d.length)
		if (shorter / longer >= 0.55) return 85
	}
	if (d.includes(q) || q.includes(d)) {
		const shorter = Math.min(q.length, d.length)
		const longer = Math.max(q.length, d.length)
		if (shorter / longer >= 0.55) return 70
	}

	const qt = tokens(queryTitle)
	const dt = new Set(tokens(docTitle ?? ''))
	if (!qt.length) return 0
	const overlap = qt.filter((t) => dt.has(t)).length
	return Math.round((overlap / qt.length) * 60)
}

function authorScore(queryAuthor: string, authors: string[] | undefined): number {
	const q = normalize(queryAuthor)
	if (!q) return 0
	const list = authors ?? []
	if (!list.length) return 0

	let best = 0
	for (const name of list) {
		const n = normalize(name)
		if (n === q) best = Math.max(best, 100)
		else if (n.includes(q) || q.includes(n)) best = Math.max(best, 80)
		else {
			const qt = tokens(queryAuthor)
			const nt = new Set(tokens(name))
			if (qt.length) {
				const overlap = qt.filter((t) => nt.has(t)).length
				best = Math.max(best, Math.round((overlap / qt.length) * 70))
			}
		}
	}
	return best
}

function scoreDoc(doc: OlDoc, queryTitle: string, queryAuthor: string): number {
	const t = titleScore(queryTitle, doc.title)
	const a = authorScore(queryAuthor, doc.author_name)
	let score = t * 2 + a
	if (doc.cover_i) score += 15
	if (typeof doc.edition_count === 'number') {
		score += Math.min(10, Math.floor(doc.edition_count / 20))
	}
	// Soft-penalize weak title matches when an author was provided
	if (queryAuthor.trim() && t < 40) score -= 40
	if (queryAuthor.trim() && a < 30) score -= 25
	return score
}

function toResult(
	doc: OlDoc,
	fallbackTitle: string,
	fallbackAuthor: string,
	score?: number,
): CoverLookupResult {
	return {
		title: doc.title ?? fallbackTitle,
		author: doc.author_name?.[0] ?? fallbackAuthor,
		coverUrl: coverUrlFromId(doc.cover_i),
		openLibraryKey: doc.key ?? null,
		score,
	}
}

async function searchOpenLibrary(
	params: URLSearchParams,
	signal: AbortSignal,
): Promise<OlDoc[]> {
	const res = await fetch(`https://openlibrary.org/search.json?${params}`, {
		signal,
		headers: { Accept: 'application/json' },
	})
	if (!res.ok) return []
	const data = (await res.json()) as { docs?: OlDoc[] }
	return data.docs ?? []
}

const MIN_ACCEPT_SCORE = 80

function rankDocs(
	docs: OlDoc[],
	queryTitle: string,
	queryAuthor: string,
): CoverLookupResult[] {
	const seen = new Set<string>()
	const ranked: CoverLookupResult[] = []

	for (const doc of docs) {
		if (!doc.cover_i) continue
		const key = String(doc.cover_i)
		if (seen.has(key)) continue
		seen.add(key)
		const score = scoreDoc(doc, queryTitle, queryAuthor)
		ranked.push(toResult(doc, queryTitle, queryAuthor, score))
	}

	ranked.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
	return ranked
}

/**
 * Lookup cover art. Tries title+author, then looser queries.
 * Returns the best match plus alternative candidates.
 */
export async function lookupBookCoverCandidates(
	title: string,
	author?: string,
	limit = 5,
): Promise<{ best: CoverLookupResult | null; candidates: CoverLookupResult[] }> {
	const qTitle = title.trim()
	if (qTitle.length < 2) return { best: null, candidates: [] }
	const qAuthor = author?.trim() ?? ''

	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), 10000)

	try {
		const attempts: URLSearchParams[] = []
		const fields = 'key,title,author_name,cover_i,edition_count'

		if (qAuthor) {
			attempts.push(
				new URLSearchParams({
					title: qTitle,
					author: qAuthor,
					limit: '12',
					fields,
				}),
			)
			attempts.push(
				new URLSearchParams({
					q: `${qTitle} ${qAuthor}`,
					limit: '12',
					fields,
				}),
			)
		}

		attempts.push(
			new URLSearchParams({
				title: qTitle,
				limit: '12',
				fields,
			}),
		)

		const pooled: OlDoc[] = []
		const seenKeys = new Set<string>()

		for (const params of attempts) {
			const docs = await searchOpenLibrary(params, controller.signal)
			for (const doc of docs) {
				const k = doc.key ?? String(doc.cover_i ?? '')
				if (!k || seenKeys.has(k)) continue
				seenKeys.add(k)
				pooled.push(doc)
			}
			// Early exit if we already have a strong titled+authored hit with cover
			const rankedSoFar = rankDocs(pooled, qTitle, qAuthor)
			if (rankedSoFar[0] && (rankedSoFar[0].score ?? 0) >= 180) break
		}

		const ranked = rankDocs(pooled, qTitle, qAuthor).filter(
			(r) => (r.score ?? 0) >= MIN_ACCEPT_SCORE,
		)
		const candidates = ranked.slice(0, limit)
		return { best: candidates[0] ?? null, candidates }
	} catch (e) {
		console.error('[covers] Open Library lookup failed:', e)
		return { best: null, candidates: [] }
	} finally {
		clearTimeout(timer)
	}
}

/**
 * Lookup cover art. Tries title+author, then looser queries.
 */
export async function lookupBookCover(
	title: string,
	author?: string,
): Promise<CoverLookupResult | null> {
	const { best } = await lookupBookCoverCandidates(title, author, 1)
	return best
}

/** Allowed cover URLs we persist (Open Library or our uploaded files). */
export function isAllowedCoverUrl(url: string | null | undefined): boolean {
	if (!url) return true
	const trimmed = url.trim()
	if (!trimmed) return true
	if (/^https:\/\/covers\.openlibrary\.org\/b\/id\/\d+-[SML]\.jpg$/i.test(trimmed)) {
		return true
	}
	if (/^\/api\/covers\/files\/[a-zA-Z0-9._-]+$/i.test(trimmed)) {
		return true
	}
	if (/^\/covers\/files\/[a-zA-Z0-9._-]+$/i.test(trimmed)) {
		return true
	}
	return false
}
