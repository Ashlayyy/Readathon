import { SiteSettings } from '../db/models/SiteSettings.js'

export type SiteSettingsPublic = {
  showTeamRosters: boolean
}

let cached: SiteSettingsPublic = { showTeamRosters: false }

export function getSiteSettingsSync(): SiteSettingsPublic {
  return cached
}

export async function refreshSiteSettingsCache(): Promise<SiteSettingsPublic> {
  let doc = await SiteSettings.findOne()
  if (!doc) {
    doc = await SiteSettings.create({ showTeamRosters: false })
  }
  cached = { showTeamRosters: doc.showTeamRosters }
  return cached
}

export async function updateSiteSettings(
  patch: Partial<SiteSettingsPublic>,
): Promise<SiteSettingsPublic> {
  let doc = await SiteSettings.findOne()
  if (!doc) {
    doc = await SiteSettings.create({ showTeamRosters: false })
  }
  if (typeof patch.showTeamRosters === 'boolean') {
    doc.showTeamRosters = patch.showTeamRosters
  }
  await doc.save()
  cached = { showTeamRosters: doc.showTeamRosters }
  return cached
}
