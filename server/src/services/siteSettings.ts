import { SiteSettings } from '../db/models/SiteSettings.js'
import {
  decryptSecret,
  encryptSecret,
} from '../lib/secretsCrypto.js'
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
import {
  cloneGuildConfigs,
  emptyGuildConfig,
  flatFieldsFromGuild,
  guildConfigFromLegacyFlat,
  normalizeGuildConfigsMap,
  normalizeRoleIdList,
  normalizeSnowflakeMap,
  type DiscordGuildConfig,
} from './discordGuildConfig.js'
import type { DiscordDeliveryMode } from './siteSettingsTypes.js'

export type DiscordBotGuildCacheEntry = { id: string; name: string }
export type DiscordBotGuildsCache = {
  guilds: DiscordBotGuildCacheEntry[]
  fetchedAt: string
  /** Fingerprint of the bot token blob used when this list was fetched */
  tokenKey: string
}

export type { DiscordDeliveryMode, DiscordGuildConfig }

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
  /** @deprecated Prefer discordTestDeliveryMode / discordProductionDeliveryMode */
  discordDeliveryMode: DiscordDeliveryMode
  discordTestDeliveryMode: DiscordDeliveryMode
  discordProductionDeliveryMode: DiscordDeliveryMode
  /** True when an encrypted bot token is stored (plaintext never returned). */
  discordBotTokenConfigured: boolean
  /** Primary guild for auto-publish / realm chat. Flat fields project this guild. */
  discordPrimaryGuildId: string
  /** Per-server Discord destinations & roles */
  discordGuildConfigs: Record<string, DiscordGuildConfig>
  /** @deprecated Alias of primary guild id */
  discordGuildId: string
  discordTestChannelId: string
  discordProductionChannelId: string
  discordBotCommandRoleIds: string[]
  teamChatHooksEnabled: boolean
  teamChatWebhookUrls: Record<string, string>
  teamChatChannelIds: Record<string, string>
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
  /** Last known Discord servers for the configured bot (Admin pickers). */
  discordBotGuildsCache: DiscordBotGuildsCache | null
}

/** Patch body may include write-only bot token (never echoed back). */
export type SiteSettingsAdminPatch = Partial<SiteSettingsAdmin> & {
  discordBotToken?: string
  clearDiscordBotToken?: boolean
}

type SiteSettingsCached = SiteSettingsAdmin & {
  /** Encrypted blob kept server-side only */
  discordBotTokenEnc: string
}

const DEFAULTS: SiteSettingsCached = {
  showTeamRosters: false,
  downtimeMode: false,
  discordWebhookUrl: '',
  discordRoleId: '',
  discordTestWebhookUrl: '',
  discordTestRoleId: '',
  discordProductionWebhookUrl: '',
  discordProductionRoleId: '',
  discordDeliveryMode: 'webhook',
  discordTestDeliveryMode: 'webhook',
  discordProductionDeliveryMode: 'webhook',
  discordBotTokenConfigured: false,
  discordBotTokenEnc: '',
  discordPrimaryGuildId: '',
  discordGuildConfigs: {},
  discordGuildId: '',
  discordTestChannelId: '',
  discordProductionChannelId: '',
  discordBotCommandRoleIds: [],
  teamChatHooksEnabled: false,
  teamChatWebhookUrls: {},
  teamChatChannelIds: {},
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
  discordBotGuildsCache: null,
}

let cached: SiteSettingsCached = {
  ...DEFAULTS,
  teamChatWebhookUrls: {},
  teamChatChannelIds: {},
  discordBotCommandRoleIds: [],
  discordGuildConfigs: {},
  teamChatAddTemplates: [...DEFAULT_TEAM_CHAT_ADD_TEMPLATES],
  teamChatSabotageTemplates: [...DEFAULT_TEAM_CHAT_SABOTAGE_TEMPLATES],
  monthlyEvents: [],
}

type DiscordBotRestartHook = () => void
let discordBotRestartHook: DiscordBotRestartHook | null = null

/** Register a callback when bot credentials / guild / command roles change. */
export function onDiscordBotSettingsChanged(hook: DiscordBotRestartHook): void {
  discordBotRestartHook = hook
}

function notifyDiscordBotSettingsChanged(): void {
  try {
    discordBotRestartHook?.()
  } catch (e) {
    console.error('[discord] bot settings change hook failed:', e)
  }
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
  const { discordBotTokenEnc: _enc, ...safe } = cached
  return {
    ...safe,
    discordBotTokenConfigured: Boolean(cached.discordBotTokenEnc.trim()),
    discordPrimaryGuildId: cached.discordPrimaryGuildId,
    discordGuildConfigs: cloneGuildConfigs(cached.discordGuildConfigs),
    discordBotGuildsCache: cached.discordBotGuildsCache
      ? {
          guilds: cached.discordBotGuildsCache.guilds.map((g) => ({
            id: g.id,
            name: g.name,
          })),
          fetchedAt: cached.discordBotGuildsCache.fetchedAt,
          tokenKey: cached.discordBotGuildsCache.tokenKey,
        }
      : null,
    teamChatWebhookUrls: { ...cached.teamChatWebhookUrls },
    teamChatChannelIds: { ...cached.teamChatChannelIds },
    discordBotCommandRoleIds: [...cached.discordBotCommandRoleIds],
    teamChatAddTemplates: [...cached.teamChatAddTemplates],
    teamChatSabotageTemplates: [...cached.teamChatSabotageTemplates],
    monthlyEvents: getMonthlyEventsSync(),
    activeMonthlyEvent: resolveActiveFromCache(cached.monthlyEvents),
  }
}

/** Stable fingerprint of the stored token (not the raw secret). */
export function getDiscordBotTokenEncFingerprint(): string {
  const enc = cached.discordBotTokenEnc.trim()
  if (enc) return `enc:${enc.length}:${enc.slice(0, 24)}:${enc.slice(-12)}`
  // Env-only fallback token — mark distinctly so cache invalidates if DB token appears
  return getDiscordBotToken() ? 'env:fallback' : 'none'
}

export function getDiscordBotGuildsCache(): DiscordBotGuildsCache | null {
  const c = cached.discordBotGuildsCache
  if (!c?.guilds?.length) return null
  return {
    guilds: c.guilds.map((g) => ({ id: g.id, name: g.name })),
    fetchedAt: c.fetchedAt,
    tokenKey: c.tokenKey,
  }
}

function normalizeBotGuildsCache(raw: unknown): DiscordBotGuildsCache | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const guildsRaw = Array.isArray(o.guilds) ? o.guilds : []
  const guilds: DiscordBotGuildCacheEntry[] = []
  for (const row of guildsRaw) {
    if (!row || typeof row !== 'object') continue
    const id = String((row as { id?: unknown }).id ?? '').trim()
    const name = String((row as { name?: unknown }).name ?? '').trim()
    if (!/^\d{5,30}$/.test(id)) continue
    guilds.push({ id, name: name || id })
  }
  if (!guilds.length) return null
  const fetchedAt =
    typeof o.fetchedAt === 'string' && o.fetchedAt.trim()
      ? o.fetchedAt.trim()
      : new Date(0).toISOString()
  const tokenKey =
    typeof o.tokenKey === 'string' && o.tokenKey.trim() ? o.tokenKey.trim() : ''
  return { guilds, fetchedAt, tokenKey }
}

export async function setDiscordBotGuildsCache(
  next: DiscordBotGuildsCache,
): Promise<void> {
  const normalized = normalizeBotGuildsCache(next)
  if (!normalized) return
  let doc = await SiteSettings.findOne()
  if (!doc) doc = await SiteSettings.create({})
  doc.set('discordBotGuildsCache', normalized)
  // Also stamp names onto known guild configs for offline display
  const configs = normalizeGuildConfigsMap(doc.get('discordGuildConfigs'))
  let configsChanged = false
  for (const g of normalized.guilds) {
    if (configs[g.id] && g.name && configs[g.id].name !== g.name) {
      configs[g.id] = { ...configs[g.id], name: g.name }
      configsChanged = true
    }
  }
  if (configsChanged) doc.set('discordGuildConfigs', configs)
  await doc.save()
  cached = toDocFromCache(doc)
}

export async function clearDiscordBotGuildsCache(): Promise<void> {
  let doc = await SiteSettings.findOne()
  if (!doc) return
  doc.set('discordBotGuildsCache', null)
  await doc.save()
  cached = toDocFromCache(doc)
}

/** Decrypted bot token from DB, with optional env fallback for migration. */
export function getDiscordBotToken(): string {
  const enc = cached.discordBotTokenEnc.trim()
  if (enc) {
    try {
      return decryptSecret(enc)
    } catch (e) {
      console.error('[discord] failed to decrypt bot token:', e)
      return ''
    }
  }
  return process.env.DISCORD_BOT_TOKEN?.trim() || ''
}

export function getDiscordGuildConfigs(): Record<string, DiscordGuildConfig> {
  return cloneGuildConfigs(cached.discordGuildConfigs)
}

export function getDiscordPrimaryGuildId(): string {
  return (
    cached.discordPrimaryGuildId.trim() ||
    cached.discordGuildId.trim() ||
    process.env.DISCORD_GUILD_ID?.trim() ||
    ''
  )
}

export function resolveDiscordGuildConfig(
  guildId?: string | null,
): DiscordGuildConfig | null {
  const id = (guildId ?? '').trim() || getDiscordPrimaryGuildId()
  if (!id) return null
  return cached.discordGuildConfigs[id] ?? null
}

export function getDiscordDeliveryMode(
  channel: DiscordWebhookChannel = 'production',
  guildId?: string | null,
): DiscordDeliveryMode {
  const cfg = resolveDiscordGuildConfig(guildId)
  if (!cfg) {
    if (channel === 'test') {
      return cached.discordTestDeliveryMode === 'bot' ? 'bot' : 'webhook'
    }
    return cached.discordProductionDeliveryMode === 'bot' ? 'bot' : 'webhook'
  }
  return channel === 'test' ? cfg.testDeliveryMode : cfg.productionDeliveryMode
}

/** @deprecated Prefer getDiscordDeliveryMode('production') */
export function getDiscordProductionDeliveryMode(): DiscordDeliveryMode {
  return getDiscordDeliveryMode('production')
}

export function getDiscordGuildId(): string {
  return getDiscordPrimaryGuildId()
}

export function getDiscordBotCommandRoleIds(guildId?: string | null): string[] {
  const cfg = resolveDiscordGuildConfig(guildId)
  if (cfg) return [...cfg.botCommandRoleIds]
  return [...cached.discordBotCommandRoleIds]
}

/** Production webhook used for real standings publishes. */
export function getDiscordWebhookUrl(guildId?: string | null): string {
  const cfg = resolveDiscordGuildConfig(guildId)
  if (cfg) return cfg.productionWebhookUrl.trim()
  return (
    cached.discordProductionWebhookUrl.trim() || cached.discordWebhookUrl.trim()
  )
}

/** Production role ping used for real standings publishes. */
export function getDiscordRoleId(guildId?: string | null): string {
  const cfg = resolveDiscordGuildConfig(guildId)
  if (cfg) return cfg.productionRoleId.trim()
  return cached.discordProductionRoleId.trim() || cached.discordRoleId.trim()
}

export function getDiscordChannelConfig(
  channel: DiscordWebhookChannel,
  guildId?: string | null,
): {
  webhookUrl: string
  roleId: string
  channelId: string
} {
  const cfg = resolveDiscordGuildConfig(guildId)
  if (cfg) {
    if (channel === 'test') {
      return {
        webhookUrl: cfg.testWebhookUrl.trim(),
        roleId: cfg.testRoleId.trim(),
        channelId: cfg.testChannelId.trim(),
      }
    }
    return {
      webhookUrl: cfg.productionWebhookUrl.trim(),
      roleId: cfg.productionRoleId.trim(),
      channelId: cfg.productionChannelId.trim(),
    }
  }
  if (channel === 'test') {
    return {
      webhookUrl: cached.discordTestWebhookUrl.trim(),
      roleId: cached.discordTestRoleId.trim(),
      channelId: cached.discordTestChannelId.trim(),
    }
  }
  return {
    webhookUrl: getDiscordWebhookUrl(),
    roleId: getDiscordRoleId(),
    channelId: cached.discordProductionChannelId.trim(),
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

function isValidDiscordSnowflake(id: string): boolean {
  if (!id) return true
  return /^[0-9]{5,30}$/.test(id)
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
  discordDeliveryMode?: string | null
  discordTestDeliveryMode?: string | null
  discordProductionDeliveryMode?: string | null
  discordBotTokenEnc?: string | null
  discordPrimaryGuildId?: string | null
  discordGuildConfigs?: unknown
  discordGuildId?: string | null
  discordTestChannelId?: string | null
  discordProductionChannelId?: string | null
  discordBotCommandRoleIds?: unknown
  teamChatHooksEnabled?: boolean | null
  teamChatWebhookUrls?: unknown
  teamChatChannelIds?: unknown
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
}): SiteSettingsCached {
  const addTemplates = normalizeTemplateList(doc.teamChatAddTemplates)
  const sabotageTemplates = normalizeTemplateList(doc.teamChatSabotageTemplates)
  const monthlyEvents = normalizeMonthlyEvents(doc.monthlyEvents)
  const tokenEnc = (doc.discordBotTokenEnc ?? '').trim()

  let guildConfigs = normalizeGuildConfigsMap(
    (doc as { discordGuildConfigs?: unknown }).discordGuildConfigs,
  )
  if (Object.keys(guildConfigs).length === 0) {
    const migrated = guildConfigFromLegacyFlat(doc)
    if (migrated) guildConfigs = { [migrated.guildId]: migrated }
  }

  let primaryId = (
    (doc as { discordPrimaryGuildId?: string | null }).discordPrimaryGuildId ?? ''
  ).trim()
  if (!primaryId) primaryId = (doc.discordGuildId ?? '').trim()
  if (!primaryId) primaryId = Object.keys(guildConfigs)[0] ?? ''
  if (primaryId && !guildConfigs[primaryId]) {
    guildConfigs[primaryId] = emptyGuildConfig(primaryId)
  }

  const primary = primaryId ? guildConfigs[primaryId] ?? null : null
  const flat = flatFieldsFromGuild(primary)

  return {
    showTeamRosters: doc.showTeamRosters,
    downtimeMode: doc.downtimeMode ?? false,
    ...flat,
    discordPrimaryGuildId: primaryId,
    discordGuildConfigs: guildConfigs,
    discordBotTokenEnc: tokenEnc,
    discordBotTokenConfigured: Boolean(tokenEnc),
    teamChatHooksEnabled: doc.teamChatHooksEnabled ?? false,
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
    discordBotGuildsCache: normalizeBotGuildsCache(
      (doc as { discordBotGuildsCache?: unknown }).discordBotGuildsCache,
    ),
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
  patch: SiteSettingsAdminPatch,
): Promise<SiteSettingsAdmin> {
  let doc = await SiteSettings.findOne()
  if (!doc) {
    doc = await SiteSettings.create({})
  }
  let botSettingsChanged = false
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
  const applySnowflake = (
    field:
      | 'discordGuildId'
      | 'discordTestChannelId'
      | 'discordProductionChannelId',
    value: string,
  ) => {
    const trimmed = normalizeDiscordRoleId(value)
    if (!isValidDiscordSnowflake(trimmed)) {
      throw new Error(`Invalid Discord ID for ${field}`)
    }
    doc.set(field, trimmed)
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

  if (
    patch.discordTestDeliveryMode === 'webhook' ||
    patch.discordTestDeliveryMode === 'bot'
  ) {
    doc.set('discordTestDeliveryMode', patch.discordTestDeliveryMode)
  }
  if (
    patch.discordProductionDeliveryMode === 'webhook' ||
    patch.discordProductionDeliveryMode === 'bot'
  ) {
    doc.set('discordProductionDeliveryMode', patch.discordProductionDeliveryMode)
    // Keep deprecated field in sync with production for older readers.
    doc.set('discordDeliveryMode', patch.discordProductionDeliveryMode)
  } else if (patch.discordDeliveryMode === 'webhook' || patch.discordDeliveryMode === 'bot') {
    // Legacy single-mode patch → apply to both channels.
    doc.set('discordDeliveryMode', patch.discordDeliveryMode)
    doc.set('discordTestDeliveryMode', patch.discordDeliveryMode)
    doc.set('discordProductionDeliveryMode', patch.discordDeliveryMode)
  }
  if (typeof patch.discordGuildId === 'string') {
    applySnowflake('discordGuildId', patch.discordGuildId)
    botSettingsChanged = true
  }
  if (typeof patch.discordTestChannelId === 'string') {
    applySnowflake('discordTestChannelId', patch.discordTestChannelId)
  }
  if (typeof patch.discordProductionChannelId === 'string') {
    applySnowflake('discordProductionChannelId', patch.discordProductionChannelId)
  }
  if (Array.isArray(patch.discordBotCommandRoleIds)) {
    const roles = normalizeRoleIdList(patch.discordBotCommandRoleIds)
    for (const roleId of roles) {
      if (!isValidDiscordRoleId(roleId)) {
        throw new Error(
          'Invalid Discord bot command role ID — use Role ID snowflakes only.',
        )
      }
    }
    doc.set('discordBotCommandRoleIds', roles)
    botSettingsChanged = true
  }
  if (patch.clearDiscordBotToken === true) {
    doc.set('discordBotTokenEnc', '')
    doc.set('discordBotGuildsCache', null)
    botSettingsChanged = true
  } else if (
    typeof patch.discordBotToken === 'string' &&
    patch.discordBotToken.trim()
  ) {
    doc.set('discordBotTokenEnc', encryptSecret(patch.discordBotToken.trim()))
    doc.set('discordBotGuildsCache', null)
    botSettingsChanged = true
  }

  // Multi-guild configs
  if (patch.discordGuildConfigs && typeof patch.discordGuildConfigs === 'object') {
    const configs = normalizeGuildConfigsMap(patch.discordGuildConfigs)
    for (const cfg of Object.values(configs)) {
      for (const url of [
        cfg.testWebhookUrl,
        cfg.productionWebhookUrl,
        ...Object.values(cfg.teamChatWebhookUrls),
      ]) {
        if (url && !isValidDiscordWebhookUrl(url)) {
          throw new Error('Invalid Discord webhook URL')
        }
      }
      for (const roleId of [
        cfg.testRoleId,
        cfg.productionRoleId,
        ...cfg.botCommandRoleIds,
      ]) {
        if (roleId && !isValidDiscordRoleId(roleId)) {
          throw new Error(
            'Invalid Discord role ID — paste Role ID snowflakes only.',
          )
        }
      }
      for (const channelId of [
        cfg.testChannelId,
        cfg.productionChannelId,
        ...Object.values(cfg.teamChatChannelIds),
      ]) {
        if (channelId && !isValidDiscordSnowflake(channelId)) {
          throw new Error('Invalid Discord channel ID')
        }
      }
    }
    doc.set('discordGuildConfigs', configs)
    botSettingsChanged = true
    const primary =
      (typeof patch.discordPrimaryGuildId === 'string'
        ? patch.discordPrimaryGuildId.trim()
        : '') ||
      (doc.get('discordPrimaryGuildId') as string | undefined)?.trim() ||
      Object.keys(configs)[0] ||
      ''
    if (primary) {
      doc.set('discordPrimaryGuildId', primary)
      const flat = flatFieldsFromGuild(configs[primary] ?? null)
      for (const [k, v] of Object.entries(flat)) {
        doc.set(k, v)
      }
    }
  }

  if (typeof patch.discordPrimaryGuildId === 'string') {
    const primary = patch.discordPrimaryGuildId.trim()
    if (primary && !isValidDiscordSnowflake(primary)) {
      throw new Error('Invalid Discord primary guild ID')
    }
    doc.set('discordPrimaryGuildId', primary)
    botSettingsChanged = true
    const configs = normalizeGuildConfigsMap(doc.get('discordGuildConfigs'))
    if (primary && configs[primary]) {
      const flat = flatFieldsFromGuild(configs[primary]!)
      for (const [k, v] of Object.entries(flat)) {
        doc.set(k, v)
      }
    } else if (primary && !configs[primary]) {
      // Ensure empty shell exists so flat projection has a home
      configs[primary] = emptyGuildConfig(primary)
      doc.set('discordGuildConfigs', configs)
    }
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
  if (patch.teamChatChannelIds && typeof patch.teamChatChannelIds === 'object') {
    const normalized = normalizeSnowflakeMap(patch.teamChatChannelIds)
    for (const id of Object.values(normalized)) {
      if (!isValidDiscordSnowflake(id)) {
        throw new Error('Invalid Discord channel ID for realm chat')
      }
    }
    doc.set('teamChatChannelIds', normalized)
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
  // Keep primary guild config in sync when legacy flat fields were patched alone
  {
    const configs = normalizeGuildConfigsMap(doc.get('discordGuildConfigs'))
    const primary =
      (doc.get('discordPrimaryGuildId') as string | undefined)?.trim() ||
      (doc.get('discordGuildId') as string | undefined)?.trim() ||
      ''
    if (primary) {
      const existing = configs[primary] ?? emptyGuildConfig(primary)
      const synced: DiscordGuildConfig = {
        ...existing,
        guildId: primary,
        testDeliveryMode:
          (doc.get('discordTestDeliveryMode') as string) === 'bot' ? 'bot' : 'webhook',
        productionDeliveryMode:
          (doc.get('discordProductionDeliveryMode') as string) === 'bot'
            ? 'bot'
            : 'webhook',
        testWebhookUrl: String(doc.get('discordTestWebhookUrl') ?? ''),
        testRoleId: String(doc.get('discordTestRoleId') ?? ''),
        productionWebhookUrl: String(
          doc.get('discordProductionWebhookUrl') || doc.get('discordWebhookUrl') || '',
        ),
        productionRoleId: String(
          doc.get('discordProductionRoleId') || doc.get('discordRoleId') || '',
        ),
        testChannelId: String(doc.get('discordTestChannelId') ?? ''),
        productionChannelId: String(doc.get('discordProductionChannelId') ?? ''),
        botCommandRoleIds: normalizeRoleIdList(doc.get('discordBotCommandRoleIds')),
        teamChatWebhookUrls: normalizeSnowflakeMap(doc.get('teamChatWebhookUrls')),
        teamChatChannelIds: normalizeSnowflakeMap(doc.get('teamChatChannelIds')),
      }
      configs[primary] = synced
      doc.set('discordGuildConfigs', configs)
      doc.set('discordPrimaryGuildId', primary)
    }
  }

  await doc.save()
  cached = toDocFromCache(doc)
  if (botSettingsChanged) {
    try {
      const { invalidateBotGuildsMemoryCache } = await import('./discordBotGuilds.js')
      invalidateBotGuildsMemoryCache()
    } catch {
      /* ignore */
    }
    notifyDiscordBotSettingsChanged()
  }
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
