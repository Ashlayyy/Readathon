import { apiUrl, googleLoginUrl } from './apiBase'
import { currentTenantSlugHeader } from '../composables/useTenant'

export { apiUrl, googleLoginUrl }

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const tenantSlug = currentTenantSlugHeader()
  const res = await fetch(apiUrl(path), {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {}),
      ...options.headers,
    },
    ...options,
  })

  const text = await res.text()
  let data: { error?: string } | null = null

  if (text) {
    try {
      data = JSON.parse(text) as { error?: string }
    } catch {
      throw new Error(
        res.ok
          ? 'Server returned an invalid response'
          : `Server error (${res.status}). Please try again later.`,
      )
    }
  }

  if (!res.ok) {
    throw new Error(data?.error ?? `Request failed (${res.status})`)
  }

  return (data ?? {}) as T
}

export type PublicUser = {
  id: string
  displayName: string
  email: string | null
  teamId: string | null
  status: 'pending' | 'assigned'
  isAdmin: boolean
  avatarUrl?: string | null
  /** True when the user uploaded a custom photo (vs Google default). */
  hasCustomAvatar?: boolean
  unreadAnswers?: number
  /** When true (default), use live host event light/dark palettes. */
  preferEventThemes?: boolean
}

export type AdminUser = PublicUser & {
  createdAt?: string
}

export type RosterMember = {
  id: string
  displayName: string
}

export type RosterTeam = {
  id: string
  name: string
  color: string
  icon: string
  members: RosterMember[]
}

export type PromptXpTier = {
  points: number
  label: string
  gainColor: string
  gainGlow: string
  attackColor: string
  attackGlow: string
}

export type Prompt = {
  id: string
  gameName: string
  label: string
  description: string
  points: number
  link?: string
  featured?: boolean
}

export type MonthlyEventMultipliers = {
  prompts: number
  bonuses: number
  pageBonus: number
}

export type MonthlyEventSiteOverride = {
  event?: Record<string, unknown>
  copy?: Record<string, unknown>
  branding?: {
    /** @deprecated Prefer themeDark; kept in sync for SVG / Discord / legacy. */
    theme?: Record<string, string>
    themeDark?: Record<string, string>
    themeLight?: Record<string, string>
  }
}

export type MonthlyDiscordTemplates = {
  add: string[]
  sabotage: string[]
  standings: string
  breakdown: string
  vibes: string
  wrap: string
}

export type MonthlyReaderOfMonth = {
  userId: string
  shoutout: string
}

export type MonthlyEventSlot = {
  id: string
  status: 'draft' | 'scheduled'
  title: string
  blurb: string
  from: string
  to: string
  timezone: string
  multipliers: MonthlyEventMultipliers
  featuredPromptIds: string[]
  siteOverride: MonthlyEventSiteOverride
  imageUrl: string
  discordTemplates: MonthlyDiscordTemplates
  readerOfMonth: MonthlyReaderOfMonth
}

export type MonthlyReaderOfMonthPublic = {
  userId: string
  displayName: string
  avatarUrl: string | null
  teamName: string | null
  shoutout: string
  auto: boolean
  books: number
  points: number
  source?: 'override' | 'range' | 'allTime'
}

export type ActiveMonthlyEvent = {
  id: string
  title: string
  blurb: string
  from: string
  to: string
  featuredPromptIds: string[]
  multipliers: MonthlyEventMultipliers
  imageUrl?: string | null
  readerOfMonth?: MonthlyReaderOfMonthPublic | null
}

export type TeamConfig = {
  id: string
  name: string
  color: string
  accent: string
  icon: string
  bonusPrompts: { id: string; label: string; points: number }[]
}

export type SiteCopy = {
  [key: string]: string | string[] | Record<string, string> | AdminCopyBlock | undefined
  scoringSummary: string[]
  homeQuickLinks: Record<string, string>
  nav: Record<string, string>
  notifications: Record<string, string>
  admin?: AdminCopyBlock
}

export type AdminCopyBlock = Record<string, string | Record<string, string>>

export type SeasonArchive = {
  slug: string
  title: string
  from: string
  to: string
  message: string
  publishedStandingsIds: string[]
} | null

export type DiscordGuildConfig = {
  guildId: string
  name: string
  testDeliveryMode: 'webhook' | 'bot'
  productionDeliveryMode: 'webhook' | 'bot'
  testWebhookUrl: string
  testRoleId: string
  productionWebhookUrl: string
  productionRoleId: string
  testChannelId: string
  productionChannelId: string
  botCommandRoleIds: string[]
  teamChatWebhookUrls: Record<string, string>
  teamChatChannelIds: Record<string, string>
}

export type AdminSiteSettings = {
  showTeamRosters: boolean
  downtimeMode: boolean
  /** @deprecated Use discordProductionWebhookUrl */
  discordWebhookUrl: string
  /** @deprecated Use discordProductionRoleId */
  discordRoleId: string
  discordTestWebhookUrl: string
  discordTestRoleId: string
  discordProductionWebhookUrl: string
  discordProductionRoleId: string
  /** @deprecated Prefer discordTestDeliveryMode / discordProductionDeliveryMode */
  discordDeliveryMode: 'webhook' | 'bot'
  discordTestDeliveryMode: 'webhook' | 'bot'
  discordProductionDeliveryMode: 'webhook' | 'bot'
  /** True when an encrypted bot token is stored (plaintext never returned). */
  discordBotTokenConfigured: boolean
  /** Primary guild for auto-publish / realm chat */
  discordPrimaryGuildId: string
  /** Guild for Admin “Send tests to” / verify test role */
  discordSendTargetGuildId: string
  /** Per-server Discord destinations */
  discordGuildConfigs: Record<string, DiscordGuildConfig>
  /** Cached Discord servers the bot is in (from last refresh) */
  discordBotGuildsCache: {
    guilds: Array<{ id: string; name: string }>
    fetchedAt: string
  } | null
  /** @deprecated Alias of primary guild */
  discordGuildId: string
  discordTestChannelId: string
  discordProductionChannelId: string
  discordBotCommandRoleIds: string[]
  teamChatHooksEnabled: boolean
  /** teamId -> Discord webhook URL (legacy) */
  teamChatWebhookUrls: Record<string, string>
  /** teamId -> Discord channel ID (bot mode) */
  teamChatChannelIds: Record<string, string>
  /** Realm chat Discord message templates (add logs) */
  teamChatAddTemplates: string[]
  /** Realm chat Discord message templates (sabotage logs) */
  teamChatSabotageTemplates: string[]
  scheduledPublishEnabled: boolean
  /** 0 = Sunday .. 6 = Saturday (matches JS Date#getDay) */
  scheduledPublishDay: number
  scheduledPublishHour: number
  scheduledPublishTimezone: string
  configDraft?: unknown
  configOverrides?: unknown
  seasonArchive?: SeasonArchive
  monthlyEvents?: MonthlyEventSlot[]
  monthlyWrapOnPublish?: boolean
  lastMonthlyWrapMonthKey?: string
  activeMonthlyEvent?: ActiveMonthlyEvent | null
}

/** Variables available in realm chat message templates. */
export const TEAM_CHAT_TEMPLATE_VARS = [
  { key: 'displayName', example: '{{displayName}}' },
  { key: 'bookTitle', example: '{{bookTitle}}' },
  { key: 'teamName', example: '{{teamName}}' },
  { key: 'targetTeamName', example: '{{targetTeamName}}' },
  { key: 'submissionType', example: '{{submissionType}}' },
] as const

export type AuditLogEntry = {
  id: string
  actorId: string | null
  actorName: string
  action: string
  entityType: string | null
  entityId: string | null
  detail: unknown
  createdAt: string
}

export type RealmathonConfig = {
  event: {
    name: string
    subtitle: string
    tagline: string
    month: string
    loreTitle: string
    lore: string[]
    characterCreationNote: string
  }
  copy: SiteCopy
  schedule: Record<string, unknown>
  branding: {
    theme: Record<string, string>
    themeDark?: Record<string, string>
    themeLight?: Record<string, string>
  }
  teams: TeamConfig[]
  pageCountBonuses: { min: number; max: number | null; points: number; label: string }[]
  globalBonuses: { id: string; label: string; description: string; points: number }[]
  promptXpTiers?: PromptXpTier[]
  prompts: { positive: Prompt[]; negative: Prompt[] }
  howItWorks: { step: number; title: string; body: string }[]
  scoringRules: { maxPromptsPerBook: number }
  faq: { q: string; a: string }[]
  site?: {
    showTeamRosters: boolean
    downtimeMode: boolean
    seasonArchive?: SeasonArchive
    activeMonthlyEvent?: ActiveMonthlyEvent | null
  }
  /** Active hosted event (null on marketing host). */
  tenant?: {
    slug: string
    name: string
    resolution: string | null
    isDefault: boolean
  } | null
}

export type TeamStanding = {
  teamId: string
  teamName: string
  memberCount: number
  xpGained: number
  xpDealt: number
  xpLost: number
  netXp: number
  totalTeamXp: number
  averagePerMember: number
  color: string
  icon: string
}

export type Submission = {
  id: string
  bookTitle: string
  bookAuthor: string
  pageCount: number
  format: string
  coverUrl?: string | null
  startedAt: string | null
  finishedAt: string | null
  submissionType: 'add' | 'sabotage'
  targetTeamId: string | null
  promptIds: string[]
  bonusCompetition: boolean
  bonusGlobalPromptId?: string | null
  bonusTeamPromptIds: string[]
  pageBonus: number
  promptPoints: number
  bonusPoints: number
  totalImpact: number
  createdAt: string
}

export type AdminSubmission = Submission & {
  userId: string
  userName: string
  userEmail: string
  userTeamId: string | null
  deletedAt?: string | null
  deletedBy?: string | null
  deletedByName?: string | null
}

export type AdminQuestion = {
  id: string
  displayName: string
  email: string
  message: string
  status: 'unread' | 'read' | 'answered'
  answer: string | null
  answeredAt: string | null
  answeredByName: string | null
  createdAt: string
}

export type UserQuestion = {
  id: string
  message: string
  status: 'unread' | 'read' | 'answered'
  answer: string | null
  answeredAt: string | null
  answeredByName: string | null
  answerSeen: boolean
  createdAt: string
}

export type ProfileDashboard = {
  booksLogged: number
  pointsContributed: number
  sabotageDealt: number
  sabotageTaken: number
  streakWeeks: number
  teamAvgBooks: number | null
  teamAvgPoints: number | null
  vsTeam: { booksDelta: number; pointsDelta: number } | null
}

export type Achievement = {
  id: string
  label: string
  description: string
  icon?: string
  earned: boolean
  earnedAt?: string | null
}

export type ShelfBook = {
  title: string
  author: string
  coverUrl: string | null
  realmName: string | null
  realmColor: string | null
  finishedAt: string
}

export type PublishedWeek = {
  id: string
  weekKey: string
  weekLabel: string
  publishedAt: string
}

export type StandingsHistoryEntry = {
  id: string
  action: 'published' | 'unpublished'
  weekKey: string
  weekLabel: string
  adminName: string
  adminEmail: string
  createdAt: string
}

export type MemberContribution = {
  userId: string
  displayName: string
  xpGained: number
  xpDealt: number
  addCount: number
  sabotageCount: number
}

export type IncomingAttack = {
  userId: string
  displayName: string
  attackerTeamId: string
  attackerTeamName: string
  damage: number
}

export type TeamBreakdown = {
  teamId: string
  teamName: string
  color: string
  icon: string
  members: MemberContribution[]
  attacksFromOthers: IncomingAttack[]
}

export type StandingsBreakdown = {
  teams: TeamBreakdown[]
}

export type SubmitStrategyRival = {
  teamId: string
  teamName: string
  /** their totalTeamXp - your totalTeamXp. Positive = they're ahead of your realm. */
  xpGap: number
  /** how much a typical sabotage would close this gap by, if they're ahead. */
  ifSabotageCloseBy: number
}

export type SubmitStrategy = {
  standingsAvailable: boolean
  yourTeamId: string | null
  yourTeamName: string | null
  yourTeamXp: number | null
  suggestion: 'add' | 'sabotage' | null
  targetTeamId: string | null
  targetTeamName: string | null
  gapToClose: number | null
  estimatedCloseBy: number | null
  reason: string
  rivals: SubmitStrategyRival[]
}

export type StandingsNamedCount = {
  id: string
  label: string
  count: number
  extra?: number
}

export type StandingsDogpileRow = {
  teamId: string
  teamName: string
  hitCount: number
  damageTaken: number
  booksLogged: number
  pagesLogged: number
  addCount: number
  sabotageCount: number
}

export type PublicStandingsVibes = {
  weekKey: string
  weekLabel: string
  rangeLabel: string
  overview: {
    submissions: number
    activeReaders: number
    addCount: number
    sabotageCount: number
    chaosRatio: number
    competitionRate: number
    avgPages: number
    totalPages: number
  }
  byType: StandingsNamedCount[]
  byFormat: StandingsNamedCount[]
  byPageTier: StandingsNamedCount[]
  dogpile: StandingsDogpileRow[]
  byTeam: StandingsDogpileRow[]
}

export type StandingsLeaderGap = {
  leaderTeamName: string
  secondTeamName: string
  gapXp: number
} | null

export type StandingsPreviewRow = {
  teamId: string
  teamName: string
  totalTeamXp: number
  netXp: number
  memberCount: number
}

export type PublishRangePreset = 'lastMonToThisMon' | 'thisWeek' | 'lastWeek' | 'last7' | 'custom'

export type StandingsDigestDraft = {
  weekKey: string
  weekLabel: string
  vibes: PublicStandingsVibes
  leaderGap: StandingsLeaderGap
  standingsPreview: StandingsPreviewRow[]
  notify: { emailCount: number; discordConfigured: boolean }
  draftText: string
  range: { from: string; to: string; preset: string; label: string }
}

export type PublishPreview = {
  weekKey: string
  weekLabel: string
  range?: { from: string; to: string; preset: string; label: string }
  standingsSvgUrl: string
  breakdownSvgUrl: string
  vibesSvgUrl: string
  digest: StandingsDigestDraft
  whoGetsNotified: { emails: number; discord: boolean; discordRoleId?: string }
}

export type AdminStandingsData = {
  current: {
    standings: TeamStanding[]
    breakdown: StandingsBreakdown
    imageUrl?: string
    breakdownImageUrl?: string
    /** @deprecated Prefer imageUrl */
    svg?: string
    /** @deprecated Prefer breakdownImageUrl */
    breakdownSvg?: string
  }
  activePublication: PublishedWeek | null
  activeWeeks: PublishedWeek[]
  history: StandingsHistoryEntry[]
}

/** Download a file from an authenticated API path. */
export async function downloadFile(path: string, filename: string) {
  const tenantSlug = currentTenantSlugHeader()
  const res = await fetch(apiUrl(path), {
    credentials: 'include',
    headers: {
      ...(tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {}),
    },
  })
  if (!res.ok) {
    let msg = `Download failed (${res.status})`
    try {
      const data = (await res.json()) as { error?: string }
      if (data.error) msg = data.error
    } catch {
      /* not json */
    }
    throw new Error(msg)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
