import { Hono } from 'hono'
import { generateCodeVerifier, generateState } from 'arctic'
import { getCookie, setCookie } from 'hono/cookie'
import { rateLimit } from '../middleware/rateLimit.js'
import {
  AuthError,
  accountToPublic,
  clearSession,
  createSession,
  findOrCreateGoogleUser,
  getGoogleClient,
  getSessionAccount,
  getSessionUser,
  registerWithEmail,
  loginByEmail,
  requestMagicLink,
  userToPublic,
  verifyMagicLink,
} from '../services/auth.js'
import { Question } from '../db/models/Question.js'
import { getTenantContext, getProductApex } from '../tenancy/context.js'

const OAUTH_STATE_COOKIE = 'oauth_state'
const OAUTH_VERIFIER_COOKIE = 'oauth_verifier'

export const authRoutes = new Hono()

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, keyPrefix: 'auth' })
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 8, keyPrefix: 'login' })

function frontendBase(): string {
  return process.env.FRONTEND_URL ?? 'http://localhost:5173'
}

authRoutes.get('/me', async (c) => {
  const tenancy = getTenantContext()
  const account = await getSessionAccount(c)

  if (tenancy?.isMarketingHost) {
    return c.json({
      user: null,
      account: account ? accountToPublic(account) : null,
      isMarketingHost: true,
    })
  }

  const user = await getSessionUser(c)
  if (!user) {
    return c.json({
      user: null,
      account: account ? accountToPublic(account) : null,
      isMarketingHost: false,
    })
  }

  const unreadAnswers = await Question.countDocuments({
    userId: user._id,
    answer: { $ne: null },
    answerSeen: false,
  })

  return c.json({
    user: {
      ...userToPublic(user),
      unreadAnswers,
    },
    account: account ? accountToPublic(account) : null,
    isMarketingHost: false,
  })
})

authRoutes.post('/register', authLimiter, async (c) => {
  try {
    const { displayName, email } = await c.req.json<{ displayName: string; email: string }>()
    await registerWithEmail(displayName, email)
    await requestMagicLink(email)
    return c.json({
      sent: true,
      message:
        'Account created! Check your email for a sign-in link to continue. It expires in 15 minutes.',
    })
  } catch (e) {
    if (e instanceof AuthError) return c.json({ error: e.message }, 400)
    throw e
  }
})

authRoutes.post('/login', loginLimiter, async (c) => {
  try {
    const { email } = await c.req.json<{ email: string }>()
    await loginByEmail(email)
    return c.json({
      sent: true,
      message: 'If an account exists for that email, we sent a sign-in link. It expires in 15 minutes.',
    })
  } catch (e) {
    if (e instanceof AuthError) return c.json({ error: e.message }, 400)
    throw e
  }
})

authRoutes.get('/verify', async (c) => {
  const frontend = frontendBase()
  const token = c.req.query('token')

  if (!token) {
    return c.redirect(`${frontend}/login?error=invalid_link`)
  }

  try {
    const result = await verifyMagicLink(token)
    if (result.kind === 'user') {
      await createSession(c, {
        userId: result.user._id.toString(),
        accountId: result.account._id.toString(),
      })
      return c.redirect(`${frontend}/`)
    }
    await createSession(c, { accountId: result.account._id.toString() })
    const apex = getProductApex()
    // Prefer host console on product marketing surface
    const hostUrl =
      process.env.PRODUCT_MARKETING_URL?.trim() ||
      `https://www.${apex}/host`
    return c.redirect(hostUrl.includes('localhost') ? `${frontend}/host` : hostUrl)
  } catch {
    return c.redirect(`${frontend}/login?error=invalid_link`)
  }
})

authRoutes.post('/logout', (c) => {
  clearSession(c)
  return c.json({ ok: true })
})

authRoutes.get('/google', (c) => {
  const google = getGoogleClient()
  if (!google) return c.json({ error: 'Google login is not configured' }, 503)

  const state = generateState()
  const verifier = generateCodeVerifier()
  const url = google.createAuthorizationURL(state, verifier, ['openid', 'profile', 'email'])

  const opts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax' as const,
    path: '/',
    maxAge: 600,
  }
  setCookie(c, OAUTH_STATE_COOKIE, state, opts)
  setCookie(c, OAUTH_VERIFIER_COOKIE, verifier, opts)

  return c.redirect(url.toString())
})

authRoutes.get('/google/callback', async (c) => {
  const frontend = frontendBase()
  const google = getGoogleClient()
  if (!google) return c.redirect(`${frontend}/login?error=google_not_configured`)

  const state = getCookie(c, OAUTH_STATE_COOKIE)
  const verifier = getCookie(c, OAUTH_VERIFIER_COOKIE)
  const code = c.req.query('code')
  const returnedState = c.req.query('state')

  if (!state || !verifier || !code || state !== returnedState) {
    return c.redirect(`${frontend}/login?error=oauth_failed`)
  }

  try {
    const tokens = await google.validateAuthorizationCode(code, verifier)
    const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokens.accessToken()}` },
    })
    const profile = (await res.json()) as {
      sub: string
      name: string
      email: string
      picture?: string
    }

    const result = await findOrCreateGoogleUser(
      profile.sub,
      profile.name,
      profile.email,
      profile.picture ?? null,
    )
    if (result.kind === 'user') {
      await createSession(c, {
        userId: result.user._id.toString(),
        accountId: result.account._id.toString(),
      })
      return c.redirect(`${frontend}/`)
    }
    await createSession(c, { accountId: result.account._id.toString() })
    return c.redirect(`${frontend}/host`)
  } catch {
    return c.redirect(`${frontend}/login?error=oauth_failed`)
  }
})
