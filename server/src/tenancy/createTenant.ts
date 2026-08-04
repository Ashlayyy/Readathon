import type { Types } from 'mongoose'
import { Tenant, type ITenant } from '../db/models/Tenant.js'
import { SiteSettings } from '../db/models/SiteSettings.js'
import { Membership } from '../db/models/Membership.js'
import { PlatformAccount } from '../db/models/PlatformAccount.js'
import { User } from '../db/models/User.js'
import { getStaticConfig } from '../config.js'
import { getProductApex } from './context.js'
import { clearDefaultTenantCache } from './resolve.js'

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
    user = await User.create({
      displayName: input.ownerDisplayName,
      email: input.ownerEmail,
      tenantId: tenant._id,
      accountId: input.ownerAccountId,
      isAdmin: true,
      status: 'pending',
    })
  } else {
    user.isAdmin = true
    user.accountId = input.ownerAccountId
    await user.save()
  }

  const membership = await Membership.findOne({
    tenantId: tenant._id,
    accountId: input.ownerAccountId,
  })
  if (!membership) {
    await Membership.create({
      tenantId: tenant._id,
      accountId: input.ownerAccountId,
      legacyUserId: user._id,
      displayName: input.ownerDisplayName,
      isAdmin: true,
      role: 'owner',
      status: 'pending',
    })
  } else {
    membership.role = 'owner'
    membership.isAdmin = true
    membership.legacyUserId = user._id
    await membership.save()
  }

  clearDefaultTenantCache()

  const apex = getProductApex()
  return {
    tenant,
    pathUrl: `https://${apex}/e/${slug}`,
    subdomainUrl: `https://${slug}.${apex}`,
  }
}

export async function listMembershipsForAccount(accountId: Types.ObjectId) {
  const rows = await Membership.find({ accountId }).sort({ createdAt: -1 })
  const tenantIds = rows.map((r) => r.tenantId)
  const tenants = await Tenant.find({ _id: { $in: tenantIds } })
  const byId = new Map(tenants.map((t) => [t._id.toString(), t]))
  const apex = getProductApex()

  return rows
    .map((m) => {
      const t = byId.get(m.tenantId.toString())
      if (!t) return null
      return {
        tenantId: t._id.toString(),
        slug: t.slug,
        name: t.name,
        role: m.role,
        isAdmin: m.isAdmin,
        status: m.status,
        pathUrl: `https://${apex}/e/${t.slug}`,
        subdomainUrl: `https://${t.slug}.${apex}`,
        legacyUserId: m.legacyUserId?.toString() ?? null,
      }
    })
    .filter(Boolean)
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
