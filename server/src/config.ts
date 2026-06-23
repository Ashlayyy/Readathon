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
}

export type Team = {
  id: string
  name: string
  leads: string[]
  bonusPrompts: { id: string; label: string; points: number }[]
}

export type RealmathonConfig = {
  event: Record<string, unknown>
  schedule: Record<string, unknown>
  branding: Record<string, unknown>
  teams: Team[]
  pageCountBonuses: { min: number; max: number | null; points: number; label: string }[]
  globalBonuses: { id: string; label: string; description: string; points: number }[]
  prompts: { positive: Prompt[]; negative: Prompt[] }
  howItWorks: { step: number; title: string; body: string }[]
  scoringRules: Record<string, unknown>
  faq: { q: string; a: string }[]
}

let cached: RealmathonConfig | null = null

export function getConfig(): RealmathonConfig {
  if (!cached) {
    cached = JSON.parse(readFileSync(configPath, 'utf-8')) as RealmathonConfig
  }
  return cached
}

export function reloadConfig(): RealmathonConfig {
  cached = null
  return getConfig()
}

export function getPromptById(id: string): Prompt | undefined {
  const config = getConfig()
  return [...config.prompts.positive, ...config.prompts.negative].find((p) => p.id === id)
}

export function getTeamById(id: string): Team | undefined {
  return getConfig().teams.find((t) => t.id === id)
}

export function pageCountBonus(pages: number): number {
  const tiers = getConfig().pageCountBonuses
  for (const tier of tiers) {
    const max = tier.max ?? Infinity
    if (pages >= tier.min && pages <= max) return tier.points
  }
  return 0
}
