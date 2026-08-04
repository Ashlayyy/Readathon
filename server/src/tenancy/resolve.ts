import { Tenant, type ITenant } from '../db/models/Tenant.js'
import { getStaticConfig } from '../config.js'
import {
  DEFAULT_TENANT_SLUG,
  getLegacyPlayerHosts,
  getProductApex,
  type TenantRequestContext,
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

function normalizeHost(hostHeader: string | undefined): string {
  return (hostHeader ?? '')
    .split(':')[0]!
    .trim()
    .toLowerCase()
}

/**
 * Resolve tenant from Host + pathname + optional X-Tenant-Slug header.
 * - Legacy bookbaddies.net → default tenant (no URL change for players)
 * - www.product.com / product.com (apex) → marketing (no tenant)
 * - {slug}.product.com → tenant by subdomain
 * - /e/{slug}/... or X-Tenant-Slug → tenant by path/header
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
    const tenant = await findTenantBySlug(headerSlug)
    return {
      tenant,
      isMarketingHost: false,
      resolution: 'header',
      slug: headerSlug,
    }
  }

  const pathMatch = path.match(/^\/e\/([a-z0-9-]+)(?:\/|$)/i)
  if (pathMatch?.[1]) {
    const slug = pathMatch[1].toLowerCase()
    const tenant = await findTenantBySlug(slug)
    return {
      tenant,
      isMarketingHost: false,
      resolution: 'path',
      slug,
    }
  }

  const legacy = getLegacyPlayerHosts()
  if (legacy.includes(host) || host === 'localhost' || host === '127.0.0.1') {
    const tenant = await ensureDefaultTenant()
    return {
      tenant,
      isMarketingHost: false,
      resolution: 'default',
      slug: tenant.slug,
    }
  }

  if (host === apex || host === `www.${apex}`) {
    return {
      tenant: null,
      isMarketingHost: true,
      resolution: 'marketing',
      slug: null,
    }
  }

  if (host.endsWith(`.${apex}`)) {
    const sub = host.slice(0, -(apex.length + 1))
    if (sub && !sub.includes('.')) {
      const tenant = await findTenantBySlug(sub)
      return {
        tenant,
        isMarketingHost: false,
        resolution: 'subdomain',
        slug: sub,
      }
    }
  }

  const tenant = await ensureDefaultTenant()
  return {
    tenant,
    isMarketingHost: false,
    resolution: 'unknown',
    slug: tenant.slug,
  }
}
