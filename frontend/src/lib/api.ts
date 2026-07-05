const API_BASE = '/api'

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
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
          : `Server error (${res.status}). Is the API running on port 3001?`,
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
  unreadAnswers?: number
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

export type Prompt = {
  id: string
  gameName: string
  label: string
  description: string
  points: number
  link?: string
}

export type TeamConfig = {
  id: string
  name: string
  color: string
  accent: string
  icon: string
  leads: string[]
  bonusPrompts: { id: string; label: string; points: number }[]
}

export type SiteCopy = {
  [key: string]: string | string[] | Record<string, string> | undefined
  scoringSummary: string[]
  homeQuickLinks: Record<string, string>
  nav: Record<string, string>
  notifications: Record<string, string>
}

export type AdminSiteSettings = {
  showTeamRosters: boolean
  discordWebhookUrl: string
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
  }
  teams: TeamConfig[]
  pageCountBonuses: { min: number; max: number | null; points: number; label: string }[]
  globalBonuses: { id: string; label: string; description: string; points: number }[]
  prompts: { positive: Prompt[]; negative: Prompt[] }
  howItWorks: { step: number; title: string; body: string }[]
  scoringRules: { maxPromptsPerBook: number }
  faq: { q: string; a: string }[]
  site?: { showTeamRosters: boolean }
}

export type TeamStanding = {
  teamId: string
  teamName: string
  memberCount: number
  xpGained: number
  xpLost: number
  netXp: number
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
  startedAt: string | null
  finishedAt: string | null
  submissionType: 'add' | 'sabotage'
  targetTeamId: string | null
  promptIds: string[]
  bonusCompetition: boolean
  bonusTeamPromptIds: string[]
  pageBonus: number
  promptPoints: number
  bonusPoints: number
  totalImpact: number
  createdAt: string
}

export type AdminSubmission = Submission & {
  userName: string
  userEmail: string
  userTeamId: string | null
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

export type AdminStandingsData = {
  current: { standings: TeamStanding[]; svg: string }
  activePublication: PublishedWeek | null
  activeWeeks: PublishedWeek[]
  history: StandingsHistoryEntry[]
}

/** Download a file from an authenticated API path. */
export async function downloadFile(path: string, filename: string) {
  const res = await fetch(`/api${path}`, { credentials: 'include' })
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
