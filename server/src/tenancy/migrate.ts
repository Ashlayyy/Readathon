import mongoose from 'mongoose'
import { User } from '../db/models/User.js'
import { SiteSettings } from '../db/models/SiteSettings.js'
import { Submission } from '../db/models/Submission.js'
import { Prompt } from '../db/models/Prompt.js'
import { Question } from '../db/models/Question.js'
import { PublishedStandings } from '../db/models/PublishedStandings.js'
import { StandingsEvent } from '../db/models/StandingsEvent.js'
import { TeamAssignmentSet } from '../db/models/TeamAssignmentSet.js'
import { AuditLog } from '../db/models/AuditLog.js'
import { AuthToken } from '../db/models/AuthToken.js'
import { Tenant } from '../db/models/Tenant.js'
import { PlatformAccount } from '../db/models/PlatformAccount.js'
import { Membership } from '../db/models/Membership.js'
import { runWithTenantContext } from './context.js'
import { ensureUserTenancy } from './ensureUserTenancy.js'
import { ensureDefaultTenant } from './resolve.js'

export type TenancyMigrateMode = 'auto' | 'force' | 'off'

export type TenancyMigrateReport = {
  mode: TenancyMigrateMode
  ran: boolean
  skippedReason?: string
  needed: boolean
  defaultTenantId: string | null
  defaultTenantSlug: string | null
  stamped: Record<string, number>
  accountsLinked: number
  indexesDropped: string[]
  indexesSynced: string[]
  durationMs: number
}

const SKIP = { skipTenant: true } as const

/** How boot / CLI / admin should treat tenancy migration. */
export function getTenancyMigrateMode(
  override?: string | null,
): TenancyMigrateMode {
  const raw = (override ?? process.env.TENANCY_MIGRATE ?? 'auto')
    .trim()
    .toLowerCase()
  if (raw === 'off' || raw === '0' || raw === 'false' || raw === 'never') {
    return 'off'
  }
  if (raw === 'force' || raw === 'always' || raw === '1' || raw === 'true') {
    return 'force'
  }
  return 'auto'
}

type AnyModel = mongoose.Model<mongoose.Document>

const UNTENANTED = {
  $or: [{ tenantId: null }, { tenantId: { $exists: false } }],
}

async function countUntenanted(model: AnyModel): Promise<number> {
  return model.countDocuments(UNTENANTED as never).setOptions(SKIP)
}

async function collectionHasIndex(
  model: AnyModel,
  indexName: string,
): Promise<boolean> {
  try {
    const indexes = await model.collection.indexes()
    return indexes.some((idx) => idx.name === indexName)
  } catch {
    return false
  }
}

/** Legacy global uniques that block multi-tenant emails / prompts. */
async function legacyIndexesStillPresent(): Promise<boolean> {
  if (await collectionHasIndex(User as unknown as AnyModel, 'email_1')) return true
  if (await collectionHasIndex(Prompt as unknown as AnyModel, 'promptId_1')) {
    return true
  }
  if (
    await collectionHasIndex(TeamAssignmentSet as unknown as AnyModel, 'slot_1')
  ) {
    return true
  }
  return false
}

/** True when the DB still needs the multi-tenant backfill. */
export async function tenancyMigrationNeeded(): Promise<boolean> {
  const defaultTenant = await Tenant.findOne({ isDefault: true })
  if (!defaultTenant) return true

  const settings = await SiteSettings.findOne().setOptions(SKIP)
  if (settings && !(settings as { tenantId?: unknown }).tenantId) return true

  const unlinkedUsers = await User.countDocuments({
    $or: [{ accountId: null }, { accountId: { $exists: false } }],
  }).setOptions(SKIP)
  if (unlinkedUsers > 0) return true

  for (const model of [
    Submission,
    Prompt,
    Question,
    PublishedStandings,
    User,
  ] as unknown as AnyModel[]) {
    if ((await countUntenanted(model)) > 0) return true
  }

  // Index-only leftovers: stamped DB can still block create-event via email_1.
  if (await legacyIndexesStillPresent()) return true

  return false
}

async function stampCollection(
  model: AnyModel,
  tenantId: mongoose.Types.ObjectId,
  label: string,
): Promise<number> {
  const res = await model
    .updateMany(UNTENANTED as never, { $set: { tenantId } })
    .setOptions(SKIP)
  const n = res.modifiedCount ?? 0
  if (n) console.log(`[tenancy] Stamped ${n} ${label} with default tenant`)
  return n
}

async function dropLegacyUniqueIndexes(): Promise<string[]> {
  const named: Array<[AnyModel, string]> = [
    [User as unknown as AnyModel, 'email_1'],
    [Prompt as unknown as AnyModel, 'promptId_1'],
    [TeamAssignmentSet as unknown as AnyModel, 'slot_1'],
  ]
  const dropped: string[] = []
  for (const [model, indexName] of named) {
    try {
      await model.collection.dropIndex(indexName)
      const key = `${model.modelName}.${indexName}`
      dropped.push(key)
      console.log(`[tenancy] Dropped legacy index ${key}`)
    } catch {
      /* index may not exist under that name */
    }
  }

  // Also drop by key shape (Atlas / older mongoose may use different names).
  const byKey: Array<[AnyModel, string]> = [
    [User as unknown as AnyModel, 'email'],
    [Prompt as unknown as AnyModel, 'promptId'],
    [TeamAssignmentSet as unknown as AnyModel, 'slot'],
  ]
  for (const [model, field] of byKey) {
    try {
      const indexes = await model.collection.indexes()
      for (const idx of indexes) {
        const key = idx.key as Record<string, number>
        if (
          idx.unique &&
          idx.name &&
          idx.name !== '_id_' &&
          Object.keys(key).length === 1 &&
          key[field] === 1
        ) {
          await model.collection.dropIndex(idx.name)
          const label = `${model.modelName}.${idx.name}`
          if (!dropped.includes(label)) {
            dropped.push(label)
            console.log(`[tenancy] Dropped legacy index ${label}`)
          }
        }
      }
    } catch {
      /* ignore */
    }
  }
  return dropped
}

async function syncTenantIndexes(): Promise<string[]> {
  const models = [
    Tenant,
    PlatformAccount,
    Membership,
    User,
    SiteSettings,
    Submission,
    Prompt,
    Question,
    PublishedStandings,
    StandingsEvent,
    TeamAssignmentSet,
    AuditLog,
    AuthToken,
  ]
  const synced: string[] = []
  for (const model of models) {
    try {
      await model.syncIndexes()
      synced.push(model.modelName)
    } catch (e) {
      console.warn(
        `[tenancy] syncIndexes failed for ${model.modelName}:`,
        e instanceof Error ? e.message : e,
      )
    }
  }
  if (synced.length) {
    console.log(`[tenancy] Synced indexes for: ${synced.join(', ')}`)
  }
  return synced
}

export type RunTenancyMigrationOptions = {
  /** Override TENANCY_MIGRATE env for this call. */
  mode?: TenancyMigrateMode
  /** When true, run even if mode is auto and nothing looks pending. */
  force?: boolean
}

/**
 * Idempotent multi-tenant backfill — no manual Mongo work required.
 *
 * - `auto` (default): run when the DB still needs it; otherwise no-op
 * - `force`: always run (stamp + link + indexes)
 * - `off`: only ensure the default tenant exists (minimal boot)
 */
export async function runTenancyMigration(
  opts: RunTenancyMigrationOptions = {},
): Promise<TenancyMigrateReport> {
  const started = Date.now()
  const mode = opts.force ? 'force' : (opts.mode ?? getTenancyMigrateMode())
  const needed = await tenancyMigrationNeeded()

  const empty: TenancyMigrateReport = {
    mode,
    ran: false,
    needed,
    defaultTenantId: null,
    defaultTenantSlug: null,
    stamped: {},
    accountsLinked: 0,
    indexesDropped: [],
    indexesSynced: [],
    durationMs: 0,
  }

  if (mode === 'off' && !opts.force) {
    const tenant = await ensureDefaultTenant()
    return {
      ...empty,
      skippedReason: 'TENANCY_MIGRATE=off',
      defaultTenantId: tenant._id.toString(),
      defaultTenantSlug: tenant.slug,
      durationMs: Date.now() - started,
    }
  }

  if (mode === 'auto' && !needed && !opts.force) {
    const tenant = await ensureDefaultTenant()
    // Still scrub legacy indexes — cheap, idempotent, and required so the same
    // host email can own multiple events (compound tenantId+email uniqueness).
    const indexesDropped = await dropLegacyUniqueIndexes()
    if (indexesDropped.length) {
      await syncTenantIndexes()
      console.log(
        `[tenancy] Dropped leftover legacy indexes: ${indexesDropped.join(', ')}`,
      )
    } else {
      console.log(
        `[tenancy] Migration not needed (default tenant "${tenant.slug}" ready)`,
      )
    }
    return {
      ...empty,
      ran: indexesDropped.length > 0,
      skippedReason: indexesDropped.length ? undefined : 'already_migrated',
      defaultTenantId: tenant._id.toString(),
      defaultTenantSlug: tenant.slug,
      indexesDropped,
      durationMs: Date.now() - started,
    }
  }

  console.log(
    `[tenancy] Running migration (mode=${mode}${needed ? ', pending work detected' : ''})…`,
  )

  const tenant = await ensureDefaultTenant()
  const tenantId = tenant._id
  const indexesDropped = await dropLegacyUniqueIndexes()
  const indexesSynced = await syncTenantIndexes()

  const settings = await SiteSettings.findOne().setOptions(SKIP)
  if (settings && !(settings as { tenantId?: unknown }).tenantId) {
    settings.set('tenantId', tenantId)
    await settings.save()
    console.log('[tenancy] Linked SiteSettings to default tenant')
  }

  const stampedEntries = await Promise.all(
    (
      [
        [Submission, 'submissions'],
        [Prompt, 'prompts'],
        [Question, 'questions'],
        [PublishedStandings, 'publishedStandings'],
        [StandingsEvent, 'standingsEvents'],
        [TeamAssignmentSet, 'teamAssignmentSets'],
        [AuditLog, 'auditLogs'],
        [AuthToken, 'authTokens'],
        [User, 'users'],
      ] as const
    ).map(async ([model, label]) => {
      const n = await stampCollection(model as unknown as AnyModel, tenantId, label)
      return [label, n] as const
    }),
  )
  const stamped = Object.fromEntries(stampedEntries)

  // Link under default-tenant ALS so admin-triggered runs never attach
  // legacy users to a non-default host context.
  const accountsLinked = await runWithTenantContext(
    {
      tenant,
      isMarketingHost: false,
      resolution: 'default',
      slug: tenant.slug,
    },
    async () => {
      const users = await User.find({}).setOptions(SKIP)
      let linked = 0
      for (const user of users) {
        const hadAccount = Boolean((user as { accountId?: unknown }).accountId)
        await ensureUserTenancy(user)
        if (!hadAccount) linked++
      }
      return linked
    },
  )

  if (accountsLinked) {
    console.log(
      `[tenancy] Linked ${accountsLinked} users to PlatformAccount + Membership`,
    )
  }

  const report: TenancyMigrateReport = {
    mode,
    ran: true,
    needed,
    defaultTenantId: tenantId.toString(),
    defaultTenantSlug: tenant.slug,
    stamped,
    accountsLinked,
    indexesDropped,
    indexesSynced,
    durationMs: Date.now() - started,
  }

  console.log(
    `[tenancy] Migration finished in ${report.durationMs}ms (tenant=${tenant.slug})`,
  )
  return report
}

/** Lightweight status for Admin / health. */
export async function getTenancyMigrationStatus(): Promise<{
  mode: TenancyMigrateMode
  needed: boolean
  defaultTenant: { id: string; slug: string; name: string } | null
  unlinkedUsers: number
  untenantedSubmissions: number
}> {
  const mode = getTenancyMigrateMode()
  const needed = await tenancyMigrationNeeded()
  const tenant = await Tenant.findOne({ isDefault: true })
  const unlinkedUsers = await User.countDocuments({
    $or: [{ accountId: null }, { accountId: { $exists: false } }],
  }).setOptions(SKIP)
  const untenantedSubmissions = await countUntenanted(
    Submission as unknown as AnyModel,
  )
  return {
    mode,
    needed,
    defaultTenant: tenant
      ? {
          id: tenant._id.toString(),
          slug: tenant.slug,
          name: tenant.name,
        }
      : null,
    unlinkedUsers,
    untenantedSubmissions,
  }
}
