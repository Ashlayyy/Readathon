import { computed, ref } from 'vue'

const PRODUCT_APEX = (import.meta.env.VITE_PRODUCT_APEX as string | undefined)?.trim().toLowerCase() || 'product.com'

const pathTenantSlug = ref<string | null>(null)

function hostname(): string {
  if (typeof window === 'undefined') return ''
  return window.location.hostname.toLowerCase()
}

/** True on product.com / www.product.com (or ?marketing=1 on localhost for local preview). */
export function detectMarketingHost(): boolean {
  const h = hostname()
  if (h === PRODUCT_APEX || h === `www.${PRODUCT_APEX}`) return true
  if ((h === 'localhost' || h === '127.0.0.1') && typeof window !== 'undefined') {
    return new URLSearchParams(window.location.search).has('marketing')
  }
  return false
}

/** Subdomain tenant: slug.product.com */
export function detectSubdomainTenant(): string | null {
  const h = hostname()
  if (!h.endsWith(`.${PRODUCT_APEX}`)) return null
  const sub = h.slice(0, -(PRODUCT_APEX.length + 1))
  if (!sub || sub.includes('.') || sub === 'www' || sub === 'app' || sub === 'api') return null
  return sub
}

/** Parse /e/:slug from a path. */
export function parsePathTenantSlug(path: string): string | null {
  const m = path.match(/^\/e\/([a-z0-9-]+)(?:\/|$)/i)
  return m?.[1]?.toLowerCase() ?? null
}

export type TenantAccessMode = 'legacy' | 'path' | 'subdomain' | 'marketing'

export function useTenant() {
  const isMarketingHost = computed(() => detectMarketingHost())
  const subdomainSlug = computed(() => detectSubdomainTenant())

  const tenantSlug = computed(() => {
    return pathTenantSlug.value || subdomainSlug.value || null
  })

  const accessMode = computed<TenantAccessMode>(() => {
    if (isMarketingHost.value) return 'marketing'
    if (pathTenantSlug.value) return 'path'
    if (subdomainSlug.value) return 'subdomain'
    return 'legacy'
  })

  const accessModeLabel = computed(() => {
    switch (accessMode.value) {
      case 'path':
        return `Path URL (/e/${pathTenantSlug.value})`
      case 'subdomain':
        return `Subdomain (${subdomainSlug.value}.${PRODUCT_APEX})`
      case 'marketing':
        return 'Product / host console'
      default:
        return 'This site'
    }
  })

  /** True when we should show an explicit “you’re signing into X” cue. */
  const showTenantCue = computed(() => {
    return accessMode.value === 'path' || accessMode.value === 'subdomain'
  })

  /** Prefix for in-app links when using path tenancy. */
  function tenantHref(path: string): string {
    const slug = pathTenantSlug.value
    const clean = path.startsWith('/') ? path : `/${path}`
    if (!slug) return clean
    if (clean === '/') return `/e/${slug}`
    return `/e/${slug}${clean}`
  }

  function syncFromRoutePath(path: string) {
    pathTenantSlug.value = parsePathTenantSlug(path)
  }

  return {
    isMarketingHost,
    tenantSlug,
    pathTenantSlug,
    subdomainSlug,
    accessMode,
    accessModeLabel,
    showTenantCue,
    tenantHref,
    syncFromRoutePath,
    productApex: PRODUCT_APEX,
  }
}

/** Header value for API calls (path or subdomain tenant). */
export function currentTenantSlugHeader(): string | null {
  if (typeof window === 'undefined') return null
  const fromPath = parsePathTenantSlug(window.location.pathname)
  if (fromPath) return fromPath
  return detectSubdomainTenant()
}
