import { Google } from 'arctic'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { sign, verify } from 'hono/jwt'
import type { Context } from 'hono'
import { type HydratedDocument } from 'mongoose'
import { AuthToken } from '../db/models/AuthToken.js'
import { type IUser, User } from '../db/models/User.js'
import { getStaticConfig } from '../config.js'
import { apiPublicUrl } from '../lib/urls.js'
import { getTeamById } from './prompts.js'
import { generateToken, hashToken, sendMagicLink } from './email.js'

type UserDoc = HydratedDocument<IUser>

const SESSION_COOKIE = 'realm_session'
const SESSION_MAX_AGE = 60 * 60 * 24 * 30

export type SessionPayload = {
  userId: string
  exp: number
}

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET ?? 'dev-secret-change-in-production'
  if (
    process.env.NODE_ENV === 'production' &&
    (!process.env.SESSION_SECRET || secret === 'dev-secret-change-in-production')
  ) {
    console.error('FATAL: Set a strong SESSION_SECRET in server/.env before running in production.')
    process.exit(1)
  }
  return secret
}

export function getAdminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS ?? ''
  return new Set(raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean))
}

export function userIsAdmin(user: IUser): boolean {
  return getAdminEmails().has(user.email.trim().toLowerCase())
}

function isAdminEmail(email: string): boolean {
  return getAdminEmails().has(email.trim().toLowerCase())
}

export function getGoogleClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? apiPublicUrl('/auth/google/callback')

  if (!clientId || !clientSecret) return null

  return new Google(clientId, clientSecret, redirectUri)
}

export function userToPublic(user: IUser) {
  return {
    id: user._id.toString(),
    displayName: user.displayName,
    email: user.email,
    teamId: user.teamId,
    status: user.status,
    isAdmin: userIsAdmin(user),
  }
}

export function userToAdminPublic(user: IUser & { createdAt?: Date }) {
  return {
    ...userToPublic(user),
    createdAt: user.createdAt,
  }
}

export async function createSession(c: Context, userId: string) {
  const token = await sign(
    { userId, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE },
    getSessionSecret(),
    'HS256',
  )
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  })
}

export function clearSession(c: Context) {
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
}

export async function getSessionUser(c: Context): Promise<UserDoc | null> {
  const token = getCookie(c, SESSION_COOKIE)
  if (!token) return null

  try {
    const payload = (await verify(token, getSessionSecret(), 'HS256')) as SessionPayload
    return User.findById(payload.userId)
  } catch {
    return null
  }
}

export function requireAuth(user: UserDoc | null): UserDoc {
  if (!user) throw new AuthError('Not authenticated')
  return user
}

export function requireAdmin(user: UserDoc | null): UserDoc {
  const u = requireAuth(user)
  if (!userIsAdmin(u)) throw new AuthError('Admin access required')
  return u
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthError'
  }
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

async function applyAdminStatus(user: UserDoc): Promise<UserDoc> {
  const shouldBeAdmin = isAdminEmail(user.email)
  if (user.isAdmin !== shouldBeAdmin) {
    user.isAdmin = shouldBeAdmin
    await user.save()
  }
  return user
}

export async function registerWithEmail(displayName: string, email: string): Promise<UserDoc> {
  const trimmedName = displayName.trim()
  const normalizedEmail = email.trim().toLowerCase()

  if (trimmedName.length < 2) throw new AuthError('Name must be at least 2 characters')
  if (!validateEmail(normalizedEmail)) throw new AuthError('Please enter a valid email address')

  const existing = await User.findOne({ email: normalizedEmail })
  if (existing) {
    throw new AuthError('An account with this email already exists. Try logging in instead.')
  }

  const user = await User.create({
    displayName: trimmedName,
    email: normalizedEmail,
    isAdmin: isAdminEmail(normalizedEmail),
    status: 'pending',
  })

  return user
}

/** Admin-created user — no magic-link email is sent. */
export async function createUserByAdmin(
  displayName: string,
  email: string,
  teamId?: string | null,
): Promise<UserDoc> {
  const user = await registerWithEmail(displayName, email)

  const trimmedTeam = teamId?.trim()
  if (trimmedTeam) {
    if (!getTeamById(trimmedTeam)) throw new AuthError('Invalid team')
    user.teamId = trimmedTeam
    user.status = 'assigned'
    await user.save()
  }

  return user
}

export async function loginByEmail(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase()
  if (!validateEmail(normalizedEmail)) throw new AuthError('Please enter a valid email address')

  const user = await User.findOne({ email: normalizedEmail })
  if (user) {
    await requestMagicLink(normalizedEmail)
  }
  // Always succeed silently if no account — prevents email enumeration
}

export async function requestMagicLink(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase()
  const token = generateToken()
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000)

  await AuthToken.deleteMany({ email: normalizedEmail, usedAt: null })
  await AuthToken.create({
    email: normalizedEmail,
    tokenHash: hashToken(token),
    expiresAt,
  })

  await sendMagicLink(normalizedEmail, token)
}

export async function verifyMagicLink(token: string): Promise<UserDoc> {
  const tokenHash = hashToken(token)
  const record = await AuthToken.findOne({ tokenHash, usedAt: null })

  if (!record || record.expiresAt < new Date()) {
    throw new AuthError('This sign-in link is invalid or has expired.')
  }

  const user = await User.findOne({ email: record.email })
  if (!user) throw new AuthError('Account not found.')

  record.usedAt = new Date()
  await record.save()

  return applyAdminStatus(user)
}

export async function findOrCreateGoogleUser(
  googleId: string,
  displayName: string,
  email: string,
): Promise<UserDoc> {
  const normalizedEmail = email.trim().toLowerCase()

  const byGoogle = await User.findOne({ googleId })
  if (byGoogle) return applyAdminStatus(byGoogle)

  const byEmail = await User.findOne({ email: normalizedEmail })
  if (byEmail) {
    byEmail.googleId = googleId
    if (!byEmail.displayName && displayName) byEmail.displayName = displayName
    await byEmail.save()
    return applyAdminStatus(byEmail)
  }

  const user = await User.create({
    displayName: displayName.trim() || normalizedEmail.split('@')[0],
    email: normalizedEmail,
    googleId,
    isAdmin: isAdminEmail(normalizedEmail),
    status: 'pending',
  })

  return user
}

export async function assignTeamsRandomly(): Promise<{ assigned: number }> {
  const pending = await User.find({ status: 'pending' })
  if (pending.length === 0) return { assigned: 0 }

  const teamIds = getStaticConfig().teams.map((t) => t.id)
  if (teamIds.length === 0) return { assigned: 0 }

  const shuffled = [...pending].sort(() => Math.random() - 0.5)

  await Promise.all(
    shuffled.map((user, i) =>
      User.findByIdAndUpdate(user._id, {
        teamId: teamIds[i % teamIds.length],
        status: 'assigned',
      }),
    ),
  )

  return { assigned: shuffled.length }
}
