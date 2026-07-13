const THEME_MAP: Record<string, string> = {
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

/** Apply event branding theme colors to CSS custom properties on :root. */
export function applyBrandingTheme(theme: Record<string, string>) {
  const root = document.documentElement
  for (const [key, cssVar] of Object.entries(THEME_MAP)) {
    const value = theme[key]
    if (value) root.style.setProperty(cssVar, value)
  }

  const accent = theme.accent
  if (accent) {
    root.style.setProperty(
      '--realm-body-glow-accent',
      `rgba(${hexToRgb(accent)}, 0.15)`,
    )
  }
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
