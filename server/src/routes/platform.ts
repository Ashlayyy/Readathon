import { Hono } from 'hono'
import {
  accountToPublic,
  AuthError,
  clearSession,
  getSessionAccount,
  loginByEmail,
  requestMagicLink,
} from '../services/auth.js'
import { rateLimit } from '../middleware/rateLimit.js'
import {
  createTenantEvent,
  getEventForHost,
  inviteCohost,
  listMembershipsForAccount,
  patchEventOnboarding,
  PlatformError,
  ensurePlatformAccount,
  updateHostEvent,
} from '../tenancy/createTenant.js'
import {
  getProductApex,
  getProductName,
  getTenantContext,
} from '../tenancy/context.js'
import { getDiscordBotInviteUrl } from '../services/discordRoleVerify.js'
import { getPlatformDiscordBotToken } from '../tenancy/platformDiscord.js'
import type { HostOnboarding } from '../tenancy/hostOnboarding.js'

export const platformRoutes = new Hono()

const writeLimiter = rateLimit({ windowMs: 60 * 1000, max: 20, keyPrefix: 'platform' })

platformRoutes.get('/', (c) => {
  const tenancy = getTenantContext()
  return c.json({
    productName: getProductName(),
    apex: getProductApex(),
    isMarketingHost: tenancy?.isMarketingHost ?? false,
    tenantSlug: tenancy?.slug ?? null,
    platformBotConfigured: Boolean(getPlatformDiscordBotToken()),
  })
})

platformRoutes.get('/me', async (c) => {
  const account = await getSessionAccount(c)
  if (!account) return c.json({ account: null, memberships: [] })
  const memberships = await listMembershipsForAccount(account._id)
  return c.json({
    account: accountToPublic(account),
    memberships,
  })
})

platformRoutes.post('/login', writeLimiter, async (c) => {
  try {
    const { email } = await c.req.json<{ email: string }>()
    // Ensure account row exists so hosts can sign up from marketing
    const normalized = email.trim().toLowerCase()
    if (normalized) {
      await ensurePlatformAccount({
        email: normalized,
        displayName: normalized.split('@')[0]!,
      })
    }
    await loginByEmail(email)
    return c.json({
      sent: true,
      message:
        'Check your email for a sign-in link. It expires in 15 minutes.',
    })
  } catch (e) {
    if (e instanceof AuthError) return c.json({ error: e.message }, 400)
    throw e
  }
})

platformRoutes.post('/register', writeLimiter, async (c) => {
  try {
    const { displayName, email } = await c.req.json<{
      displayName: string
      email: string
    }>()
    const name = (displayName ?? '').trim()
    const normalized = (email ?? '').trim().toLowerCase()
    if (name.length < 2) return c.json({ error: 'Name must be at least 2 characters' }, 400)
    await ensurePlatformAccount({ email: normalized, displayName: name })
    await requestMagicLink(normalized)
    return c.json({
      sent: true,
      message: 'Check your email for a sign-in link to continue.',
    })
  } catch (e) {
    if (e instanceof AuthError) return c.json({ error: e.message }, 400)
    throw e
  }
})

platformRoutes.post('/events', writeLimiter, async (c) => {
  const account = await getSessionAccount(c)
  if (!account) return c.json({ error: 'Sign in to create an event' }, 401)

  try {
    const body = await c.req.json<{ name?: string; slug?: string }>()
    const result = await createTenantEvent({
      name: body.name ?? '',
      slug: body.slug ?? '',
      ownerAccountId: account._id,
      ownerDisplayName: account.displayName,
      ownerEmail: account.email,
    })
    return c.json({
      tenant: {
        id: result.tenant._id.toString(),
        slug: result.tenant.slug,
        name: result.tenant.name,
      },
      pathUrl: result.pathUrl,
      subdomainUrl: result.subdomainUrl,
      adminPath: `/e/${result.tenant.slug}/admin?tab=settings&from=host`,
      adminUrl: `${result.pathUrl}/admin?tab=settings&from=host`,
      eventHomePath: `/host/e/${result.tenant.slug}`,
    })
  } catch (e) {
    if (e instanceof PlatformError) return c.json({ error: e.message }, 400)
    throw e
  }
})

platformRoutes.get('/events/:slug', async (c) => {
  const account = await getSessionAccount(c)
  if (!account) return c.json({ error: 'Sign in required' }, 401)
  const slug = c.req.param('slug')
  if (!slug) return c.json({ error: 'Slug required' }, 400)
  try {
    const event = await getEventForHost(account._id, slug)
    return c.json({ event })
  } catch (e) {
    if (e instanceof PlatformError) {
      const status = e.message === 'Event not found.' ? 404 : 403
      return c.json({ error: e.message }, status)
    }
    throw e
  }
})

platformRoutes.patch('/events/:slug/onboarding', writeLimiter, async (c) => {
  const account = await getSessionAccount(c)
  if (!account) return c.json({ error: 'Sign in required' }, 401)
  const slug = c.req.param('slug')
  if (!slug) return c.json({ error: 'Slug required' }, 400)
  try {
    const body = await c.req.json<Partial<HostOnboarding>>()
    const membership = await patchEventOnboarding(account._id, slug, body)
    return c.json({ membership })
  } catch (e) {
    if (e instanceof PlatformError) {
      const status = e.message === 'Event not found.' ? 404 : 403
      return c.json({ error: e.message }, status)
    }
    throw e
  }
})

platformRoutes.patch('/events/:slug', writeLimiter, async (c) => {
  const account = await getSessionAccount(c)
  if (!account) return c.json({ error: 'Sign in required' }, 401)
  const slug = c.req.param('slug')
  if (!slug) return c.json({ error: 'Slug required' }, 400)
  try {
    const body = await c.req.json<{ name?: string; status?: 'active' | 'archived' }>()
    const membership = await updateHostEvent(account._id, slug, body)
    return c.json({ membership })
  } catch (e) {
    if (e instanceof PlatformError) {
      const status = e.message === 'Event not found.' ? 404 : 400
      return c.json({ error: e.message }, status)
    }
    throw e
  }
})

platformRoutes.post('/events/:slug/cohosts', writeLimiter, async (c) => {
  const account = await getSessionAccount(c)
  if (!account) return c.json({ error: 'Sign in required' }, 401)
  const slug = c.req.param('slug')
  if (!slug) return c.json({ error: 'Slug required' }, 400)
  try {
    const body = await c.req.json<{ email?: string; displayName?: string }>()
    const invitee = await inviteCohost(account._id, slug, {
      email: body.email ?? '',
      displayName: body.displayName,
    })
    return c.json({ invitee })
  } catch (e) {
    if (e instanceof PlatformError) {
      const status = e.message === 'Event not found.' ? 404 : 400
      return c.json({ error: e.message }, status)
    }
    throw e
  }
})

platformRoutes.post('/logout', (c) => {
  clearSession(c)
  return c.json({ ok: true })
})

platformRoutes.get('/discord/bot-invite', async (c) => {
  const account = await getSessionAccount(c)
  if (!account) return c.json({ error: 'Sign in required' }, 401)
  const result = await getDiscordBotInviteUrl()
  if (!result.ok) return c.json({ error: result.error }, 400)
  return c.json(result)
})
