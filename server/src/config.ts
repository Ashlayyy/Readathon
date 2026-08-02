import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const configPath = join(dirname(fileURLToPath(import.meta.url)), '../../data/realmathon.json')

export type Prompt = {
  id: string
  gameName: string
  label: string
  description: string
  points: number
  link?: string
  /** Set when an active monthly theme features this prompt. */
  featured?: boolean
}

export type PromptXpTier = {
  points: number
  label: string
  gainColor: string
  gainGlow: string
  attackColor: string
  attackGlow: string
}

export type Team = {
  id: string
  name: string
  color: string
  accent: string
  icon: string
  bonusPrompts: { id: string; label: string; points: number }[]
}

export type RealmathonConfig = {
  event: Record<string, unknown>
  copy: Record<string, unknown>
  schedule: Record<string, unknown>
  branding: Record<string, unknown>
  teams: Team[]
  pageCountBonuses: { min: number; max: number | null; points: number; label: string }[]
  globalBonuses: { id: string; label: string; description: string; points: number }[]
  promptXpTiers?: PromptXpTier[]
  prompts: { positive: Prompt[]; negative: Prompt[] }
  howItWorks: { step: number; title: string; body: string }[]
  scoringRules: Record<string, unknown>
  faq: { q: string; a: string }[]
  site?: {
    showTeamRosters: boolean
    downtimeMode: boolean
    seasonArchive?: {
      slug: string
      title: string
      from: string
      to: string
      message: string
      publishedStandingsIds: string[]
    } | null
    activeMonthlyEvent?: {
      id: string
      title: string
      blurb: string
      from: string
      to: string
      featuredPromptIds: string[]
      multipliers: { prompts: number; bonuses: number; pageBonus: number }
    } | null
  }
}

let cached: RealmathonConfig | null = null

/** Load event copy, teams shell, FAQ, etc. from the JSON file (not DB prompts). */
export function getStaticConfig(): RealmathonConfig {
  if (!cached) {
    cached = JSON.parse(readFileSync(configPath, 'utf-8')) as RealmathonConfig
  }
  return cached
}

export function reloadConfig(): RealmathonConfig {
  cached = null
  return getStaticConfig()
}

export function pageCountBonus(pages: number): number {
  const tiers = getStaticConfig().pageCountBonuses
  for (const tier of tiers) {
    const max = tier.max ?? Infinity
    if (pages >= tier.min && pages <= max) return tier.points
  }
  return 0
}
