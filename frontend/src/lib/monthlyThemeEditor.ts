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

/** Light counterparts of COLOR_PRESETS (same ids / feel, daylight surfaces). */
export const COLOR_PRESETS_LIGHT: ColorPreset[] = [
  {
    id: 'crucible',
    label: 'Crucible',
    hint: 'Base light + coral',
    colors: {
      background: '#f1ece2',
      surface: '#fbf8f2',
      surfaceAlt: '#e8e1d3',
      text: '#2b2620',
      textMuted: '#6b6255',
      accent: '#c8563d',
      accentGlow: '#a8442e',
      border: '#d5cbb8',
      success: '#2f7a4f',
    },
  },
  {
    id: 'ember',
    label: 'Ember',
    hint: 'Warm fire day',
    colors: {
      background: '#f6ebe4',
      surface: '#fdf7f3',
      surfaceAlt: '#edd9cf',
      text: '#2c1812',
      textMuted: '#7a5548',
      accent: '#d44e2e',
      accentGlow: '#b03a1e',
      border: '#e0c4b4',
      success: '#2f7a4f',
    },
  },
  {
    id: 'frost',
    label: 'Frost',
    hint: 'Cool steel day',
    colors: {
      background: '#e8eef5',
      surface: '#f5f8fc',
      surfaceAlt: '#d5e0ec',
      text: '#152033',
      textMuted: '#5a6e86',
      accent: '#3a8fc4',
      accentGlow: '#2a6f9a',
      border: '#b8c8da',
      success: '#2f7a4f',
    },
  },
  {
    id: 'poison',
    label: 'Poison',
    hint: 'Toxic green day',
    colors: {
      background: '#e8f2ea',
      surface: '#f4faf5',
      surfaceAlt: '#d4e6d8',
      text: '#142018',
      textMuted: '#4f6a56',
      accent: '#2f9a4a',
      accentGlow: '#217838',
      border: '#b4d0ba',
      success: '#2f7a4f',
    },
  },
  {
    id: 'royal',
    label: 'Royal',
    hint: 'Violet court day',
    colors: {
      background: '#efeaf6',
      surface: '#f8f5fc',
      surfaceAlt: '#ddd4ec',
      text: '#1e1530',
      textMuted: '#655878',
      accent: '#7a52c7',
      accentGlow: '#5e3a9e',
      border: '#c8bddc',
      success: '#2f7a4f',
    },
  },
  {
    id: 'bloodmoon',
    label: 'Blood moon',
    hint: 'Horror rose day',
    colors: {
      background: '#f5e8ea',
      surface: '#fcf4f5',
      surfaceAlt: '#ebd4d8',
      text: '#2a1218',
      textMuted: '#7a5058',
      accent: '#c02848',
      accentGlow: '#9a1c38',
      border: '#dfc0c8',
      success: '#2f7a4f',
    },
  },
  {
    id: 'harvest',
    label: 'Harvest',
    hint: 'Autumn gold day',
    colors: {
      background: '#f4eee2',
      surface: '#fbf7ee',
      surfaceAlt: '#e8dcc8',
      text: '#2a2214',
      textMuted: '#6e6248',
      accent: '#c48420',
      accentGlow: '#9e6810',
      border: '#d8c8a8',
      success: '#2f7a4f',
    },
  },
  {
    id: 'midnight',
    label: 'Midnight ink',
    hint: 'Quiet navy day',
    colors: {
      background: '#e8ecf4',
      surface: '#f4f6fb',
      surfaceAlt: '#d4dae8',
      text: '#141a28',
      textMuted: '#556078',
      accent: '#4a6ad4',
      accentGlow: '#3550b0',
      border: '#b8c0d4',
      success: '#2f7a4f',
    },
  },
]

export type ThemePaletteKind = 'dark' | 'light'

function readPalette(
  branding: MonthlyEventSiteOverride['branding'] | undefined,
  kind: ThemePaletteKind,
): Record<string, string> {
  if (!branding) return {}
  if (kind === 'dark') return branding.themeDark ?? branding.theme ?? {}
  return branding.themeLight ?? {}
}

function writeBranding(
  themeDark: Record<string, string> | undefined,
  themeLight: Record<string, string> | undefined,
): MonthlyEventSiteOverride['branding'] | undefined {
  const dark = themeDark && Object.keys(themeDark).length > 0 ? themeDark : undefined
  const light = themeLight && Object.keys(themeLight).length > 0 ? themeLight : undefined
  if (!dark && !light) return undefined
  return {
    ...(dark ? { theme: dark, themeDark: dark } : {}),
    ...(light ? { themeLight: light } : {}),
  }
}

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
  kind: ThemePaletteKind = 'dark',
): Partial<Record<ThemeColorKey, string>> {
  const theme = readPalette(override.branding, kind)
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
  kind: ThemePaletteKind = 'dark',
): MonthlyEventSiteOverride {
  const dark = { ...readPalette(override.branding, 'dark') }
  const light = { ...readPalette(override.branding, 'light') }
  const target = kind === 'dark' ? dark : light
  const trimmed = value.trim()
  if (!trimmed) delete target[key]
  else target[key] = trimmed
  const branding = writeBranding(
    Object.keys(dark).length ? dark : undefined,
    Object.keys(light).length ? light : undefined,
  )
  const next = { ...override }
  if (!branding) delete next.branding
  else next.branding = branding
  return next
}

export function clearThemeColors(
  override: MonthlyEventSiteOverride,
  kind?: ThemePaletteKind,
): MonthlyEventSiteOverride {
  const next = { ...override }
  if (!kind) {
    delete next.branding
    return next
  }
  const dark = kind === 'dark' ? undefined : { ...readPalette(override.branding, 'dark') }
  const light = kind === 'light' ? undefined : { ...readPalette(override.branding, 'light') }
  const branding = writeBranding(
    dark && Object.keys(dark).length ? dark : undefined,
    light && Object.keys(light).length ? light : undefined,
  )
  if (!branding) delete next.branding
  else next.branding = branding
  return next
}

/** Apply a full palette preset onto siteOverride.branding.themeDark or themeLight. */
export function applyColorPreset(
  override: MonthlyEventSiteOverride,
  preset: ColorPreset,
  kind: ThemePaletteKind = 'dark',
): MonthlyEventSiteOverride {
  const dark =
    kind === 'dark'
      ? { ...preset.colors }
      : { ...readPalette(override.branding, 'dark') }
  const light =
    kind === 'light'
      ? { ...preset.colors }
      : { ...readPalette(override.branding, 'light') }
  return {
    ...override,
    branding: writeBranding(
      Object.keys(dark).length ? dark : undefined,
      Object.keys(light).length ? light : undefined,
    ),
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
