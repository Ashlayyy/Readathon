import type { HydratedDocument } from 'mongoose'
import { Membership } from '../db/models/Membership.js'
import { PlatformAccount } from '../db/models/PlatformAccount.js'
import type { IUser } from '../db/models/User.js'
import { getTenantContext } from './context.js'
import { ensureDefaultTenant } from './resolve.js'

type UserDoc = HydratedDocument<IUser>

/**
 * Keep PlatformAccount + Membership in sync with a User (Phase 0 bridge).
 * Safe to call after create/update; idempotent.
 */
export async function ensureUserTenancy(user: UserDoc): Promise<void> {
  const tenant =
    getTenantContext()?.tenant ?? (await ensureDefaultTenant())
  const tenantId = tenant._id

  let accountId = (user as { accountId?: typeof tenantId | null }).accountId
  if (!accountId) {
    let account = await PlatformAccount.findOne({ email: user.email })
    if (!account) {
      account = await PlatformAccount.create({
        email: user.email,
        displayName: user.displayName,
        googleId: user.googleId ?? undefined,
        avatarUrl: user.avatarUrl,
        googleAvatarUrl: user.googleAvatarUrl,
      })
    } else {
      let dirty = false
      if (user.googleId && account.googleId !== user.googleId) {
        account.googleId = user.googleId
        dirty = true
      }
      if (
        user.googleAvatarUrl &&
        account.googleAvatarUrl !== user.googleAvatarUrl
      ) {
        account.googleAvatarUrl = user.googleAvatarUrl
        dirty = true
      }
      if (dirty) await account.save()
    }
    accountId = account._id
    user.set('accountId', accountId)
    user.set('tenantId', tenantId)
    await user.save()
  } else if (!(user as { tenantId?: unknown }).tenantId) {
    user.set('tenantId', tenantId)
    await user.save()
  }

  const existing = await Membership.findOne({ tenantId, accountId })
  if (!existing) {
    await Membership.create({
      tenantId,
      accountId,
      legacyUserId: user._id,
      displayName: user.displayName,
      teamId: user.teamId,
      isAdmin: user.isAdmin,
      status: user.status,
      role: user.isAdmin ? 'admin' : 'member',
      notifyStandings: user.notifyStandings,
      notifyAnswers: user.notifyAnswers,
      preferEventThemes: user.preferEventThemes !== false,
      currentlyReadingTitle: user.currentlyReadingTitle,
      currentlyReadingAuthor: user.currentlyReadingAuthor,
      currentlyReadingCoverUrl: user.currentlyReadingCoverUrl,
      currentlyReadingUpdatedAt: user.currentlyReadingUpdatedAt,
      avatarUrl: user.avatarUrl,
      googleAvatarUrl: user.googleAvatarUrl,
    })
    return
  }

  // Mirror key fields from User → Membership (User remains source of truth in Phase 0)
  let dirty = false
  const fields: Array<[keyof typeof existing, unknown]> = [
    ['displayName', user.displayName],
    ['teamId', user.teamId],
    ['isAdmin', user.isAdmin],
    ['status', user.status],
    ['notifyStandings', user.notifyStandings],
    ['notifyAnswers', user.notifyAnswers],
    ['preferEventThemes', user.preferEventThemes !== false],
    ['currentlyReadingTitle', user.currentlyReadingTitle],
    ['currentlyReadingAuthor', user.currentlyReadingAuthor],
    ['currentlyReadingCoverUrl', user.currentlyReadingCoverUrl],
    ['currentlyReadingUpdatedAt', user.currentlyReadingUpdatedAt],
    ['avatarUrl', user.avatarUrl],
    ['googleAvatarUrl', user.googleAvatarUrl],
    ['legacyUserId', user._id],
  ]
  for (const [key, value] of fields) {
    if (existing.get(key as string) !== value) {
      existing.set(key as string, value)
      dirty = true
    }
  }
  if (user.isAdmin && existing.role === 'member') {
    existing.role = 'admin'
    dirty = true
  }
  if (dirty) await existing.save()
}
