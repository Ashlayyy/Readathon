import type { MiddlewareHandler } from 'hono'
import { runWithTenantContext } from '../tenancy/context.js'
import { resolveTenantFromRequest } from '../tenancy/resolve.js'
import { refreshSiteSettingsCache } from '../services/siteSettings.js'
import { refreshPromptsCache } from '../services/prompts.js'

const warmed = new Set<string>()

/**
 * Resolves tenant into AsyncLocalStorage and warms per-tenant caches once.
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
