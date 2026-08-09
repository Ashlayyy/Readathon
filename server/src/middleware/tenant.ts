import type { MiddlewareHandler } from 'hono'
import { runWithTenantContext } from '../tenancy/context.js'
import {
  isTenantUnavailable,
  resolveTenantFromRequest,
  tenantUnavailableMessage,
} from '../tenancy/resolve.js'
import { refreshSiteSettingsCache } from '../services/siteSettings.js'
import { refreshPromptsCache } from '../services/prompts.js'

const warmed = new Set<string>()

function isExemptApiPath(pathname: string): boolean {
  return (
    pathname.startsWith('/api/platform') ||
    pathname.startsWith('/api/health') ||
    pathname === '/metrics'
  )
}

/**
 * Resolves tenant into AsyncLocalStorage and warms per-tenant caches once.
 * Unknown / inactive path/header/subdomain slugs return 404 for player APIs
 * (never fall back to The Crucible).
 */
export const tenantMiddleware: MiddlewareHandler = async (c, next) => {
  const host = c.req.header('x-forwarded-host') ?? c.req.header('host')
  const pathname = new URL(c.req.url).pathname
  const tenantSlugHeader = c.req.header('x-tenant-slug')

  const ctx = await resolveTenantFromRequest({
    host,
    pathname,
    tenantSlugHeader,
  })

  if (
    isTenantUnavailable(ctx) &&
    pathname.startsWith('/api/') &&
    !isExemptApiPath(pathname)
  ) {
    return runWithTenantContext(ctx, () =>
      c.json(
        {
          error: tenantUnavailableMessage(ctx.unavailableReason),
          code: 'TENANT_UNAVAILABLE',
          reason: ctx.unavailableReason ?? 'not_found',
          slug: ctx.slug,
        },
        404,
      ),
    )
  }

  return runWithTenantContext(ctx, async () => {
    if (ctx.tenant) {
      const key = ctx.tenant._id.toString()
      if (!warmed.has(key)) {
        await Promise.all([refreshSiteSettingsCache(), refreshPromptsCache()])
        warmed.add(key)
      }
    }
    return next()
  })
}
