import type { Context, Next } from 'hono'
import { getSessionUser, userIsAdmin } from '../services/auth.js'
import { getSiteSettingsSync } from '../services/siteSettings.js'

const EXEMPT_PATHS = new Set(['/api/health', '/api/config'])

export async function downtimeGuard(c: Context, next: Next) {
  if (!getSiteSettingsSync().downtimeMode) return next()

  const path = c.req.path
  if (EXEMPT_PATHS.has(path) || path.startsWith('/api/auth')) return next()

  const user = await getSessionUser(c)
  if (user && userIsAdmin(user)) return next()

  return c.json(
    { error: 'The site is temporarily unavailable for maintenance.', downtime: true },
    503,
  )
}
