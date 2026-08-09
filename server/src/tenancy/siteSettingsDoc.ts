import type { Types } from 'mongoose'
import { SiteSettings } from '../db/models/SiteSettings.js'
import { getTenantContext } from './context.js'
import { ensureDefaultTenant } from './resolve.js'

async function resolveSettingsTenantId(): Promise<Types.ObjectId | null> {
  const fromCtx = getTenantContext()?.tenant?._id
  if (fromCtx) return fromCtx
  try {
    return (await ensureDefaultTenant())._id
  } catch {
    return null
  }
}

/** Load SiteSettings for the active tenant, falling back to the legacy unscoped doc. */
export async function findSiteSettingsDoc() {
  const tenantId = await resolveSettingsTenantId()
  if (tenantId) {
    const byTenant = await SiteSettings.findOne({ tenantId })
    if (byTenant) return byTenant
  }
  return SiteSettings.findOne()
}

/** Find or create settings, stamping tenantId when known. */
export async function getOrCreateSiteSettingsDoc(
  seed: Record<string, unknown> = {},
) {
  let doc = await findSiteSettingsDoc()
  const tenantId = await resolveSettingsTenantId()

  if (doc) {
    if (tenantId && !(doc as { tenantId?: Types.ObjectId | null }).tenantId) {
      doc.set('tenantId', tenantId)
      await doc.save()
    }
    return doc
  }

  return SiteSettings.create({
    ...seed,
    ...(tenantId ? { tenantId } : {}),
  })
}
