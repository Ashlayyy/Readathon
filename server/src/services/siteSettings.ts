import { SiteSettings } from '../db/models/SiteSettings.js'

export type SiteSettingsPublic = {
  showTeamRosters: boolean
  downtimeMode: boolean
}

export type SiteSettingsAdmin = SiteSettingsPublic & {
  discordWebhookUrl: string
  discordRoleId: string
}

type SiteSettingsCached = SiteSettingsAdmin

let cached: SiteSettingsCached = {
  showTeamRosters: false,
  downtimeMode: false,
  discordWebhookUrl: '',
  discordRoleId: '',
}

export function getSiteSettingsSync(): SiteSettingsPublic {
  return { showTeamRosters: cached.showTeamRosters, downtimeMode: cached.downtimeMode }
}

export function getSiteSettingsAdminSync(): SiteSettingsAdmin {
  return { ...cached }
}

export function getDiscordWebhookUrl(): string {
  return cached.discordWebhookUrl.trim()
}

export function getDiscordRoleId(): string {
  return cached.discordRoleId.trim()
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

function isValidDiscordRoleId(roleId: string): boolean {
  if (!roleId) return true
  return /^[0-9]{5,30}$/.test(roleId)
}

export async function refreshSiteSettingsCache(): Promise<SiteSettingsAdmin> {
  let doc = await SiteSettings.findOne()
  if (!doc) {
    doc = await SiteSettings.create({
      showTeamRosters: false,
      downtimeMode: false,
      discordWebhookUrl: '',
      discordRoleId: '',
    })
  }
  cached = {
    showTeamRosters: doc.showTeamRosters,
    downtimeMode: doc.downtimeMode ?? false,
    discordWebhookUrl: doc.discordWebhookUrl ?? '',
    discordRoleId: doc.discordRoleId ?? '',
  }
  return { ...cached }
}

export async function updateSiteSettings(
  patch: Partial<SiteSettingsAdmin>,
): Promise<SiteSettingsAdmin> {
  let doc = await SiteSettings.findOne()
  if (!doc) {
    doc = await SiteSettings.create({
      showTeamRosters: false,
      downtimeMode: false,
      discordWebhookUrl: '',
      discordRoleId: '',
    })
  }
  if (typeof patch.showTeamRosters === 'boolean') {
    doc.showTeamRosters = patch.showTeamRosters
  }
  if (typeof patch.downtimeMode === 'boolean') {
    doc.downtimeMode = patch.downtimeMode
  }
  if (typeof patch.discordWebhookUrl === 'string') {
    const trimmed = patch.discordWebhookUrl.trim()
    if (!isValidDiscordWebhookUrl(trimmed)) {
      throw new Error('Invalid Discord webhook URL')
    }
    doc.discordWebhookUrl = trimmed
  }
  if (typeof patch.discordRoleId === 'string') {
    const trimmed = patch.discordRoleId.trim()
    if (!isValidDiscordRoleId(trimmed)) {
      throw new Error('Invalid Discord role ID')
    }
    doc.discordRoleId = trimmed
  }
  await doc.save()
  cached = {
    showTeamRosters: doc.showTeamRosters,
    downtimeMode: doc.downtimeMode ?? false,
    discordWebhookUrl: doc.discordWebhookUrl ?? '',
    discordRoleId: doc.discordRoleId ?? '',
  }
  return { ...cached }
}
