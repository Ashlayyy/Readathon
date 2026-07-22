import { SiteSettings } from '../db/models/SiteSettings.js'

export type SeasonArchive = {
  slug: string
  title: string
  from: string
  to: string
  message: string
  publishedStandingsIds: string[]
} | null

export type SiteSettingsPublic = {
  showTeamRosters: boolean
  downtimeMode: boolean
  seasonArchive: SeasonArchive
}

export type SiteSettingsAdmin = SiteSettingsPublic & {
  discordWebhookUrl: string
  discordRoleId: string
  teamChatHooksEnabled: boolean
  teamChatWebhookUrls: Record<string, string>
  scheduledPublishEnabled: boolean
  scheduledPublishDay: number
  scheduledPublishHour: number
  scheduledPublishTimezone: string
  /** Staged copy overrides, edited in Admin before going live */
  configDraft: unknown
  /** Live copy overlay merged into getConfig() - promoted from configDraft */
  configOverrides: unknown
}

type SiteSettingsCached = SiteSettingsAdmin

const DEFAULTS: SiteSettingsAdmin = {
  showTeamRosters: false,
  downtimeMode: false,
  discordWebhookUrl: '',
  discordRoleId: '',
  teamChatHooksEnabled: false,
  teamChatWebhookUrls: {},
  scheduledPublishEnabled: false,
  scheduledPublishDay: 1,
  scheduledPublishHour: 9,
  scheduledPublishTimezone: 'Europe/Amsterdam',
  configDraft: null,
  configOverrides: null,
  seasonArchive: null,
}

let cached: SiteSettingsCached = { ...DEFAULTS, teamChatWebhookUrls: {} }

export function getSiteSettingsSync(): SiteSettingsPublic {
  return {
    showTeamRosters: cached.showTeamRosters,
    downtimeMode: cached.downtimeMode,
    seasonArchive: cached.seasonArchive,
  }
}

/** Live copy/prompt overlay merged into getConfig() - promoted from configDraft. */
export function getConfigOverridesSync(): unknown {
  return cached.configOverrides
}

export function getSiteSettingsAdminSync(): SiteSettingsAdmin {
  return { ...cached, teamChatWebhookUrls: { ...cached.teamChatWebhookUrls } }
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

/** Accept bare snowflakes or pasted Discord mention forms like <@&123>. */
export function normalizeDiscordRoleId(raw: string): string {
  const trimmed = raw.trim()
  const mention = trimmed.match(/^<@&(\d{5,30})>$/)
  if (mention) return mention[1]!
  return trimmed
}

function toDocFromCache(doc: {
  showTeamRosters: boolean
  downtimeMode?: boolean | null
  discordWebhookUrl?: string | null
  discordRoleId?: string | null
  teamChatHooksEnabled?: boolean | null
  teamChatWebhookUrls?: unknown
  scheduledPublishEnabled?: boolean | null
  scheduledPublishDay?: number | null
  scheduledPublishHour?: number | null
  scheduledPublishTimezone?: string | null
  configDraft?: unknown
  configOverrides?: unknown
  seasonArchive?: unknown
}): SiteSettingsAdmin {
  const rawUrls = doc.teamChatWebhookUrls
  const teamChatWebhookUrls =
    rawUrls && typeof rawUrls === 'object' && !Array.isArray(rawUrls)
      ? { ...(rawUrls as Record<string, string>) }
      : {}
  return {
    showTeamRosters: doc.showTeamRosters,
    downtimeMode: doc.downtimeMode ?? false,
    discordWebhookUrl: doc.discordWebhookUrl ?? '',
    discordRoleId: doc.discordRoleId ?? '',
    teamChatHooksEnabled: doc.teamChatHooksEnabled ?? false,
    teamChatWebhookUrls,
    scheduledPublishEnabled: doc.scheduledPublishEnabled ?? false,
    scheduledPublishDay: doc.scheduledPublishDay ?? 1,
    scheduledPublishHour: doc.scheduledPublishHour ?? 9,
    scheduledPublishTimezone: doc.scheduledPublishTimezone ?? 'Europe/Amsterdam',
    configDraft: doc.configDraft ?? null,
    configOverrides: doc.configOverrides ?? null,
    seasonArchive: (doc.seasonArchive as SeasonArchive) ?? null,
  }
}

export async function refreshSiteSettingsCache(): Promise<SiteSettingsAdmin> {
  let doc = await SiteSettings.findOne()
  if (!doc) {
    doc = await SiteSettings.create({})
  }
  cached = toDocFromCache(doc)
  return getSiteSettingsAdminSync()
}

export async function updateSiteSettings(
  patch: Partial<SiteSettingsAdmin>,
): Promise<SiteSettingsAdmin> {
  let doc = await SiteSettings.findOne()
  if (!doc) {
    doc = await SiteSettings.create({})
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
    const trimmed = normalizeDiscordRoleId(patch.discordRoleId)
    if (!isValidDiscordRoleId(trimmed)) {
      throw new Error('Invalid Discord role ID')
    }
    doc.discordRoleId = trimmed
  }
  if (typeof patch.teamChatHooksEnabled === 'boolean') {
    doc.teamChatHooksEnabled = patch.teamChatHooksEnabled
  }
  if (patch.teamChatWebhookUrls && typeof patch.teamChatWebhookUrls === 'object') {
    for (const url of Object.values(patch.teamChatWebhookUrls)) {
      if (typeof url === 'string' && !isValidDiscordWebhookUrl(url.trim())) {
        throw new Error('Invalid Discord webhook URL')
      }
    }
    doc.teamChatWebhookUrls = { ...patch.teamChatWebhookUrls }
  }
  if (typeof patch.scheduledPublishEnabled === 'boolean') {
    doc.scheduledPublishEnabled = patch.scheduledPublishEnabled
  }
  if (typeof patch.scheduledPublishDay === 'number') {
    if (patch.scheduledPublishDay < 0 || patch.scheduledPublishDay > 6) {
      throw new Error('scheduledPublishDay must be between 0 and 6')
    }
    doc.scheduledPublishDay = patch.scheduledPublishDay
  }
  if (typeof patch.scheduledPublishHour === 'number') {
    if (patch.scheduledPublishHour < 0 || patch.scheduledPublishHour > 23) {
      throw new Error('scheduledPublishHour must be between 0 and 23')
    }
    doc.scheduledPublishHour = patch.scheduledPublishHour
  }
  if (typeof patch.scheduledPublishTimezone === 'string') {
    doc.scheduledPublishTimezone = patch.scheduledPublishTimezone.trim() || 'Europe/Amsterdam'
  }
  if ('configDraft' in patch) {
    doc.configDraft = patch.configDraft ?? null
  }
  if ('configOverrides' in patch) {
    doc.configOverrides = patch.configOverrides ?? null
  }
  if ('seasonArchive' in patch) {
    doc.seasonArchive = patch.seasonArchive ?? null
  }
  await doc.save()
  cached = toDocFromCache(doc)
  return getSiteSettingsAdminSync()
}

/** Promote the staged configDraft to the live configOverrides overlay. Draft is kept as-is (still editable). */
export async function publishConfigDraft(): Promise<SiteSettingsAdmin> {
  let doc = await SiteSettings.findOne()
  if (!doc) doc = await SiteSettings.create({})
  doc.configOverrides = doc.configDraft ?? null
  await doc.save()
  cached = toDocFromCache(doc)
  return getSiteSettingsAdminSync()
}

/** Clear the staged draft without touching what's live. */
export async function discardConfigDraft(): Promise<SiteSettingsAdmin> {
  let doc = await SiteSettings.findOne()
  if (!doc) doc = await SiteSettings.create({})
  doc.configDraft = null
  await doc.save()
  cached = toDocFromCache(doc)
  return getSiteSettingsAdminSync()
}

/** Remove the live overlay, reverting getConfig() to the static copy. */
export async function clearConfigOverrides(): Promise<SiteSettingsAdmin> {
  let doc = await SiteSettings.findOne()
  if (!doc) doc = await SiteSettings.create({})
  doc.configOverrides = null
  await doc.save()
  cached = toDocFromCache(doc)
  return getSiteSettingsAdminSync()
}
