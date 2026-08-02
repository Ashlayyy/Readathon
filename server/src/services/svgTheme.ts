import { getConfig } from './prompts.js'

export type SvgTheme = {
  background: string
  surface: string
  surfaceAlt: string
  text: string
  textMuted: string
  accent: string
  accentGlow: string
  border: string
  success: string
  /** Soft body text between muted and full text */
  textSoft: string
}

const FALLBACK: SvgTheme = {
  background: '#0f0e14',
  surface: '#1a1822',
  surfaceAlt: '#242033',
  text: '#f4efe8',
  textMuted: '#9a9188',
  accent: '#d4634a',
  accentGlow: '#ff8a6a',
  border: '#2a2733',
  success: '#6ecf8a',
  textSoft: '#c9c2b8',
}

function pick(theme: Record<string, unknown>, key: string, fallback: string): string {
  const v = theme[key]
  return typeof v === 'string' && v.trim() ? v.trim() : fallback
}

/**
 * Colors for Discord / standings SVGs from the live site theme
 * (includes active Theme-of-the-Month branding overrides).
 */
export function getSvgTheme(): SvgTheme {
  const branding = getConfig().branding as { theme?: Record<string, unknown> }
  const t = branding?.theme && typeof branding.theme === 'object' ? branding.theme : {}
  return {
    background: pick(t, 'background', FALLBACK.background),
    surface: pick(t, 'surface', FALLBACK.surface),
    surfaceAlt: pick(t, 'surfaceAlt', FALLBACK.surfaceAlt),
    text: pick(t, 'text', FALLBACK.text),
    textMuted: pick(t, 'textMuted', FALLBACK.textMuted),
    accent: pick(t, 'accent', FALLBACK.accent),
    accentGlow: pick(t, 'accentGlow', FALLBACK.accentGlow),
    border: pick(t, 'border', FALLBACK.border),
    success: pick(t, 'success', FALLBACK.success),
    textSoft: FALLBACK.textSoft,
  }
}

/** Event name for image titles — follows live config (themed months included). */
export function getSvgEventName(): string {
  const name = getConfig().event?.name
  return typeof name === 'string' && name.trim() ? name.trim() : 'Readathon'
}
