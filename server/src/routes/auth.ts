import { Hono } from 'hono'
import { generateCodeVerifier, generateState } from 'arctic'
import { getCookie, setCookie } from 'hono/cookie'
import {
  AuthError,
  clearSession,
  createSession,
  findOrCreateGoogleUser,
  getGoogleClient,
  getSessionUser,
  loginByEmail,
  registerWithEmail,
  userToPublic,
} from '../services/auth.js'
import { Question } from '../db/models/Question.js'

const OAUTH_STATE_COOKIE = 'oauth_state'
const OAUTH_VERIFIER_COOKIE = 'oauth_verifier'

export const authRoutes = new Hono()

authRoutes.get('/me', async (c) => {
  const user = await getSessionUser(c)
  if (!user) return c.json({ user: null })

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
  })
})

authRoutes.post('/register', async (c) => {
  try {
    const { displayName, email } = await c.req.json<{ displayName: string; email: string }>()
    const user = await registerWithEmail(displayName, email)
    await createSession(c, user._id.toString())
    return c.json({ user: userToPublic(user) })
  } catch (e) {
    if (e instanceof AuthError) return c.json({ error: e.message }, 400)
    throw e
  }
})

authRoutes.post('/login', async (c) => {
  try {
    const { email } = await c.req.json<{ email: string }>()
    const user = await loginByEmail(email)
    await createSession(c, user._id.toString())
    return c.json({ user: userToPublic(user) })
  } catch (e) {
    if (e instanceof AuthError) return c.json({ error: e.message }, 400)
    throw e
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
  const frontend = process.env.FRONTEND_URL ?? 'http://localhost:5173'
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
    const profile = (await res.json()) as { sub: string; name: string; email: string }

    const user = await findOrCreateGoogleUser(profile.sub, profile.name, profile.email)
    await createSession(c, user._id.toString())
    return c.redirect(`${frontend}/`)
  } catch {
    return c.redirect(`${frontend}/login?error=oauth_failed`)
  }
})
