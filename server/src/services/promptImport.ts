import type { PromptInput } from './prompts.js'

type RawPrompt = {
  id?: string
  promptId?: string
  gameName?: string
  label?: string
  description?: string
  points?: number
  link?: string | null
  goesLiveAt?: string | null
  isActive?: boolean
  sortOrder?: number
  teamId?: string | null
  kind?: 'positive' | 'negative' | 'team_bonus'
}

type RawSet = {
  set?: number
  goesLiveAt?: string | null
  prompts?: RawPrompt[]
}

type RawPack = {
  kind?: 'positive' | 'negative' | 'team_bonus'
  sets?: RawSet[]
  prompts?:
    | RawPrompt[]
    | {
        positive?: RawPrompt[]
        negative?: RawPrompt[]
      }
  teams?: { id: string; bonusPrompts?: RawPrompt[] }[]
}

function normalizePoints(kind: PromptInput['kind'], points: number): number {
  if (kind === 'negative' && points > 0) return -points
  if (kind === 'positive' && points < 0) return Math.abs(points)
  return points
}

function toPromptInput(
  raw: RawPrompt,
  defaults: {
    kind: PromptInput['kind']
    goesLiveAt?: string | null
    teamId?: string | null
  },
): PromptInput {
  const promptId = (raw.promptId ?? raw.id)?.trim()
  if (!promptId) throw new Error('Each prompt needs an "id" or "promptId".')

  const kind = raw.kind ?? defaults.kind
  if (!raw.label?.trim()) throw new Error(`Prompt "${promptId}" is missing a label.`)

  const points = raw.points
  if (typeof points !== 'number' || Number.isNaN(points)) {
    throw new Error(`Prompt "${promptId}" needs a numeric "points" value.`)
  }

  return {
    promptId,
    kind,
    teamId: kind === 'team_bonus' ? (raw.teamId ?? defaults.teamId ?? null) : null,
    gameName: raw.gameName ?? '',
    label: raw.label.trim(),
    description: raw.description ?? '',
    points: normalizePoints(kind, points),
    link: raw.link ?? null,
    isActive: raw.isActive ?? true,
    goesLiveAt: raw.goesLiveAt ?? defaults.goesLiveAt ?? null,
    sortOrder: raw.sortOrder ?? 0,
  }
}

/** Parse uploaded prompt pack JSON (attack.json, flat list, or realmathon-style). */
export function parsePromptPackJson(data: unknown): PromptInput[] {
  if (!data || typeof data !== 'object') {
    throw new Error('JSON must be an object.')
  }

  const pack = data as RawPack
  const rows: PromptInput[] = []
  const defaultKind = pack.kind ?? 'positive'

  if (Array.isArray(pack.sets)) {
    for (const set of pack.sets) {
      const setLiveAt = set.goesLiveAt ?? null
      for (const raw of set.prompts ?? []) {
        rows.push(toPromptInput(raw, { kind: defaultKind, goesLiveAt: setLiveAt }))
      }
    }
  }

  if (Array.isArray(pack.prompts)) {
    for (const raw of pack.prompts) {
      rows.push(toPromptInput(raw, { kind: defaultKind }))
    }
  } else if (pack.prompts && typeof pack.prompts === 'object') {
    for (const raw of pack.prompts.positive ?? []) {
      rows.push(toPromptInput(raw, { kind: 'positive' }))
    }
    for (const raw of pack.prompts.negative ?? []) {
      rows.push(toPromptInput(raw, { kind: 'negative' }))
    }
  }

  for (const team of pack.teams ?? []) {
    for (const raw of team.bonusPrompts ?? []) {
      rows.push(
        toPromptInput(raw, {
          kind: 'team_bonus',
          teamId: team.id,
        }),
      )
    }
  }

  if (rows.length === 0) {
    throw new Error(
      'No prompts found. Use "sets", a "prompts" array, prompts.positive/negative, or teams[].bonusPrompts.',
    )
  }

  const seen = new Set<string>()
  for (const row of rows) {
    if (seen.has(row.promptId)) {
      throw new Error(`Duplicate prompt ID in file: "${row.promptId}".`)
    }
    seen.add(row.promptId)
  }

  return rows
}

export type ImportPromptPreview = {
  total: number
  scheduled: number
  kinds: Record<string, number>
}

export function previewPromptPack(data: unknown): ImportPromptPreview {
  const rows = parsePromptPackJson(data)
  const kinds: Record<string, number> = {}
  let scheduled = 0

  for (const row of rows) {
    kinds[row.kind] = (kinds[row.kind] ?? 0) + 1
    if (row.goesLiveAt && new Date(row.goesLiveAt) > new Date()) scheduled++
  }

  return { total: rows.length, scheduled, kinds }
}
