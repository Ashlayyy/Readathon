import { AsyncLocalStorage } from 'node:async_hooks'
import type { ITenant } from '../db/models/Tenant.js'

export type TenantRequestContext = {
  /** Resolved tenant document (always set for player API after middleware). */
  tenant: ITenant | null
  /** True when host is the product marketing surface (www.product.com). */
  isMarketingHost: boolean
  /** How tenant was resolved */
  resolution:
    | 'default'
    | 'subdomain'
    | 'path'
    | 'header'
    | 'marketing'
    | 'unknown'
  /** Raw slug if present in host/path */
  slug: string | null
}

const storage = new AsyncLocalStorage<TenantRequestContext>()

export function runWithTenantContext<T>(
  ctx: TenantRequestContext,
  fn: () => T,
): T {
  return storage.run(ctx, fn)
}

export function getTenantContext(): TenantRequestContext | undefined {
  return storage.getStore()
}

export function requireTenant(): ITenant {
  const ctx = storage.getStore()
  if (!ctx?.tenant) {
    throw new Error('No tenant in request context')
  }
  return ctx.tenant
}

export function getTenantIdString(): string | null {
  const t = storage.getStore()?.tenant
  return t?._id?.toString() ?? null
}

/** Product brand (not the Crucible event). Override with PRODUCT_NAME. */
export function getProductName(): string {
  return (process.env.PRODUCT_NAME ?? 'Product').trim() || 'Product'
}

/** Apex used for new hosts / marketing. Working default: product.com */
export function getProductApex(): string {
  return (
    process.env.PRODUCT_APEX ?? 'product.com'
  )
    .trim()
    .toLowerCase()
    .replace(/^www\./, '') || 'product.com'
}

/** Hosts that always map to the default (Book Baddies) tenant — zero player migration. */
export function getLegacyPlayerHosts(): string[] {
  const raw = process.env.LEGACY_PLAYER_HOSTS ?? 'bookbaddies.net,www.bookbaddies.net'
  return raw
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
}

export const DEFAULT_TENANT_SLUG = 'crucible'
