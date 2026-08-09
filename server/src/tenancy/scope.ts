import { Types } from 'mongoose'
import { getTenantContext, getTenantIdString } from './context.js'
import { ensureDefaultTenant } from './resolve.js'

/** Active tenant ObjectId, or null when on marketing host / no context. */
export function currentTenantObjectId(): Types.ObjectId | null {
  const raw = getTenantIdString()
  if (!raw || !Types.ObjectId.isValid(raw)) return null
  return new Types.ObjectId(raw)
}

/**
 * Merge tenantId into a Mongo filter when a tenant is in context.
 */
export function tenantFilter(
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const id = currentTenantObjectId()
  if (!id) return extra
  return { ...extra, tenantId: id }
}

/** Stamp tenantId onto a new document payload. */
export async function withTenantId<T extends Record<string, unknown>>(
  doc: T,
): Promise<T & { tenantId: Types.ObjectId }> {
  const fromCtx = currentTenantObjectId()
  if (fromCtx) return { ...doc, tenantId: fromCtx }
  const tenant = await ensureDefaultTenant()
  return { ...doc, tenantId: tenant._id }
}

export function requireTenantId(): Types.ObjectId {
  const id = currentTenantObjectId()
  if (id) return id
  const ctx = getTenantContext()
  if (ctx?.isMarketingHost) {
    throw new Error('Tenant required — this action is not available on the marketing host')
  }
  throw new Error('No tenant in request context')
}
