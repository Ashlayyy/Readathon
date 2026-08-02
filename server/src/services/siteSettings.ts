import { SiteSettings } from '../db/models/SiteSettings.js'
import {
  DEFAULT_TEAM_CHAT_ADD_TEMPLATES,
  DEFAULT_TEAM_CHAT_SABOTAGE_TEMPLATES,
  normalizeTemplateList,
} from './teamChatMessage.js'
import {
  normalizeMonthlyEvents,
  resolveActiveMonthlyEvent,
  toActiveMonthlyEventPublic,
  validateMonthlyEventsList,
  type ActiveMonthlyEventPublic,
  type MonthlyEventSlot,
} from './monthlyEvents.js'

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
  /** Present only while a scheduled theme is inside its date window. */
  activeMonthlyEvent: ActiveMonthlyEventPublic | null
}

export type DiscordWebhookChannel = 'test' | 'production'

export type SiteSettingsAdmin = SiteSettingsPublic & {
  /** @deprecated Alias of production webhook — kept for older clients. */
  discordWebhookUrl: string
  /** @deprecated Alias of production role — kept for older clients. */
  discordRoleId: string
  discordTestWebhookUrl: string
  discordTestRoleId: string
  discordProductionWebhookUrl: string
  discordProductionRoleId: string
  teamChatHooksEnabled: boolean
  teamChatWebhookUrls: Record<string, string>
  teamChatAddTemplates: string[]
  teamChatSabotageTemplates: string[]
  scheduledPublishEnabled: boolean
  scheduledPublishDay: number
  scheduledPublishHour: number
  scheduledPublishTimezone: string
  /** Staged copy overrides, edited in Admin before going live */
  configDraft: unknown
  /** Live copy overlay merged into getConfig() - promoted from configDraft */
  configOverrides: unknown
  monthlyEvents: MonthlyEventSlot[]
  monthlyWrapOnPublish: boolean
  lastMonthlyWrapMonthKey: string
}

type SiteSettingsCached = SiteSettingsAdmin

const DEFAULTS: SiteSettingsAdmin = {
  showTeamRosters: false,
  downtimeMode: false,
  discordWebhookUrl: '',
  discordRoleId: '',
  discordTestWebhookUrl: '',
  discordTestRoleId: '',
  discordProductionWebhookUrl: '',
  discordProductionRoleId: '',
  teamChatHooksEnabled: false,
  teamChatWebhookUrls: {},
  teamChatAddTemplates: [...DEFAULT_TEAM_CHAT_ADD_TEMPLATES],
  teamChatSabotageTemplates: [...DEFAULT_TEAM_CHAT_SABOTAGE_TEMPLATES],
  scheduledPublishEnabled: false,
  scheduledPublishDay: 1,
  scheduledPublishHour: 9,
  scheduledPublishTimezone: 'Europe/Amsterdam',
  configDraft: null,
  configOverrides: null,
  seasonArchive: null,
  activeMonthlyEvent: null,
  monthlyEvents: [],
  monthlyWrapOnPublish: false,
  lastMonthlyWrapMonthKey: '',
}

let cached: SiteSettingsCached = {
  ...DEFAULTS,
  teamChatWebhookUrls: {},
  teamChatAddTemplates: [...DEFAULT_TEAM_CHAT_ADD_TEMPLATES],
  teamChatSabotageTemplates: [...DEFAULT_TEAM_CHAT_SABOTAGE_TEMPLATES],
  monthlyEvents: [],
}

function resolveActiveFromCache(
  slots: MonthlyEventSlot[],
  now = new Date(),
): ActiveMonthlyEventPublic | null {
  const live = resolveActiveMonthlyEvent(slots, now)
  return live ? toActiveMonthlyEventPublic(live) : null
}

export function getSiteSettingsSync(): SiteSettingsPublic {
  return {
    showTeamRosters: cached.showTeamRosters,
    downtimeMode: cached.downtimeMode,
    seasonArchive: cached.seasonArchive,
    activeMonthlyEvent: resolveActiveFromCache(cached.monthlyEvents),
  }
}

/** Live copy/prompt overlay merged into getConfig() - promoted from configDraft. */
export function getConfigOverridesSync(): unknown {
  return cached.configOverrides
}

export function getMonthlyEventsSync(): MonthlyEventSlot[] {
  return cached.monthlyEvents.map((s) => ({
    ...s,
    multipliers: { ...s.multipliers },
    featuredPromptIds: [...s.featuredPromptIds],
    imageUrl: s.imageUrl ?? '',
    discordTemplates: {
      add: [...(s.discordTemplates?.add ?? [])],
      sabotage: [...(s.discordTemplates?.sabotage ?? [])],
      standings: s.discordTemplates?.standings ?? '',
      breakdown: s.discordTemplates?.breakdown ?? '',
      vibes: s.discordTemplates?.vibes ?? '',
      wrap: s.discordTemplates?.wrap ?? '',
    },
    readerOfMonth: {
      userId: s.readerOfMonth?.userId ?? '',
      shoutout: s.readerOfMonth?.shoutout ?? '',
    },
    siteOverride: {
      event: s.siteOverride.event ? { ...s.siteOverride.event } : undefined,
      copy: s.siteOverride.copy ? { ...s.siteOverride.copy } : undefined,
      branding: s.siteOverride.branding?.theme
        ? { theme: { ...s.siteOverride.branding.theme } }
        : undefined,
    },
  }))
}

/** Currently live scheduled theme (null if draft-only or outside window). */
export function getActiveMonthlyEventSync(now = new Date()): MonthlyEventSlot | null {
  return resolveActiveMonthlyEvent(cached.monthlyEvents, now)
}

export function getSiteSettingsAdminSync(): SiteSettingsAdmin {
  return {
    ...cached,
    teamChatWebhookUrls: { ...cached.teamChatWebhookUrls },
    teamChatAddTemplates: [...cached.teamChatAddTemplates],
    teamChatSabotageTemplates: [...cached.teamChatSabotageTemplates],
    monthlyEvents: getMonthlyEventsSync(),
    activeMonthlyEvent: resolveActiveFromCache(cached.monthlyEvents),
  }
}

/** Production webhook used for real standings publishes. */
export function getDiscordWebhookUrl(): string {
  return (
    cached.discordProductionWebhookUrl.trim() || cached.discordWebhookUrl.trim()
  )
}

/** Production role ping used for real standings publishes. */
export function getDiscordRoleId(): string {
  return cached.discordProductionRoleId.trim() || cached.discordRoleId.trim()
}

export function getDiscordChannelConfig(channel: DiscordWebhookChannel): {
  webhookUrl: string
  roleId: string
} {
  if (channel === 'test') {
    return {
      webhookUrl: cached.discordTestWebhookUrl.trim(),
      roleId: cached.discordTestRoleId.trim(),
    }
  }
  return {
    webhookUrl: getDiscordWebhookUrl(),
    roleId: getDiscordRoleId(),
  }
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

/**
 * Accept bare snowflakes or pasted Discord mention forms like <@&123>.
 * Also pulls the first 17–20 digit snowflake out of messy paste text.
 */
export function normalizeDiscordRoleId(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  const mention = trimmed.match(/^<@&(\d{5,30})>$/)
  if (mention) return mention[1]!
  // User mentions <@123> are not roles — still extract digits so validation can run.
  const userMention = trimmed.match(/^<@!?(\d{5,30})>$/)
  if (userMention) return userMention[1]!
  if (/^\d{5,30}$/.test(trimmed)) return trimmed
  const embedded = trimmed.match(/(\d{17,20})/)
  if (embedded) return embedded[1]!
  return trimmed
}

function toDocFromCache(doc: {
  showTeamRosters: boolean
  downtimeMode?: boolean | null
  discordWebhookUrl?: string | null
  discordRoleId?: string | null
  discordTestWebhookUrl?: string | null
  discordTestRoleId?: string | null
  discordProductionWebhookUrl?: string | null
  discordProductionRoleId?: string | null
  teamChatHooksEnabled?: boolean | null
  teamChatWebhookUrls?: unknown
  teamChatAddTemplates?: unknown
  teamChatSabotageTemplates?: unknown
  scheduledPublishEnabled?: boolean | null
  scheduledPublishDay?: number | null
  scheduledPublishHour?: number | null
  scheduledPublishTimezone?: string | null
  configDraft?: unknown
  configOverrides?: unknown
  seasonArchive?: unknown
  monthlyEvents?: unknown
  monthlyWrapOnPublish?: boolean | null
  lastMonthlyWrapMonthKey?: string | null
}): SiteSettingsAdmin {
  const rawUrls = doc.teamChatWebhookUrls
  const teamChatWebhookUrls =
    rawUrls && typeof rawUrls === 'object' && !Array.isArray(rawUrls)
      ? { ...(rawUrls as Record<string, string>) }
      : {}
  const addTemplates = normalizeTemplateList(doc.teamChatAddTemplates)
  const sabotageTemplates = normalizeTemplateList(doc.teamChatSabotageTemplates)
  const legacyWebhook = doc.discordWebhookUrl ?? ''
  const legacyRole = doc.discordRoleId ?? ''
  const productionWebhook =
    (doc.discordProductionWebhookUrl ?? '').trim() || legacyWebhook
  const productionRole = (doc.discordProductionRoleId ?? '').trim() || legacyRole
  const monthlyEvents = normalizeMonthlyEvents(doc.monthlyEvents)
  return {
    showTeamRosters: doc.showTeamRosters,
    downtimeMode: doc.downtimeMode ?? false,
    discordWebhookUrl: productionWebhook,
    discordRoleId: productionRole,
    discordTestWebhookUrl: doc.discordTestWebhookUrl ?? '',
    discordTestRoleId: doc.discordTestRoleId ?? '',
    discordProductionWebhookUrl: productionWebhook,
    discordProductionRoleId: productionRole,
    teamChatHooksEnabled: doc.teamChatHooksEnabled ?? false,
    teamChatWebhookUrls,
    teamChatAddTemplates:
      addTemplates.length > 0 ? addTemplates : [...DEFAULT_TEAM_CHAT_ADD_TEMPLATES],
    teamChatSabotageTemplates:
      sabotageTemplates.length > 0
        ? sabotageTemplates
        : [...DEFAULT_TEAM_CHAT_SABOTAGE_TEMPLATES],
    scheduledPublishEnabled: doc.scheduledPublishEnabled ?? false,
    scheduledPublishDay: doc.scheduledPublishDay ?? 1,
    scheduledPublishHour: doc.scheduledPublishHour ?? 9,
    scheduledPublishTimezone: doc.scheduledPublishTimezone ?? 'Europe/Amsterdam',
    configDraft: doc.configDraft ?? null,
    configOverrides: doc.configOverrides ?? null,
    seasonArchive: (doc.seasonArchive as SeasonArchive) ?? null,
    monthlyEvents,
    monthlyWrapOnPublish: doc.monthlyWrapOnPublish ?? false,
    lastMonthlyWrapMonthKey: doc.lastMonthlyWrapMonthKey ?? '',
    activeMonthlyEvent: resolveActiveFromCache(monthlyEvents),
  }
}

/**
 * If a template category has zero entries in Mongo, write the built-in five.
 * Categories that already have 1+ templates are left alone.
 */
async function seedEmptyTeamChatTemplates(doc: InstanceType<typeof SiteSettings>): Promise<boolean> {
  let changed = false
  const add = normalizeTemplateList(doc.teamChatAddTemplates)
  const sabotage = normalizeTemplateList(doc.teamChatSabotageTemplates)
  if (add.length === 0) {
    doc.teamChatAddTemplates = [...DEFAULT_TEAM_CHAT_ADD_TEMPLATES]
    changed = true
  }
  if (sabotage.length === 0) {
    doc.teamChatSabotageTemplates = [...DEFAULT_TEAM_CHAT_SABOTAGE_TEMPLATES]
    changed = true
  }
  return changed
}

export async function refreshSiteSettingsCache(): Promise<SiteSettingsAdmin> {
  let doc = await SiteSettings.findOne()
  if (!doc) {
    doc = await SiteSettings.create({
      teamChatAddTemplates: [...DEFAULT_TEAM_CHAT_ADD_TEMPLATES],
      teamChatSabotageTemplates: [...DEFAULT_TEAM_CHAT_SABOTAGE_TEMPLATES],
    })
  } else if (await seedEmptyTeamChatTemplates(doc)) {
    await doc.save()
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
  const applyWebhook = (
    field: 'discordTestWebhookUrl' | 'discordProductionWebhookUrl',
    value: string,
  ) => {
    const trimmed = value.trim()
    if (!isValidDiscordWebhookUrl(trimmed)) {
      throw new Error('Invalid Discord webhook URL')
    }
    doc.set(field, trimmed)
    if (field === 'discordProductionWebhookUrl') {
      doc.set('discordWebhookUrl', trimmed)
    }
  }
  const applyRole = (field: 'discordTestRoleId' | 'discordProductionRoleId', value: string) => {
    const trimmed = normalizeDiscordRoleId(value)
    if (!isValidDiscordRoleId(trimmed)) {
      throw new Error(
        'Invalid Discord role ID — paste the Role ID snowflake (Developer Mode → right‑click role → Copy Role ID), not a user or channel ID.',
      )
    }
    doc.set(field, trimmed)
    if (field === 'discordProductionRoleId') {
      doc.set('discordRoleId', trimmed)
    }
  }

  if (typeof patch.discordTestWebhookUrl === 'string') {
    applyWebhook('discordTestWebhookUrl', patch.discordTestWebhookUrl)
  }
  if (typeof patch.discordTestRoleId === 'string') {
    applyRole('discordTestRoleId', patch.discordTestRoleId)
  }
  if (typeof patch.discordProductionWebhookUrl === 'string') {
    applyWebhook('discordProductionWebhookUrl', patch.discordProductionWebhookUrl)
  } else if (typeof patch.discordWebhookUrl === 'string') {
    applyWebhook('discordProductionWebhookUrl', patch.discordWebhookUrl)
  }
  if (typeof patch.discordProductionRoleId === 'string') {
    applyRole('discordProductionRoleId', patch.discordProductionRoleId)
  } else if (typeof patch.discordRoleId === 'string') {
    applyRole('discordProductionRoleId', patch.discordRoleId)
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
  if (Array.isArray(patch.teamChatAddTemplates)) {
    const list = normalizeTemplateList(patch.teamChatAddTemplates)
    doc.teamChatAddTemplates =
      list.length > 0 ? list : [...DEFAULT_TEAM_CHAT_ADD_TEMPLATES]
  }
  if (Array.isArray(patch.teamChatSabotageTemplates)) {
    const list = normalizeTemplateList(patch.teamChatSabotageTemplates)
    doc.teamChatSabotageTemplates =
      list.length > 0 ? list : [...DEFAULT_TEAM_CHAT_SABOTAGE_TEMPLATES]
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
  if ('monthlyEvents' in patch) {
    const slots = normalizeMonthlyEvents(patch.monthlyEvents)
    const err = validateMonthlyEventsList(slots)
    if (err) throw new Error(err)
    doc.set('monthlyEvents', slots)
  }
  if (typeof patch.monthlyWrapOnPublish === 'boolean') {
    doc.monthlyWrapOnPublish = patch.monthlyWrapOnPublish
  }
  if (typeof patch.lastMonthlyWrapMonthKey === 'string') {
    doc.lastMonthlyWrapMonthKey = patch.lastMonthlyWrapMonthKey.trim()
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
