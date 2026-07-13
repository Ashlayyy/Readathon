import { readFileSync } from 'node:fs'
import { parsePromptPackJson } from './promptImport.js'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  getStaticConfig,
  type Prompt as PublicPrompt,
  type RealmathonConfig,
  type Team,
} from '../config.js'
import { Prompt, type IPrompt } from '../db/models/Prompt.js'
import { getSiteSettingsSync } from './siteSettings.js'

const configPath = join(dirname(fileURLToPath(import.meta.url)), '../../data/realmathon.json')

let cache: IPrompt[] = []
let usingDatabase = false

export function isPromptLive(p: Pick<IPrompt, 'isActive' | 'goesLiveAt'>): boolean {
  if (!p.isActive) return false
  if (p.goesLiveAt && new Date(p.goesLiveAt) > new Date()) return false
  return true
}

export async function refreshPromptsCache(): Promise<void> {
  cache = await Prompt.find().sort({ sortOrder: 1, kind: 1, label: 1 })
  usingDatabase = cache.length > 0
}

export function promptsUseDatabase(): boolean {
  return usingDatabase
}

function toPublicGlobalPrompt(p: IPrompt): PublicPrompt {
  return {
    id: p.promptId,
    gameName: p.gameName ?? '',
    label: p.label,
    description: p.description ?? '',
    points: p.points,
    link: p.link ?? undefined,
  }
}

function mergeTeams(baseTeams: Team[], pool: IPrompt[]): Team[] {
  return baseTeams.map((team) => ({
    ...team,
    bonusPrompts: pool
      .filter((p) => p.kind === 'team_bonus' && p.teamId === team.id)
      .map((p) => ({ id: p.promptId, label: p.label, points: p.points })),
  }))
}

export function getConfigWithPrompts(publicOnly = true): RealmathonConfig {
  const base = getStaticConfig()

  if (!usingDatabase) {
    return base
  }

  const pool = publicOnly ? cache.filter(isPromptLive) : [...cache]

  return {
    ...base,
    teams: mergeTeams(base.teams, pool),
    prompts: {
      positive: pool.filter((p) => p.kind === 'positive').map(toPublicGlobalPrompt),
      negative: pool.filter((p) => p.kind === 'negative').map(toPublicGlobalPrompt),
    },
  }
}

/** Public site config — prompts from DB when populated, else JSON fallback. */
export function getConfig(): RealmathonConfig {
  return {
    ...getConfigWithPrompts(true),
    site: getSiteSettingsSync(),
  }
}

export function getPromptById(id: string, publicOnly = true): PublicPrompt | undefined {
  const config = getConfigWithPrompts(publicOnly)
  return [...config.prompts.positive, ...config.prompts.negative].find((p) => p.id === id)
}

export function getTeamById(id: string, publicOnly = true): Team | undefined {
  return getConfigWithPrompts(publicOnly).teams.find((t) => t.id === id)
}

export function promptToAdminPublic(p: IPrompt) {
  return {
    id: p._id.toString(),
    promptId: p.promptId,
    kind: p.kind,
    teamId: p.teamId,
    gameName: p.gameName ?? '',
    label: p.label,
    description: p.description ?? '',
    points: p.points,
    link: p.link,
    isActive: p.isActive,
    goesLiveAt: p.goesLiveAt?.toISOString() ?? null,
    sortOrder: p.sortOrder ?? 0,
    isLive: isPromptLive(p),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  }
}

export type PromptInput = {
  promptId: string
  kind: 'positive' | 'negative' | 'team_bonus'
  teamId?: string | null
  gameName?: string
  label: string
  description?: string
  points: number
  link?: string | null
  isActive?: boolean
  goesLiveAt?: string | null
  sortOrder?: number
}

function validatePromptInput(input: PromptInput, isUpdate = false): string | null {
  const id = input.promptId?.trim()
  if (!isUpdate && !id) return 'Prompt ID is required.'
  if (id && !/^[a-z0-9-]+$/.test(id)) return 'Prompt ID must be lowercase letters, numbers, and hyphens.'

  if (!input.label?.trim()) return 'Label is required.'
  if (typeof input.points !== 'number' || Number.isNaN(input.points)) return 'Points must be a number.'

  if (input.kind === 'team_bonus') {
    if (!input.teamId?.trim()) return 'Team is required for team bonus prompts.'
    const team = getStaticConfig().teams.find((t) => t.id === input.teamId)
    if (!team) return 'Invalid team.'
  } else if (input.kind === 'positive' && input.points <= 0) {
    return 'Positive prompts must have positive points.'
  } else if (input.kind === 'negative' && input.points >= 0) {
    return 'Sabotage prompts must have negative points.'
  }

  if (input.goesLiveAt?.trim() && Number.isNaN(Date.parse(input.goesLiveAt))) {
    return 'Go-live date must be a valid date.'
  }

  return null
}

export async function createPrompt(input: PromptInput): Promise<IPrompt> {
  const error = validatePromptInput(input)
  if (error) throw new Error(error)

  const existing = await Prompt.findOne({ promptId: input.promptId.trim() })
  if (existing) throw new Error('A prompt with this ID already exists.')

  const doc = await Prompt.create({
    promptId: input.promptId.trim(),
    kind: input.kind,
    teamId: input.kind === 'team_bonus' ? input.teamId?.trim() : null,
    gameName: input.gameName?.trim() ?? '',
    label: input.label.trim(),
    description: input.description?.trim() ?? '',
    points: input.points,
    link: input.link?.trim() || null,
    isActive: input.isActive ?? true,
    goesLiveAt: input.goesLiveAt?.trim() ? new Date(input.goesLiveAt) : null,
    sortOrder: input.sortOrder ?? 0,
  })

  await refreshPromptsCache()
  return doc
}

export async function updatePrompt(mongoId: string, input: Partial<PromptInput>): Promise<IPrompt> {
  const doc = await Prompt.findById(mongoId)
  if (!doc) throw new Error('Prompt not found.')

  const merged: PromptInput = {
    promptId: input.promptId ?? doc.promptId,
    kind: input.kind ?? doc.kind,
    teamId: input.teamId !== undefined ? input.teamId : doc.teamId,
    gameName: input.gameName ?? doc.gameName,
    label: input.label ?? doc.label,
    description: input.description ?? doc.description,
    points: input.points ?? doc.points,
    link: input.link !== undefined ? input.link : doc.link,
    isActive: input.isActive ?? doc.isActive,
    goesLiveAt: input.goesLiveAt !== undefined ? input.goesLiveAt : doc.goesLiveAt?.toISOString() ?? null,
    sortOrder: input.sortOrder ?? doc.sortOrder,
  }

  const error = validatePromptInput(merged, true)
  if (error) throw new Error(error)

  if (input.promptId && input.promptId.trim() !== doc.promptId) {
    const clash = await Prompt.findOne({ promptId: input.promptId.trim() })
    if (clash) throw new Error('A prompt with this ID already exists.')
    doc.promptId = input.promptId.trim()
  }

  doc.kind = merged.kind
  doc.teamId = merged.kind === 'team_bonus' ? merged.teamId?.trim() ?? null : null
  doc.gameName = merged.gameName?.trim() ?? ''
  doc.label = merged.label.trim()
  doc.description = merged.description?.trim() ?? ''
  doc.points = merged.points
  doc.link = merged.link?.trim() || null
  doc.isActive = merged.isActive ?? true
  doc.goesLiveAt = merged.goesLiveAt?.trim() ? new Date(merged.goesLiveAt) : null
  doc.sortOrder = merged.sortOrder ?? 0

  await doc.save()
  await refreshPromptsCache()
  return doc
}

export async function deletePrompt(mongoId: string): Promise<void> {
  const result = await Prompt.findByIdAndDelete(mongoId)
  if (!result) throw new Error('Prompt not found.')
  await refreshPromptsCache()
}

async function upsertPromptRows(rows: PromptInput[]): Promise<number> {
  for (const row of rows) {
    const error = validatePromptInput(row)
    if (error) throw new Error(`${row.promptId}: ${error}`)
  }

  let imported = 0
  for (const row of rows) {
    await Prompt.findOneAndUpdate(
      { promptId: row.promptId },
      {
        promptId: row.promptId,
        kind: row.kind,
        teamId: row.teamId ?? null,
        gameName: row.gameName ?? '',
        label: row.label,
        description: row.description ?? '',
        points: row.points,
        link: row.link ?? null,
        isActive: row.isActive ?? true,
        goesLiveAt: row.goesLiveAt?.trim() ? new Date(row.goesLiveAt) : null,
        sortOrder: row.sortOrder ?? 0,
      },
      { upsert: true, new: true },
    )
    imported++
  }

  await refreshPromptsCache()
  return imported
}

export async function importPromptsFromJson(
  data: unknown,
  replaceExisting: boolean,
): Promise<{ imported: number; scheduled: number }> {
  const rows = parsePromptPackJson(data)

  if (replaceExisting) {
    await Prompt.deleteMany({})
  }

  const imported = await upsertPromptRows(rows)
  const scheduled = rows.filter(
    (r) => r.goesLiveAt && new Date(r.goesLiveAt) > new Date(),
  ).length

  return { imported, scheduled }
}

export async function importPromptsFromConfigFile(replaceExisting: boolean): Promise<{ imported: number }> {
  const raw = JSON.parse(readFileSync(configPath, 'utf-8')) as RealmathonConfig

  if (replaceExisting) {
    await Prompt.deleteMany({})
  }

  const rows: PromptInput[] = []

  for (const p of raw.prompts.positive) {
    rows.push({
      promptId: p.id,
      kind: 'positive',
      gameName: p.gameName,
      label: p.label,
      description: p.description,
      points: p.points,
      link: p.link ?? null,
      isActive: true,
    })
  }

  for (const p of raw.prompts.negative) {
    rows.push({
      promptId: p.id,
      kind: 'negative',
      gameName: p.gameName,
      label: p.label,
      description: p.description,
      points: p.points,
      link: p.link ?? null,
      isActive: true,
    })
  }

  for (const team of raw.teams) {
    for (const bp of team.bonusPrompts) {
      rows.push({
        promptId: bp.id,
        kind: 'team_bonus',
        teamId: team.id,
        label: bp.label,
        points: bp.points,
        isActive: true,
      })
    }
  }

  const imported = await upsertPromptRows(rows)
  return { imported }
}
