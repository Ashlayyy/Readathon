import { ref } from 'vue'

export type ThemeMode = 'dark' | 'light' | 'custom'

export type ThemeColors = {
  background: string
  surface: string
  surfaceAlt: string
  text: string
  textMuted: string
  accent: string
  accentGlow: string
  border: string
  success: string
}

export type SavedCustomTheme = {
  id: string
  name: string
  colors: ThemeColors
}

type PersistedThemeState = {
  mode: ThemeMode
  custom?: ThemeColors
  savedCustoms?: SavedCustomTheme[]
}

const STORAGE_KEY = 'realm-theme-v1'

/** Matches the hardcoded defaults in assets/main.css. */
export const DARK_PRESET: ThemeColors = {
  background: '#08070b',
  surface: '#12101a',
  surfaceAlt: '#1c1928',
  text: '#f4efe8',
  textMuted: '#9a9188',
  accent: '#d4634a',
  accentGlow: '#ff8a6a',
  border: '#2e2a3d',
  success: '#6ecf8a',
}

/** Charcoal ink on soft stone — readable light mode, coral accent. */
export const LIGHT_PRESET: ThemeColors = {
  background: '#f1ece2',
  surface: '#fbf8f2',
  surfaceAlt: '#e8e1d3',
  text: '#2b2620',
  textMuted: '#6b6255',
  accent: '#c8563d',
  accentGlow: '#a8442e',
  border: '#d5cbb8',
  success: '#2f7a4f',
}

const CSS_VAR_MAP: Record<keyof ThemeColors, string> = {
  background: '--realm-bg',
  surface: '--realm-surface',
  surfaceAlt: '--realm-surface-alt',
  text: '--realm-text',
  textMuted: '--realm-text-muted',
  accent: '--realm-accent',
  accentGlow: '--realm-accent-glow',
  border: '--realm-border',
  success: '--realm-success',
}

function hexToRgb(hex: string): string {
  const normalized = hex.replace('#', '')
  const full =
    normalized.length === 3
      ? normalized
          .split('')
          .map((c) => c + c)
          .join('')
      : normalized
  const n = Number.parseInt(full, 16)
  if (Number.isNaN(n)) return '212, 99, 74'
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`
}

const mode = ref<ThemeMode>('dark')
const customColors = ref<ThemeColors>({ ...DARK_PRESET })
const savedCustoms = ref<SavedCustomTheme[]>([])
let initialized = false

function loadState(): PersistedThemeState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as PersistedThemeState
  } catch {
    return null
  }
}

function persist() {
  try {
    const state: PersistedThemeState = {
      mode: mode.value,
      // Always keep custom draft so switching back to Custom restores it
      custom: customColors.value,
      savedCustoms: savedCustoms.value.length ? savedCustoms.value : undefined,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // private mode / quota — in-memory theme still works this session
  }
}

function activeColors(): ThemeColors {
  if (mode.value === 'custom') return customColors.value
  if (mode.value === 'light') return LIGHT_PRESET
  return DARK_PRESET
}

/**
 * Push theme tokens onto :root. Also sets companion vars the rest of the CSS
 * depends on (aliases, shadow, bg art opacity, color-scheme).
 */
function applyColors(colors: ThemeColors, forMode: ThemeMode) {
  const root = document.documentElement
  const isLight = forMode === 'light' || (
    forMode === 'custom' &&
    // Heuristic: treat custom as "light-ish" when background is bright
    luminance(colors.background) > 0.55
  )

  for (const key of Object.keys(CSS_VAR_MAP) as (keyof ThemeColors)[]) {
    root.style.setProperty(CSS_VAR_MAP[key], colors[key])
  }

  root.style.setProperty('--color-background', colors.background)
  root.style.setProperty('--color-background-soft', colors.surface)
  root.style.setProperty('--color-background-mute', colors.surfaceAlt)
  root.style.setProperty('--color-border', colors.border)
  root.style.setProperty('--color-heading', colors.text)
  root.style.setProperty('--color-text', colors.textMuted)
  root.style.setProperty('--color-text-muted', colors.textMuted)
  root.style.setProperty('--color-accent', colors.accent)
  root.style.setProperty('--color-accent-hover', colors.accentGlow)

  root.style.setProperty(
    '--realm-body-glow-accent',
    `rgba(${hexToRgb(colors.accent)}, ${isLight ? '0.12' : '0.1'})`,
  )
  root.style.setProperty(
    '--realm-bg-image-opacity',
    isLight ? '0.07' : '0.22',
  )
  root.style.setProperty(
    '--shadow',
    isLight
      ? '0 8px 28px rgba(43, 38, 32, 0.12)'
      : '0 8px 32px rgba(0, 0, 0, 0.35)',
  )
  root.style.setProperty(
    '--realm-overlay',
    isLight ? 'rgba(43, 38, 32, 0.35)' : 'rgba(0, 0, 0, 0.65)',
  )

  root.style.colorScheme = isLight ? 'light' : 'dark'
  root.dataset.theme = forMode === 'custom' ? (isLight ? 'light' : 'dark') : forMode
  root.dataset.themeMode = forMode
}

function luminance(hex: string): number {
  const rgb = hexToRgb(hex)
    .split(',')
    .map((s) => Number(s.trim()) / 255)
  if (rgb.length < 3 || rgb.some((n) => Number.isNaN(n))) return 0
  // Relative luminance approximation
  return 0.2126 * rgb[0]! + 0.7152 * rgb[1]! + 0.0722 * rgb[2]!
}

function applyTheme() {
  applyColors(activeColors(), mode.value)
}

function init() {
  if (initialized) return
  initialized = true

  const saved = loadState()
  if (saved) {
    if (saved.mode === 'dark' || saved.mode === 'light' || saved.mode === 'custom') {
      mode.value = saved.mode
    }
    if (saved.custom) customColors.value = { ...DARK_PRESET, ...saved.custom }
    if (saved.savedCustoms) savedCustoms.value = saved.savedCustoms
  }

  applyTheme()
}

function setMode(next: ThemeMode) {
  // Entering custom: seed from current preset if custom draft is still a preset clone
  if (next === 'custom' && mode.value !== 'custom') {
    const current = mode.value === 'light' ? LIGHT_PRESET : DARK_PRESET
    // Only seed if they haven't customized yet (still equal to a preset)
    const draft = customColors.value
    const looksLikePreset =
      Object.keys(DARK_PRESET).every(
        (k) =>
          draft[k as keyof ThemeColors] === DARK_PRESET[k as keyof ThemeColors] ||
          draft[k as keyof ThemeColors] === LIGHT_PRESET[k as keyof ThemeColors],
      )
    if (looksLikePreset) {
      customColors.value = { ...current }
    }
  }
  mode.value = next
  applyTheme()
  persist()
}

/** Nav moon/sun: always flips between dark and light (leaves custom drafts intact). */
function toggleDarkLight() {
  setMode(mode.value === 'light' ? 'dark' : 'light')
}

function setCustomColor(key: keyof ThemeColors, value: string) {
  customColors.value = { ...customColors.value, [key]: value }
  if (mode.value !== 'custom') mode.value = 'custom'
  applyTheme()
  persist()
}

function resetCustomToPreset(preset: 'dark' | 'light') {
  customColors.value = { ...(preset === 'dark' ? DARK_PRESET : LIGHT_PRESET) }
  mode.value = 'custom'
  applyTheme()
  persist()
}

function saveCustomTheme(name: string): string {
  const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  savedCustoms.value = [
    ...savedCustoms.value,
    { id, name: name.trim() || 'Untitled theme', colors: { ...customColors.value } },
  ]
  persist()
  return id
}

function deleteSavedTheme(id: string) {
  savedCustoms.value = savedCustoms.value.filter((t) => t.id !== id)
  persist()
}

function loadSavedTheme(id: string) {
  const found = savedCustoms.value.find((t) => t.id === id)
  if (!found) return
  customColors.value = { ...found.colors }
  mode.value = 'custom'
  applyTheme()
  persist()
}

export function useTheme() {
  init()

  return {
    mode,
    customColors,
    savedCustoms,
    presets: { dark: DARK_PRESET, light: LIGHT_PRESET },
    setMode,
    toggleDarkLight,
    setCustomColor,
    resetCustomToPreset,
    saveCustomTheme,
    deleteSavedTheme,
    loadSavedTheme,
    applyTheme,
  }
}
