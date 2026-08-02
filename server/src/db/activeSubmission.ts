import type { QueryFilter } from 'mongoose'
import type { ISubmission } from './models/Submission.js'

/** Shared filter helpers so every scoring/analytics query consistently excludes soft-deleted submissions. */
export const ACTIVE_SUB_FILTER = { deletedAt: null } as const

export function withActive(
	filter: QueryFilter<ISubmission> = {},
): QueryFilter<ISubmission> {
	return { ...filter, deletedAt: null }
}
