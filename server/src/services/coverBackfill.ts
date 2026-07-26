import { Submission } from '../db/models/Submission.js'
import { withActive } from '../db/activeSubmission.js'
import { isAllowedCoverUrl, lookupBookCover } from './covers.js'

const LOOKUP_DELAY_MS = 200
const APPLY_BATCH_MAX = 500

export type CoverProposal = {
	id: string
	bookTitle: string
	bookAuthor: string
	currentCoverUrl: string | null
	proposedCoverUrl: string | null
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

/** All active submissions as cover proposals (no Open Library calls). */
export async function listCoverProposals(): Promise<CoverProposal[]> {
	const rows = await Submission.find(withActive()).sort({ createdAt: -1 })
	return rows.map((sub) => ({
		id: sub._id.toString(),
		bookTitle: sub.bookTitle,
		bookAuthor: sub.bookAuthor,
		currentCoverUrl: sub.coverUrl?.trim() || null,
		proposedCoverUrl: null,
	}))
}

export type CoverLookupProgress = {
	id: string
	proposedCoverUrl: string | null
}

/**
 * Look up Open Library covers for every active submission.
 * Calls `onProgress` after each lookup. Respects `signal` abort.
 */
export async function streamCoverLookups(
	onProgress: (update: CoverLookupProgress) => void | Promise<void>,
	signal?: AbortSignal,
): Promise<{ lookedUp: number }> {
	const rows = await Submission.find(withActive()).sort({ createdAt: -1 })

	let lookedUp = 0
	for (let i = 0; i < rows.length; i++) {
		if (signal?.aborted) break
		const sub = rows[i]!
		let proposedCoverUrl: string | null = null
		try {
			const result = await lookupBookCover(sub.bookTitle, sub.bookAuthor)
			proposedCoverUrl = result?.coverUrl?.trim() || null
		} catch (e) {
			console.error(
				`[coverBackfill] lookup failed for ${sub._id}:`,
				e instanceof Error ? e.message : e,
			)
		}
		lookedUp++
		await onProgress({
			id: sub._id.toString(),
			proposedCoverUrl,
		})
		if (i < rows.length - 1 && !signal?.aborted) await sleep(LOOKUP_DELAY_MS)
	}

	return { lookedUp }
}

export type CoverApplyUpdate = { id: string; coverUrl: string }

export type CoverApplyResult =
	| { ok: true; updated: number; skipped: number }
	| { ok: false; error: string }

/** Apply selected cover URLs to active submissions. */
export async function applyCoverUpdates(
	updates: CoverApplyUpdate[],
): Promise<CoverApplyResult> {
	if (!Array.isArray(updates) || updates.length === 0) {
		return { ok: false, error: 'Select at least one cover to apply.' }
	}
	if (updates.length > APPLY_BATCH_MAX) {
		return {
			ok: false,
			error: `Too many updates (max ${APPLY_BATCH_MAX}). Apply in smaller batches.`,
		}
	}

	const normalized: CoverApplyUpdate[] = []
	for (const u of updates) {
		const id = typeof u.id === 'string' ? u.id.trim() : ''
		const coverUrl = typeof u.coverUrl === 'string' ? u.coverUrl.trim() : ''
		if (!id || !coverUrl) {
			return { ok: false, error: 'Each update needs an id and coverUrl.' }
		}
		if (!isAllowedCoverUrl(coverUrl)) {
			return { ok: false, error: `Disallowed cover URL for submission ${id}.` }
		}
		normalized.push({ id, coverUrl })
	}

	let updated = 0
	let skipped = 0
	for (const u of normalized) {
		const result = await Submission.updateOne(withActive({ _id: u.id }), {
			$set: { coverUrl: u.coverUrl },
		})
		if (result.matchedCount === 0) skipped++
		else updated++
	}

	return { ok: true, updated, skipped }
}
