/** Pages-per-day pace samples for a simple sparkline on reader profiles. */

export type PacePoint = {
	/** ISO date the book was finished (or logged). */
	at: string
	/** Pages read per day for that book (null if dates missing). */
	pagesPerDay: number | null
	pages: number
	title: string
}

function daysBetween(start: string, end: string): number | null {
	const a = Date.parse(start)
	const b = Date.parse(end)
	if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null
	const days = Math.max(1, Math.round((b - a) / 86_400_000))
	return days
}

export function buildPaceSeries(
	books: Array<{
		bookTitle: string
		pageCount: number
		startedAt?: string | null
		finishedAt?: string | null
		createdAt?: Date | string | null
	}>,
): PacePoint[] {
	const points: PacePoint[] = []

	for (const book of books) {
		const finished =
			book.finishedAt?.trim() ||
			(book.createdAt
				? new Date(book.createdAt).toISOString().slice(0, 10)
				: null)
		if (!finished) continue

		const started = book.startedAt?.trim() || null
		const days = started ? daysBetween(started, finished) : null
		const pagesPerDay =
			days && book.pageCount > 0
				? Math.round((book.pageCount / days) * 10) / 10
				: null

		points.push({
			at: finished,
			pagesPerDay,
			pages: book.pageCount,
			title: book.bookTitle,
		})
	}

	return points.sort((a, b) => a.at.localeCompare(b.at))
}

/** Compact SVG path for a sparkline (viewBox 0 0 100 28). */
export function paceSparklinePath(points: PacePoint[], width = 100, height = 28): string | null {
	const values = points
		.map((p) => p.pagesPerDay)
		.filter((n): n is number => n !== null && Number.isFinite(n))
	if (values.length < 2) return null

	const min = Math.min(...values)
	const max = Math.max(...values)
	const range = max - min || 1
	const step = width / (values.length - 1)

	return values
		.map((v, i) => {
			const x = i * step
			const y = height - ((v - min) / range) * (height - 4) - 2
			return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
		})
		.join(' ')
}
