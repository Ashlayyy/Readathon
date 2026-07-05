import { SiteSettings } from '../db/models/SiteSettings.js'

export type SiteSettingsPublic = {
  showTeamRosters: boolean
}

export type SiteSettingsAdmin = SiteSettingsPublic & {
  discordWebhookUrl: string
}

type SiteSettingsCached = SiteSettingsAdmin

let cached: SiteSettingsCached = { showTeamRosters: false, discordWebhookUrl: '' }

export function getSiteSettingsSync(): SiteSettingsPublic {
  return { showTeamRosters: cached.showTeamRosters }
}

export function getSiteSettingsAdminSync(): SiteSettingsAdmin {
  return { ...cached }
}

export function getDiscordWebhookUrl(): string {
  return cached.discordWebhookUrl.trim()
}

function isValidDiscordWebhookUrl(url: string): boolean {
  if (!url) return true
  try {
    const parsed = new URL(url)
    return (
      parsed.protocol === 'https:' &&
      (parsed.hostname === 'discord.com' || parsed.hostname === 'discordapp.com') &&
      parsed.pathname.startsWith('/api/webhooks/')
    )
  } catch {
    return false
  }
}

export async function refreshSiteSettingsCache(): Promise<SiteSettingsAdmin> {
  let doc = await SiteSettings.findOne()
  if (!doc) {
    doc = await SiteSettings.create({ showTeamRosters: false, discordWebhookUrl: '' })
  }
  cached = {
    showTeamRosters: doc.showTeamRosters,
    discordWebhookUrl: doc.discordWebhookUrl ?? '',
  }
  return { ...cached }
}

export async function updateSiteSettings(
  patch: Partial<SiteSettingsAdmin>,
): Promise<SiteSettingsAdmin> {
  let doc = await SiteSettings.findOne()
  if (!doc) {
    doc = await SiteSettings.create({ showTeamRosters: false, discordWebhookUrl: '' })
  }
  if (typeof patch.showTeamRosters === 'boolean') {
    doc.showTeamRosters = patch.showTeamRosters
  }
  if (typeof patch.discordWebhookUrl === 'string') {
    const trimmed = patch.discordWebhookUrl.trim()
    if (!isValidDiscordWebhookUrl(trimmed)) {
      throw new Error('Invalid Discord webhook URL')
    }
    doc.discordWebhookUrl = trimmed
  }
  await doc.save()
  cached = {
    showTeamRosters: doc.showTeamRosters,
    discordWebhookUrl: doc.discordWebhookUrl ?? '',
  }
  return { ...cached }
}
