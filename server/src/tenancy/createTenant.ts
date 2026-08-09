import type { Types } from 'mongoose'
import { Tenant, type ITenant } from '../db/models/Tenant.js'
import { SiteSettings } from '../db/models/SiteSettings.js'
import { Membership } from '../db/models/Membership.js'
import { PlatformAccount } from '../db/models/PlatformAccount.js'
import { User } from '../db/models/User.js'
import { getStaticConfig } from '../config.js'
import { getProductApex } from './context.js'
import { clearDefaultTenantCache } from './resolve.js'
import {
  DEFAULT_HOST_ONBOARDING,
  mergeHostOnboarding,
  normalizeHostOnboarding,
  onboardingProgress,
  type HostOnboarding,
} from './hostOnboarding.js'
import { getPlatformDiscordBotToken } from './platformDiscord.js'

/** Where player SPAs are served (Book Baddies / /e/:slug). */
export function playerPublicOrigin(): string {
  return (
    process.env.PLAYER_URL?.trim() ||
    process.env.FRONTEND_URL?.trim() ||
    'http://localhost:5173'
  ).replace(/\/+$/, '')
}

/** Marketing + host panel (product.com). */
export function productPublicOrigin(): string {
  return (
    process.env.PRODUCT_URL?.trim() ||
    process.env.PRODUCT_MARKETING_URL?.trim() ||
    'http://localhost:5174'
  ).replace(/\/+$/, '')
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/

export class PlatformError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PlatformError'
  }
}

export function validateTenantSlug(slug: string): string {
  const s = slug.trim().toLowerCase()
  if (!SLUG_RE.test(s)) {
    throw new PlatformError(
      'Slug must be 2–48 characters: lowercase letters, numbers, and hyphens.',
    )
  }
  const reserved = new Set([
    'www',
    'app',
    'api',
    'admin',
    'host',
    'static',
    'assets',
    'mail',
    'status',
  ])
  if (reserved.has(s)) throw new PlatformError('That slug is reserved.')
  return s
}

export type CreateTenantInput = {
  name: string
  slug: string
  ownerAccountId: Types.ObjectId
  ownerDisplayName: string
  ownerEmail: string
}

export type CreateTenantResult = {
  tenant: ITenant
  pathUrl: string
  subdomainUrl: string
}

/** Create a new hosted event + empty settings + owner membership/user. */
export async function createTenantEvent(
  input: CreateTenantInput,
): Promise<CreateTenantResult> {
  const slug = validateTenantSlug(input.slug)
  const name = input.name.trim()
  if (name.length < 2) throw new PlatformError('Event name is required.')

  const existing = await Tenant.findOne({ slug })
  if (existing) throw new PlatformError('That slug is already taken.')

  const staticCfg = getStaticConfig()
  const config = {
    ...staticCfg,
    event: {
      ...staticCfg.event,
      name,
      subtitle: staticCfg.event?.subtitle ?? '',
      tagline: staticCfg.event?.tagline ?? 'A hosted readathon',
    },
  }

  const tenant = await Tenant.create({
    slug,
    name,
    isDefault: false,
    status: 'active',
    config,
    discordGuildIds: [],
  })

  try {
    await SiteSettings.create({
      tenantId: tenant._id,
      showTeamRosters: false,
      downtimeMode: false,
    })

    let user = await User.findOne({
      tenantId: tenant._id,
      email: input.ownerEmail,
    }).setOptions({ skipTenant: true })

    if (!user) {
      try {
        user = await User.create({
          displayName: input.ownerDisplayName,
          email: input.ownerEmail,
          tenantId: tenant._id,
          accountId: input.ownerAccountId,
          isAdmin: true,
          status: 'pending',
        })
      } catch (e) {
        const code = (e as { code?: number })?.code
        const keyPattern = (e as { keyPattern?: Record<string, number> })?.keyPattern
        if (code === 11000 && keyPattern && 'email' in keyPattern && !('tenantId' in keyPattern)) {
          throw new PlatformError(
            'Could not create your host account for this event. Restart the API so tenancy migration can drop the legacy global email index, then try again.',
          )
        }
        if (code === 11000) {
          throw new PlatformError(
            'Could not create your host account for this event (duplicate key). Try a different email or contact support.',
          )
        }
        throw e
      }
    } else {
      user.isAdmin = true
      user.accountId = input.ownerAccountId
      await user.save()
    }

    const membership = await Membership.findOne({
      tenantId: tenant._id,
      accountId: input.ownerAccountId,
    }).setOptions({ skipTenant: true })
    if (!membership) {
      await Membership.create({
        tenantId: tenant._id,
        accountId: input.ownerAccountId,
        legacyUserId: user._id,
        displayName: input.ownerDisplayName,
        isAdmin: true,
        role: 'owner',
        status: 'pending',
        hostOnboarding: { ...DEFAULT_HOST_ONBOARDING },
      })
    } else {
      membership.role = 'owner'
      membership.isAdmin = true
      membership.legacyUserId = user._id
      if (!membership.hostOnboarding) {
        membership.hostOnboarding = { ...DEFAULT_HOST_ONBOARDING }
      }
      await membership.save()
    }
  } catch (e) {
    // Roll back partial tenant so the slug can be reused.
    await Membership.deleteMany({ tenantId: tenant._id }).setOptions({
      skipTenant: true,
    })
    await User.deleteMany({ tenantId: tenant._id }).setOptions({ skipTenant: true })
    await SiteSettings.deleteMany({ tenantId: tenant._id }).setOptions({
      skipTenant: true,
    })
    await Tenant.deleteOne({ _id: tenant._id })
    throw e
  }

  clearDefaultTenantCache()

  const apex = getProductApex()
  const players = playerPublicOrigin()
  return {
    tenant,
    pathUrl: `${players}/e/${slug}`,
    subdomainUrl: `https://${slug}.${apex}`,
  }
}

export type PublicMembership = {
  tenantId: string
  slug: string
  name: string
  role: string
  isAdmin: boolean
  status: string
  tenantStatus: string
  pathUrl: string
  subdomainUrl: string
  adminUrl: string
  legacyUserId: string | null
  hostOnboarding: HostOnboarding
  onboarding: ReturnType<typeof onboardingProgress>
}

function membershipToPublic(
  m: {
    role: string
    isAdmin: boolean
    status: string
    legacyUserId?: Types.ObjectId | null
    hostOnboarding?: Partial<HostOnboarding> | null
  },
  t: ITenant,
): PublicMembership {
  const apex = getProductApex()
  const players = playerPublicOrigin()
  const onboarding = normalizeHostOnboarding(m.hostOnboarding)
  return {
    tenantId: t._id.toString(),
    slug: t.slug,
    name: t.name,
    role: m.role,
    isAdmin: m.isAdmin,
    status: m.status,
    tenantStatus: t.status,
    pathUrl: `${players}/e/${t.slug}`,
    subdomainUrl: `https://${t.slug}.${apex}`,
    adminUrl: `${players}/e/${t.slug}/admin?tab=settings&from=host`,
    legacyUserId: m.legacyUserId?.toString() ?? null,
    hostOnboarding: onboarding,
    onboarding: onboardingProgress(onboarding),
  }
}

export async function listMembershipsForAccount(accountId: Types.ObjectId) {
  const rows = await Membership.find({ accountId }).sort({ createdAt: -1 })
  const tenantIds = rows.map((r) => r.tenantId)
  const tenants = await Tenant.find({ _id: { $in: tenantIds } })
  const byId = new Map(tenants.map((t) => [t._id.toString(), t]))

  return rows
    .map((m) => {
      const t = byId.get(m.tenantId.toString())
      if (!t) return null
      return membershipToPublic(m, t)
    })
    .filter(Boolean) as PublicMembership[]
}

async function requireHostMembership(accountId: Types.ObjectId, slug: string) {
  const tenant = await Tenant.findOne({ slug: slug.trim().toLowerCase() })
  if (!tenant) throw new PlatformError('Event not found.')
  const membership = await Membership.findOne({
    tenantId: tenant._id,
    accountId,
  })
  const canHost =
    membership &&
    (membership.isAdmin ||
      membership.role === 'owner' ||
      membership.role === 'admin')
  if (!canHost) throw new PlatformError('You do not manage this event.')
  return { tenant, membership }
}

export async function getEventForHost(accountId: Types.ObjectId, slug: string) {
  const { tenant, membership } = await requireHostMembership(accountId, slug)
  const settings = await SiteSettings.findOne({ tenantId: tenant._id }).setOptions({
    skipTenant: true,
  })
  const discordConfigured = Boolean(
    settings?.discordPrimaryGuildId?.trim() ||
      settings?.discordGuildId?.trim() ||
      (Array.isArray(tenant.discordGuildIds) && tenant.discordGuildIds.length > 0),
  )
  const pub = membershipToPublic(membership, tenant)
  return {
    ...pub,
    discordConfigured,
    platformBotConfigured: Boolean(getPlatformDiscordBotToken()),
  }
}

export async function patchEventOnboarding(
  accountId: Types.ObjectId,
  slug: string,
  patch: Partial<HostOnboarding>,
) {
  const { tenant, membership } = await requireHostMembership(accountId, slug)
  membership.hostOnboarding = mergeHostOnboarding(membership.hostOnboarding, patch)
  membership.markModified('hostOnboarding')
  await membership.save()
  return membershipToPublic(membership, tenant)
}

export async function updateHostEvent(
  accountId: Types.ObjectId,
  slug: string,
  body: { name?: string; status?: 'active' | 'archived' },
) {
  const { tenant, membership } = await requireHostMembership(accountId, slug)
  if (membership.role !== 'owner' && !membership.isAdmin) {
    throw new PlatformError('Only owners/admins can update this event.')
  }

  if (typeof body.name === 'string') {
    const name = body.name.trim()
    if (name.length < 2) throw new PlatformError('Event name is required.')
    tenant.name = name
    if (tenant.config && typeof tenant.config === 'object') {
      const cfg = tenant.config as { event?: { name?: string } }
      tenant.config = {
        ...cfg,
        event: { ...cfg.event, name },
      }
      tenant.markModified('config')
    }
  }

  if (body.status === 'active' || body.status === 'archived') {
    if (tenant.isDefault && body.status === 'archived') {
      throw new PlatformError('The default Book Baddies event cannot be archived.')
    }
    tenant.status = body.status
  }

  await tenant.save()
  clearDefaultTenantCache()
  return membershipToPublic(membership, tenant)
}

export async function inviteCohost(
  accountId: Types.ObjectId,
  slug: string,
  input: { email: string; displayName?: string },
) {
  const { tenant, membership } = await requireHostMembership(accountId, slug)
  if (membership.role !== 'owner') {
    throw new PlatformError('Only the event owner can invite co-hosts.')
  }

  const email = input.email.trim().toLowerCase()
  if (!email.includes('@')) throw new PlatformError('A valid email is required.')
  const displayName =
    (input.displayName ?? '').trim() || email.split('@')[0] || 'Host'

  const account = await ensurePlatformAccount({ email, displayName })

  let user = await User.findOne({
    tenantId: tenant._id,
    email,
  }).setOptions({ skipTenant: true })

  if (!user) {
    user = await User.create({
      displayName,
      email,
      tenantId: tenant._id,
      accountId: account._id,
      isAdmin: true,
      status: 'pending',
    })
  } else {
    user.isAdmin = true
    user.accountId = account._id
    if (displayName) user.displayName = displayName
    await user.save()
  }

  let invitee = await Membership.findOne({
    tenantId: tenant._id,
    accountId: account._id,
  })
  if (!invitee) {
    invitee = await Membership.create({
      tenantId: tenant._id,
      accountId: account._id,
      legacyUserId: user._id,
      displayName,
      isAdmin: true,
      role: 'admin',
      status: 'pending',
      hostOnboarding: { ...DEFAULT_HOST_ONBOARDING },
    })
  } else {
    invitee.isAdmin = true
    if (invitee.role === 'member') invitee.role = 'admin'
    invitee.legacyUserId = user._id
    await invitee.save()
  }

  return {
    email,
    displayName: invitee.displayName,
    role: invitee.role,
  }
}

export async function ensurePlatformAccount(opts: {
  email: string
  displayName: string
  googleId?: string | null
  googleAvatarUrl?: string | null
}) {
  const email = opts.email.trim().toLowerCase()
  let account = await PlatformAccount.findOne({ email })
  if (!account && opts.googleId) {
    account = await PlatformAccount.findOne({ googleId: opts.googleId })
  }
  if (!account) {
    account = await PlatformAccount.create({
      email,
      displayName: opts.displayName.trim() || email.split('@')[0],
      googleId: opts.googleId ?? undefined,
      googleAvatarUrl: opts.googleAvatarUrl ?? undefined,
    })
  } else {
    let dirty = false
    if (opts.googleId && account.googleId !== opts.googleId) {
      account.googleId = opts.googleId
      dirty = true
    }
    if (opts.googleAvatarUrl && account.googleAvatarUrl !== opts.googleAvatarUrl) {
      account.googleAvatarUrl = opts.googleAvatarUrl
      dirty = true
    }
    if (opts.displayName && account.displayName !== opts.displayName) {
      account.displayName = opts.displayName.trim()
      dirty = true
    }
    if (dirty) await account.save()
  }
  return account
}
