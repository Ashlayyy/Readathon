export type BookHit = {
	title: string
	author: string
	coverUrl: string | null
	url: string
}

type SearchDoc = {
	title?: string
	author_name?: string[]
	cover_i?: number
	key?: string
}

const recentSearches = new Map<string, { at: number; hits: BookHit[] }>()

export function rememberSearch(userId: string, hits: BookHit[]): void {
	recentSearches.set(userId, { at: Date.now(), hits })
}

export function recallSearch(userId: string): BookHit[] | null {
	const row = recentSearches.get(userId)
	if (!row) return null
	if (Date.now() - row.at > 10 * 60 * 1000) {
		recentSearches.delete(userId)
		return null
	}
	return row.hits
}

function hitFromDoc(doc: SearchDoc): BookHit | null {
	const title = doc.title?.trim()
	if (!title) return null
	const key = doc.key?.startsWith('/') ? doc.key : null
	return {
		title,
		author: doc.author_name?.[0]?.trim() || '',
		coverUrl: doc.cover_i
			? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
			: null,
		url: key ? `https://openlibrary.org${key}` : 'https://openlibrary.org',
	}
}

export async function searchBooks(query: {
	title?: string
	author?: string
	subject?: string
}): Promise<BookHit[]> {
	const params = new URLSearchParams({ limit: '5' })
	if (query.title?.trim()) params.set('title', query.title.trim())
	if (query.author?.trim()) params.set('author', query.author.trim())
	if (query.subject?.trim()) params.set('subject', query.subject.trim())
	if (![...params.keys()].some((key) => key !== 'limit')) {
		return []
	}
	const res = await fetch(`https://openlibrary.org/search.json?${params}`, {
		headers: {
			Accept: 'application/json',
			'User-Agent': 'BookBaddiesReadathon/1.6',
		},
		signal: AbortSignal.timeout(8000),
	})
	if (!res.ok) throw new Error(`Book search failed (${res.status})`)
	const data = (await res.json()) as { docs?: SearchDoc[] }
	return (data.docs ?? [])
		.map(hitFromDoc)
		.filter((hit): hit is BookHit => hit != null)
		.slice(0, 5)
}

export function formatBookList(hits: BookHit[]): string {
	if (hits.length === 0) return 'No books matched that search.'
	return hits
		.map((hit, index) => {
			const author = hit.author ? ` — ${hit.author}` : ''
			return `${index + 1}. **${hit.title}**${author}\n${hit.url}`
		})
		.join('\n')
}
