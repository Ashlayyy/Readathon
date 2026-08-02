import type {
  MonthlyEventMultipliers,
  MonthlyEventSiteOverride,
  MonthlyEventSlot,
} from './api'

export const THEME_COLOR_KEYS = [
  'background',
  'surface',
  'surfaceAlt',
  'text',
  'textMuted',
  'accent',
  'accentGlow',
  'border',
  'success',
] as const

export type ThemeColorKey = (typeof THEME_COLOR_KEYS)[number]

export const THEME_COLOR_LABELS: Record<ThemeColorKey, string> = {
  background: 'Background',
  surface: 'Surface',
  surfaceAlt: 'Surface (alt)',
  text: 'Text',
  textMuted: 'Muted text',
  accent: 'Accent',
  accentGlow: 'Accent glow',
  border: 'Border',
  success: 'Success',
}

/** Curated copy keys editable in the Themes form (empty = no override). */
export const CURATED_COPY_FIELDS: { key: string; label: string }[] = [
  { key: 'enterCta', label: 'Enter CTA' },
  { key: 'submitCta', label: 'Submit CTA' },
  { key: 'howItWorksCta', label: 'How it works CTA' },
  { key: 'joinCta', label: 'Join CTA' },
  { key: 'loginTitle', label: 'Login title' },
  { key: 'teamsPageTitle', label: 'Teams page title' },
  { key: 'standingsPageTitle', label: 'Standings page title' },
  { key: 'promptsPageTitle', label: 'Prompts page title' },
  { key: 'faqPageTitle', label: 'FAQ page title' },
  { key: 'howItWorksPageTitle', label: 'How it works page title' },
  { key: 'pendingBanner', label: 'Pending realm banner' },
]

export const EVENT_TEXT_FIELDS: { key: string; label: string; multiline?: boolean }[] =
  [
    { key: 'name', label: 'Event name' },
    { key: 'subtitle', label: 'Subtitle' },
    { key: 'tagline', label: 'Tagline' },
    { key: 'month', label: 'Month / period label' },
    { key: 'loreTitle', label: 'Lore title' },
    { key: 'characterCreationNote', label: 'Character creation note' },
  ]

export type MultiplierPreset = {
  id: string
  label: string
  multipliers: MonthlyEventMultipliers
}

export const MULTIPLIER_PRESETS: MultiplierPreset[] = [
  {
    id: '1x',
    label: '1× Normal',
    multipliers: { prompts: 1, bonuses: 1, pageBonus: 1 },
  },
  {
    id: '1.5x',
    label: '1.5× Boost',
    multipliers: { prompts: 1.5, bonuses: 1.5, pageBonus: 1.5 },
  },
  {
    id: '2x',
    label: '2× Double',
    multipliers: { prompts: 2, bonuses: 2, pageBonus: 2 },
  },
]

export type ColorPreset = {
  id: string
  label: string
  /** Short vibe line under the swatches */
  hint: string
  colors: Record<ThemeColorKey, string>
}

/** One-click palettes for Theme of the Month Look tab. */
export const COLOR_PRESETS: ColorPreset[] = [
  {
    id: 'crucible',
    label: 'Crucible',
    hint: 'Base dark + coral',
    colors: {
      background: '#08070b',
      surface: '#12101a',
      surfaceAlt: '#1c1928',
      text: '#f4efe8',
      textMuted: '#9a9188',
      accent: '#d4634a',
      accentGlow: '#ff8a6a',
      border: '#2e2a3d',
      success: '#6ecf8a',
    },
  },
  {
    id: 'ember',
    label: 'Ember',
    hint: 'Warm fire night',
    colors: {
      background: '#120a08',
      surface: '#1c100e',
      surfaceAlt: '#2a1612',
      text: '#f7ebe4',
      textMuted: '#b89588',
      accent: '#e85d3a',
      accentGlow: '#ff9a6b',
      border: '#4a2a22',
      success: '#7dcf8e',
    },
  },
  {
    id: 'frost',
    label: 'Frost',
    hint: 'Cold steel blues',
    colors: {
      background: '#070b12',
      surface: '#0e1520',
      surfaceAlt: '#162032',
      text: '#e8eef7',
      textMuted: '#8a9bb0',
      accent: '#6eb6e8',
      accentGlow: '#9fd4ff',
      border: '#243348',
      success: '#6ecf8a',
    },
  },
  {
    id: 'poison',
    label: 'Poison',
    hint: 'Toxic green glow',
    colors: {
      background: '#070c08',
      surface: '#0e1610',
      surfaceAlt: '#16241a',
      text: '#e8f5ea',
      textMuted: '#8aab90',
      accent: '#5fd67a',
      accentGlow: '#9cffb0',
      border: '#274030',
      success: '#8ae0a0',
    },
  },
  {
    id: 'royal',
    label: 'Royal',
    hint: 'Deep violet court',
    colors: {
      background: '#0b0812',
      surface: '#151022',
      surfaceAlt: '#211a33',
      text: '#f0eaf8',
      textMuted: '#a090b8',
      accent: '#b48cff',
      accentGlow: '#d4b6ff',
      border: '#352a4d',
      success: '#6ecf8a',
    },
  },
  {
    id: 'bloodmoon',
    label: 'Blood moon',
    hint: 'Horror red night',
    colors: {
      background: '#0e0608',
      surface: '#1a0c10',
      surfaceAlt: '#281218',
      text: '#f8e8ea',
      textMuted: '#b08890',
      accent: '#e04060',
      accentGlow: '#ff7a94',
      border: '#4a2030',
      success: '#6ecf8a',
    },
  },
  {
    id: 'harvest',
    label: 'Harvest',
    hint: 'Autumn gold',
    colors: {
      background: '#100c06',
      surface: '#1a140c',
      surfaceAlt: '#282014',
      text: '#f6efe2',
      textMuted: '#b0a080',
      accent: '#e0a040',
      accentGlow: '#ffc86a',
      border: '#403428',
      success: '#7dcf8e',
    },
  },
  {
    id: 'midnight',
    label: 'Midnight ink',
    hint: 'Quiet navy',
    colors: {
      background: '#06080f',
      surface: '#0c1018',
      surfaceAlt: '#141c2a',
      text: '#e6ebf4',
      textMuted: '#8896aa',
      accent: '#7a9cff',
      accentGlow: '#a8c0ff',
      border: '#222c40',
      success: '#6ecf8a',
    },
  },
]

export function loreToText(lore: unknown): string {
  if (Array.isArray(lore)) {
    return lore.filter((x): x is string => typeof x === 'string').join('\n\n')
  }
  if (typeof lore === 'string') return lore
  return ''
}

export function textToLore(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
}

export function getOverrideString(
  override: MonthlyEventSiteOverride,
  section: 'event' | 'copy',
  key: string,
): string {
  const bag = override[section]
  if (!bag || typeof bag !== 'object') return ''
  const v = (bag as Record<string, unknown>)[key]
  return typeof v === 'string' ? v : ''
}

export function setOverrideString(
  override: MonthlyEventSiteOverride,
  section: 'event' | 'copy',
  key: string,
  value: string,
): MonthlyEventSiteOverride {
  const trimmed = value.trim()
  const prev = { ...(override[section] ?? {}) } as Record<string, unknown>
  if (!trimmed) {
    delete prev[key]
  } else {
    prev[key] = trimmed
  }
  const next: MonthlyEventSiteOverride = { ...override }
  if (Object.keys(prev).length === 0) {
    delete next[section]
  } else {
    next[section] = prev
  }
  return next
}

export function getThemeColors(
  override: MonthlyEventSiteOverride,
): Partial<Record<ThemeColorKey, string>> {
  const theme = override.branding?.theme ?? {}
  const out: Partial<Record<ThemeColorKey, string>> = {}
  for (const key of THEME_COLOR_KEYS) {
    const v = theme[key]
    if (typeof v === 'string' && v.trim()) out[key] = v.trim()
  }
  return out
}

export function setThemeColor(
  override: MonthlyEventSiteOverride,
  key: ThemeColorKey,
  value: string,
): MonthlyEventSiteOverride {
  const theme = { ...(override.branding?.theme ?? {}) }
  const trimmed = value.trim()
  if (!trimmed) delete theme[key]
  else theme[key] = trimmed
  if (Object.keys(theme).length === 0) {
    const next = { ...override }
    delete next.branding
    return next
  }
  return { ...override, branding: { theme } }
}

export function clearThemeColors(
  override: MonthlyEventSiteOverride,
): MonthlyEventSiteOverride {
  const next = { ...override }
  delete next.branding
  return next
}

/** Apply a full palette preset onto siteOverride.branding.theme. */
export function applyColorPreset(
  override: MonthlyEventSiteOverride,
  preset: ColorPreset,
): MonthlyEventSiteOverride {
  return {
    ...override,
    branding: { theme: { ...preset.colors } },
  }
}

export function overrideToJson(override: MonthlyEventSiteOverride): string {
  try {
    return JSON.stringify(override ?? {}, null, 2)
  } catch {
    return '{}'
  }
}

export function parseOverrideJson(raw: string): MonthlyEventSiteOverride | null {
  try {
    const parsed = JSON.parse(raw || '{}') as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const branding =
      parsed.branding && typeof parsed.branding === 'object'
        ? (parsed.branding as MonthlyEventSiteOverride['branding'])
        : undefined
    return {
      event:
        parsed.event && typeof parsed.event === 'object'
          ? (parsed.event as Record<string, unknown>)
          : undefined,
      copy:
        parsed.copy && typeof parsed.copy === 'object'
          ? (parsed.copy as Record<string, unknown>)
          : undefined,
      branding,
    }
  } catch {
    return null
  }
}

export function emptyDiscordTemplates(): MonthlyEventSlot['discordTemplates'] {
  return {
    add: [],
    sabotage: [],
    standings: '',
    breakdown: '',
    vibes: '',
    wrap: '',
  }
}

export function emptyReaderOfMonth(): MonthlyEventSlot['readerOfMonth'] {
  return { userId: '', shoutout: '' }
}

export function cloneThemeSlot(slot: MonthlyEventSlot): MonthlyEventSlot {
  const copy = JSON.parse(JSON.stringify(slot)) as MonthlyEventSlot
  copy.id = crypto.randomUUID()
  copy.status = 'draft'
  copy.title = slot.title ? `${slot.title} (copy)` : 'Untitled (copy)'
  if (!copy.discordTemplates) copy.discordTemplates = emptyDiscordTemplates()
  if (!copy.readerOfMonth) copy.readerOfMonth = emptyReaderOfMonth()
  if (copy.imageUrl == null) copy.imageUrl = ''
  return copy
}

export const DISCORD_CAPTION_HINT =
  'Placeholders: {{mention}} {{weekLabel}} {{eventName}} {{wrapLabel}} {{wrapRange}}. Leave blank for the default caption.'

export const MONTHLY_THEME_PREVIEW_KEY = 'monthlyThemePreview'
