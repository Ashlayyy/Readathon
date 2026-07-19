/** Shared filter helpers so every scoring/analytics query consistently excludes soft-deleted submissions. */
export const ACTIVE_SUB_FILTER = { deletedAt: null }

export function withActive<T extends Record<string, unknown>>(filter: T = {} as T): T & { deletedAt: null } {
  return { ...filter, deletedAt: null }
}
