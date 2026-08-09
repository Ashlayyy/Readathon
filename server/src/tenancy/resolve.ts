import { Tenant, type ITenant } from '../db/models/Tenant.js'
import { getStaticConfig } from '../config.js'
import {
  DEFAULT_TENANT_SLUG,
  getLegacyPlayerHosts,
  getProductApex,
  type TenantRequestContext,
  type TenantUnavailableReason,
} from './context.js'

let defaultTenantCache: ITenant | null = null

export async function ensureDefaultTenant(): Promise<ITenant> {
  if (defaultTenantCache) return defaultTenantCache

  let tenant = await Tenant.findOne({ isDefault: true })
  if (!tenant) {
    tenant = await Tenant.findOne({ slug: DEFAULT_TENANT_SLUG })
  }
  if (!tenant) {
    const cfg = getStaticConfig()
    const name = String(cfg.event?.name ?? 'Readathon 2026 - The Crucible')
    tenant = await Tenant.create({
      slug: DEFAULT_TENANT_SLUG,
      name,
      isDefault: true,
      status: 'active',
      config: null,
      discordGuildIds: [],
    })
    console.log(`[tenancy] Seeded default tenant "${tenant.slug}" (${tenant._id})`)
  } else if (!tenant.isDefault) {
    tenant.isDefault = true
    await tenant.save()
  }

  defaultTenantCache = tenant
  return tenant
}

export function clearDefaultTenantCache() {
  defaultTenantCache = null
}

export async function findTenantBySlug(slug: string): Promise<ITenant | null> {
  const s = slug.trim().toLowerCase()
  if (!s || s === 'www' || s === 'app' || s === 'api') return null
  return Tenant.findOne({ slug: s, status: 'active' })
}

async function lookupSlug(slug: string): Promise<{
  tenant: ITenant | null
  unavailableReason: TenantUnavailableReason | null
}> {
  const s = slug.trim().toLowerCase()
  if (!s || s === 'www' || s === 'app' || s === 'api') {
    return { tenant: null, unavailableReason: 'not_found' }
  }
  const row = await Tenant.findOne({ slug: s })
  if (!row) return { tenant: null, unavailableReason: 'not_found' }
  if (row.status === 'active') {
    return { tenant: row, unavailableReason: null }
  }
  if (row.status === 'archived' || row.status === 'suspended') {
    return { tenant: null, unavailableReason: row.status }
  }
  return { tenant: null, unavailableReason: 'not_found' }
}

function normalizeHost(hostHeader: string | undefined): string {
  return (hostHeader ?? '')
    .split(':')[0]!
    .trim()
    .toLowerCase()
}

function slugContext(
  slug: string,
  lookup: { tenant: ITenant | null; unavailableReason: TenantUnavailableReason | null },
  resolution: TenantRequestContext['resolution'],
): TenantRequestContext {
  return {
    tenant: lookup.tenant,
    isMarketingHost: false,
    resolution,
    slug,
    unavailableReason: lookup.unavailableReason,
  }
}

/**
 * Resolve tenant from Host + pathname + optional X-Tenant-Slug header.
 * - Legacy bookbaddies.net → default tenant (no URL change for players)
 * - www.product.com / product.com (apex) → marketing (no tenant)
 * - {slug}.product.com → tenant by subdomain
 * - /e/{slug}/... or X-Tenant-Slug → tenant by path/header
 * - Unknown / inactive slug → tenant null + unavailableReason (never silent Crucible fallback)
 */
export async function resolveTenantFromRequest(opts: {
  host: string | undefined
  pathname: string
  /** Frontend sends this when using /e/:slug URLs (API paths are /api/...). */
  tenantSlugHeader?: string | null
}): Promise<TenantRequestContext> {
  const host = normalizeHost(opts.host)
  const apex = getProductApex()
  const path = opts.pathname || '/'

  const headerSlug = (opts.tenantSlugHeader ?? '').trim().toLowerCase()
  if (headerSlug) {
    return slugContext(headerSlug, await lookupSlug(headerSlug), 'header')
  }

  const pathMatch = path.match(/^\/e\/([a-z0-9-]+)(?:\/|$)/i)
  if (pathMatch?.[1]) {
    const slug = pathMatch[1].toLowerCase()
    return slugContext(slug, await lookupSlug(slug), 'path')
  }

  const legacy = getLegacyPlayerHosts()
  if (legacy.includes(host) || host === 'localhost' || host === '127.0.0.1') {
    const tenant = await ensureDefaultTenant()
    return {
      tenant,
      isMarketingHost: false,
      resolution: 'default',
      slug: tenant.slug,
      unavailableReason: null,
    }
  }

  if (host === apex || host === `www.${apex}`) {
    return {
      tenant: null,
      isMarketingHost: true,
      resolution: 'marketing',
      slug: null,
      unavailableReason: null,
    }
  }

  if (host.endsWith(`.${apex}`)) {
    const sub = host.slice(0, -(apex.length + 1))
    if (sub && !sub.includes('.')) {
      return slugContext(sub, await lookupSlug(sub), 'subdomain')
    }
  }

  const tenant = await ensureDefaultTenant()
  return {
    tenant,
    isMarketingHost: false,
    resolution: 'unknown',
    slug: tenant.slug,
    unavailableReason: null,
  }
}

export function tenantUnavailableMessage(reason: TenantUnavailableReason | null | undefined): string {
  switch (reason) {
    case 'archived':
      return 'This event is no longer active.'
    case 'suspended':
      return 'This event is temporarily unavailable.'
    default:
      return 'This event was not found.'
  }
}

/** True when a specific slug was requested but cannot be served. */
export function isTenantUnavailable(ctx: TenantRequestContext | undefined): boolean {
  if (!ctx) return false
  if (ctx.tenant || ctx.isMarketingHost) return false
  if (!ctx.slug) return false
  return (
    ctx.resolution === 'header' ||
    ctx.resolution === 'path' ||
    ctx.resolution === 'subdomain'
  )
}
