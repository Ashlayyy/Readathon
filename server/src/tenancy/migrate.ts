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
import { ensureUserTenancy } from './ensureUserTenancy.js'
import { ensureDefaultTenant } from './resolve.js'

async function stampCollection(
  model: mongoose.Model<unknown>,
  tenantId: mongoose.Types.ObjectId,
  label: string,
): Promise<number> {
  const res = await model.updateMany(
    { $or: [{ tenantId: null }, { tenantId: { $exists: false } }] },
    { $set: { tenantId } },
  )
  const n = res.modifiedCount ?? 0
  if (n) console.log(`[tenancy] Stamped ${n} ${label} with default tenant`)
  return n
}

async function dropLegacyUniqueIndexes(): Promise<void> {
  const drops: Array<[mongoose.Model<unknown>, string]> = [
    [User as mongoose.Model<unknown>, 'email_1'],
    [Prompt as mongoose.Model<unknown>, 'promptId_1'],
    [TeamAssignmentSet as mongoose.Model<unknown>, 'slot_1'],
  ]
  for (const [model, indexName] of drops) {
    try {
      await model.collection.dropIndex(indexName)
      console.log(`[tenancy] Dropped legacy index ${model.modelName}.${indexName}`)
    } catch {
      /* index may not exist */
    }
  }
}

/**
 * Idempotent boot migration for all tenancy phases:
 * seed default tenant, stamp domain docs, link Users → Account+Membership,
 * drop legacy global unique indexes.
 */
export async function runTenancyMigration(): Promise<void> {
  const tenant = await ensureDefaultTenant()
  const tenantId = tenant._id

  await dropLegacyUniqueIndexes()

  const settings = await SiteSettings.findOne()
  if (settings && !(settings as { tenantId?: unknown }).tenantId) {
    settings.set('tenantId', tenantId)
    await settings.save()
    console.log('[tenancy] Linked SiteSettings to default tenant')
  }

  await Promise.all([
    stampCollection(Submission as mongoose.Model<unknown>, tenantId, 'submissions'),
    stampCollection(Prompt as mongoose.Model<unknown>, tenantId, 'prompts'),
    stampCollection(Question as mongoose.Model<unknown>, tenantId, 'questions'),
    stampCollection(PublishedStandings as mongoose.Model<unknown>, tenantId, 'publishedStandings'),
    stampCollection(StandingsEvent as mongoose.Model<unknown>, tenantId, 'standingsEvents'),
    stampCollection(TeamAssignmentSet as mongoose.Model<unknown>, tenantId, 'teamAssignmentSets'),
    stampCollection(AuditLog as mongoose.Model<unknown>, tenantId, 'auditLogs'),
    stampCollection(AuthToken as mongoose.Model<unknown>, tenantId, 'authTokens'),
    stampCollection(User as mongoose.Model<unknown>, tenantId, 'users'),
  ])

  const users = await User.find({})
  let linked = 0
  for (const user of users) {
    const hadAccount = Boolean((user as { accountId?: unknown }).accountId)
    await ensureUserTenancy(user)
    if (!hadAccount) linked++
  }

  if (linked) {
    console.log(`[tenancy] Linked ${linked} users to PlatformAccount + Membership`)
  }
}
