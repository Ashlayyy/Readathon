import { Google } from 'arctic'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { sign, verify } from 'hono/jwt'
import type { Context } from 'hono'
import { type HydratedDocument } from 'mongoose'
import { AuthToken } from '../db/models/AuthToken.js'
import { PlatformAccount, type IPlatformAccount } from '../db/models/PlatformAccount.js'
import { Membership } from '../db/models/Membership.js'
import { type IUser, User } from '../db/models/User.js'
import { apiPublicUrl } from '../lib/urls.js'
import {
	getTenantContext,
	getTenantIdString,
	runWithTenantContext,
} from '../tenancy/context.js'
import { ensureUserTenancy } from '../tenancy/ensureUserTenancy.js'
import { ensurePlatformAccount } from '../tenancy/createTenant.js'
import {
	ensureDefaultTenant,
	findTenantBySlug,
} from '../tenancy/resolve.js'
import { getTeamById } from './prompts.js'
import { generateToken, hashToken, sendMagicLink } from './email.js'

type UserDoc = HydratedDocument<IUser>
type AccountDoc = HydratedDocument<IPlatformAccount>

const SESSION_COOKIE = 'realm_session'
const SESSION_MAX_AGE = 60 * 60 * 24 * 30

export type SessionPayload = {
	userId?: string
	accountId?: string
	exp: number
}

function getSessionSecret(): string {
	const secret =
		process.env.SESSION_SECRET ?? 'dev-secret-change-in-production'
	if (
		process.env.NODE_ENV === 'production' &&
		(!process.env.SESSION_SECRET ||
			secret === 'dev-secret-change-in-production')
	) {
		console.error(
			'FATAL: Set a strong SESSION_SECRET in server/.env before running in production.',
		)
		process.exit(1)
	}
	return secret
}

export function userIsAdmin(user: IUser): boolean {
	return Boolean(user.isAdmin)
}

export function getGoogleClient() {
	const clientId = process.env.GOOGLE_CLIENT_ID
	const clientSecret = process.env.GOOGLE_CLIENT_SECRET
	const redirectUri =
		process.env.GOOGLE_REDIRECT_URI ?? apiPublicUrl('/auth/google/callback')

	if (!clientId || !clientSecret) return null

	return new Google(clientId, clientSecret, redirectUri)
}

export function effectiveAvatarUrl(user: IUser): string | null {
	const custom = user.avatarUrl?.trim() || null
	if (custom) return custom
	return user.googleAvatarUrl?.trim() || null
}

export function userToPublic(user: IUser) {
	return {
		id: user._id.toString(),
		displayName: user.displayName,
		email: user.email,
		teamId: user.teamId,
		status: user.status,
		isAdmin: userIsAdmin(user),
		avatarUrl: effectiveAvatarUrl(user),
		hasCustomAvatar: Boolean(user.avatarUrl?.trim()),
		preferEventThemes: user.preferEventThemes !== false,
		accountId: (user as { accountId?: { toString(): string } | null }).accountId?.toString() ?? null,
	}
}

export function userToAdminPublic(user: IUser & { createdAt?: Date }) {
	return {
		...userToPublic(user),
		createdAt: user.createdAt,
	}
}

export function accountToPublic(account: IPlatformAccount) {
	return {
		id: account._id.toString(),
		email: account.email,
		displayName: account.displayName,
		avatarUrl: account.avatarUrl || account.googleAvatarUrl || null,
	}
}

function sessionCookieOptions() {
	const domain = process.env.COOKIE_DOMAIN?.trim() || undefined
	return {
		httpOnly: true as const,
		secure: process.env.NODE_ENV === 'production',
		sameSite: 'Lax' as const,
		path: '/',
		maxAge: SESSION_MAX_AGE,
		...(domain ? { domain } : {}),
	}
}

export async function createSession(
	c: Context,
	opts: { userId?: string | null; accountId: string },
) {
	const token = await sign(
		{
			userId: opts.userId ?? undefined,
			accountId: opts.accountId,
			exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
		},
		getSessionSecret(),
		'HS256',
	)
	setCookie(c, SESSION_COOKIE, token, sessionCookieOptions())
}

/** @deprecated Prefer createSession with accountId */
export async function createSessionForUser(c: Context, user: UserDoc) {
	await ensureUserTenancy(user)
	const accountId = (user as { accountId?: { toString(): string } }).accountId?.toString()
	if (!accountId) throw new AuthError('Account missing for session')
	await createSession(c, { userId: user._id.toString(), accountId })
}

export function clearSession(c: Context) {
	const domain = process.env.COOKIE_DOMAIN?.trim() || undefined
	deleteCookie(c, SESSION_COOKIE, {
		path: '/',
		...(domain ? { domain } : {}),
	})
}

async function resolveUserForAccountInTenant(
	accountId: string,
): Promise<UserDoc | null> {
	const tenantId = getTenantIdString()
	if (!tenantId) return null

	const membership = await Membership.findOne({
		tenantId,
		accountId,
	})
	const hostAdmin = Boolean(
		membership &&
			(membership.isAdmin ||
				membership.role === 'owner' ||
				membership.role === 'admin'),
	)

	if (membership?.legacyUserId) {
		const user = await User.findById(membership.legacyUserId)
		if (user) {
			if (hostAdmin && !user.isAdmin) {
				user.isAdmin = true
				await user.save()
			}
			return user
		}
	}

	const account = await PlatformAccount.findById(accountId)
	if (!account) return null

	let user = await User.findOne({ tenantId, email: account.email })
	if (!user) {
		user = await User.create({
			displayName: account.displayName,
			email: account.email,
			googleId: account.googleId ?? undefined,
			googleAvatarUrl: account.googleAvatarUrl,
			avatarUrl: account.avatarUrl,
			tenantId,
			accountId: account._id,
			isAdmin: hostAdmin,
			status: 'pending',
		})
	} else if (hostAdmin && !user.isAdmin) {
		user.isAdmin = true
		user.accountId = account._id
		await user.save()
	}
	if (membership && !membership.legacyUserId) {
		membership.legacyUserId = user._id
		await membership.save()
	}
	await ensureUserTenancy(user)
	return user
}

export async function getSessionAccount(c: Context): Promise<AccountDoc | null> {
	const token = getCookie(c, SESSION_COOKIE)
	if (!token) return null
	try {
		const payload = (await verify(
			token,
			getSessionSecret(),
			'HS256',
		)) as SessionPayload
		if (!payload.accountId) {
			// Legacy session: only userId
			if (!payload.userId) return null
			const user = await User.findById(payload.userId).setOptions({
				skipTenant: true,
			})
			if (!user) return null
			await ensureUserTenancy(user)
			const aid = (user as { accountId?: { toString(): string } }).accountId
			return aid ? PlatformAccount.findById(aid) : null
		}
		return PlatformAccount.findById(payload.accountId)
	} catch {
		return null
	}
}

export async function getSessionUser(c: Context): Promise<UserDoc | null> {
	const token = getCookie(c, SESSION_COOKIE)
	if (!token) return null

	try {
		const payload = (await verify(
			token,
			getSessionSecret(),
			'HS256',
		)) as SessionPayload

		const ctx = getTenantContext()
		if (ctx?.isMarketingHost) return null

		if (payload.userId) {
			const user = await User.findById(payload.userId).setOptions({
				skipTenant: true,
			})
			if (user) {
				const tid = getTenantIdString()
				const userTid = (user as { tenantId?: { toString(): string } }).tenantId?.toString()
				if (tid && userTid && tid !== userTid) {
					if (payload.accountId) {
						return resolveUserForAccountInTenant(payload.accountId)
					}
					return null
				}
				if (!(user as { accountId?: unknown }).accountId) {
					await ensureUserTenancy(user)
				}
				return user
			}
		}

		if (payload.accountId) {
			return resolveUserForAccountInTenant(payload.accountId)
		}
		return null
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

export async function registerWithEmail(
	displayName: string,
	email: string,
): Promise<UserDoc> {
	const trimmedName = displayName.trim()
	const normalizedEmail = email.trim().toLowerCase()

	if (trimmedName.length < 2)
		throw new AuthError('Name must be at least 2 characters')
	if (!validateEmail(normalizedEmail))
		throw new AuthError('Please enter a valid email address')

	const ctx = getTenantContext()
	if (ctx?.isMarketingHost) {
		throw new AuthError('Use the host console to create an event first.')
	}

	const existing = await User.findOne({ email: normalizedEmail })
	if (existing) {
		throw new AuthError(
			'An account with this email already exists. Try logging in instead.',
		)
	}

	await ensurePlatformAccount({
		email: normalizedEmail,
		displayName: trimmedName,
	})

	const user = await User.create({
		displayName: trimmedName,
		email: normalizedEmail,
		isAdmin: false,
		status: 'pending',
	})
	await ensureUserTenancy(user)

	return user
}

/** Admin-created user - no magic-link email is sent. */
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
	if (!validateEmail(normalizedEmail))
		throw new AuthError('Please enter a valid email address')

	const ctx = getTenantContext()
	if (ctx?.isMarketingHost) {
		const account = await PlatformAccount.findOne({ email: normalizedEmail })
		if (account) await requestMagicLink(normalizedEmail)
		return
	}

	const user = await User.findOne({ email: normalizedEmail })
	const account = await PlatformAccount.findOne({ email: normalizedEmail })
	if (user || account) {
		await requestMagicLink(normalizedEmail)
	}
}

export async function requestMagicLink(email: string): Promise<void> {
	const normalizedEmail = email.trim().toLowerCase()
	const token = generateToken()
	const expiresAt = new Date(Date.now() + 15 * 60 * 1000)
	const ctx = getTenantContext()
	const forPlatform = Boolean(ctx?.isMarketingHost || !ctx?.tenant)
	const tenantSlug = forPlatform ? null : (ctx?.slug ?? null)

	await AuthToken.deleteMany({ email: normalizedEmail, usedAt: null }).setOptions({
		skipTenant: true,
	})
	await AuthToken.create({
		email: normalizedEmail,
		tokenHash: hashToken(token),
		expiresAt,
		tenantSlug,
		forPlatform,
	})

	await sendMagicLink(normalizedEmail, token, {
		forPlatform,
		tenantSlug,
	})
}

export type MagicLinkResult =
	| {
			kind: 'user'
			user: UserDoc
			account: AccountDoc
			/** Frontend path to land on after verify (e.g. /e/slug/ or /). */
			redirectPath: string
	  }
	| { kind: 'account'; account: AccountDoc; redirectPath: string }

function redirectPathForTenant(isDefault: boolean, slug: string): string {
	return isDefault || slug === 'crucible' ? '/' : `/e/${slug}/`
}

async function resolveUserInTenantContext(
	account: AccountDoc,
	email: string,
): Promise<UserDoc> {
	let user = await User.findOne({ email })
	if (!user) {
		user = await User.create({
			displayName: account.displayName,
			email: account.email,
			accountId: account._id,
			isAdmin: false,
			status: 'pending',
		})
	}
	await ensureUserTenancy(user)
	return user
}

export async function verifyMagicLink(token: string): Promise<MagicLinkResult> {
	const tokenHash = hashToken(token)
	const record = await AuthToken.findOne({ tokenHash, usedAt: null }).setOptions({
		skipTenant: true,
	})

	if (!record || record.expiresAt < new Date()) {
		throw new AuthError('This sign-in link is invalid or has expired.')
	}

	record.usedAt = new Date()
	await record.save()

	const account = await ensurePlatformAccount({
		email: record.email,
		displayName: record.email.split('@')[0]!,
	})

	const forPlatform = Boolean(
		(record as { forPlatform?: boolean }).forPlatform,
	)
	const storedSlug = String(
		(record as { tenantSlug?: string | null }).tenantSlug ?? '',
	)
		.trim()
		.toLowerCase()

	if (forPlatform) {
		return { kind: 'account', account, redirectPath: '/host' }
	}

	let tenant = storedSlug ? await findTenantBySlug(storedSlug) : null
	if (!tenant) {
		tenant = await ensureDefaultTenant()
	}

	const redirectPath = redirectPathForTenant(
		Boolean(tenant.isDefault),
		tenant.slug,
	)

	const user = await runWithTenantContext(
		{
			tenant,
			isMarketingHost: false,
			resolution: storedSlug ? 'header' : 'default',
			slug: tenant.slug,
		},
		() => resolveUserInTenantContext(account, record.email),
	)

	return { kind: 'user', user, account, redirectPath }
}

export async function findOrCreateGoogleUser(
	googleId: string,
	displayName: string,
	email: string,
	pictureUrl?: string | null,
	opts?: { tenantSlug?: string | null; forPlatform?: boolean },
): Promise<MagicLinkResult> {
	const normalizedEmail = email.trim().toLowerCase()
	const picture = pictureUrl?.trim() || null

	const account = await ensurePlatformAccount({
		email: normalizedEmail,
		displayName: displayName.trim() || normalizedEmail.split('@')[0]!,
		googleId,
		googleAvatarUrl: picture,
	})

	const ctx = getTenantContext()
	const forPlatform =
		opts?.forPlatform ?? Boolean(ctx?.isMarketingHost || !ctx?.tenant)
	if (forPlatform) {
		return { kind: 'account', account, redirectPath: '/host' }
	}

	const slugHint = (opts?.tenantSlug ?? ctx?.slug ?? '').trim().toLowerCase()
	let tenant = slugHint ? await findTenantBySlug(slugHint) : ctx?.tenant
	if (!tenant) tenant = await ensureDefaultTenant()

	const redirectPath = redirectPathForTenant(
		Boolean(tenant.isDefault),
		tenant.slug,
	)

	const user = await runWithTenantContext(
		{
			tenant,
			isMarketingHost: false,
			resolution: slugHint ? 'header' : 'default',
			slug: tenant.slug,
		},
		async () => {
			const byGoogle = await User.findOne({ googleId })
			if (byGoogle) {
				if (picture && byGoogle.googleAvatarUrl !== picture) {
					byGoogle.googleAvatarUrl = picture
					await byGoogle.save()
				}
				await ensureUserTenancy(byGoogle)
				return byGoogle
			}

			const byEmail = await User.findOne({ email: normalizedEmail })
			if (byEmail) {
				byEmail.googleId = googleId
				if (!byEmail.displayName && displayName) {
					byEmail.displayName = displayName
				}
				if (picture) byEmail.googleAvatarUrl = picture
				await byEmail.save()
				await ensureUserTenancy(byEmail)
				return byEmail
			}

			const created = await User.create({
				displayName: displayName.trim() || normalizedEmail.split('@')[0],
				email: normalizedEmail,
				googleId,
				googleAvatarUrl: picture,
				isAdmin: false,
				status: 'pending',
			})
			await ensureUserTenancy(created)
			return created
		},
	)

	return { kind: 'user', user, account, redirectPath }
}

/** Ensure default tenant exists when resolving legacy sessions outside request ALS. */
export async function ensureBootTenant(): Promise<void> {
	await ensureDefaultTenant()
}
