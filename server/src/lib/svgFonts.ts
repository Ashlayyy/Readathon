import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

/** Font stack used in standings SVG — must match bundled fonts below. */
export const SVG_FONT_SANS = 'DejaVu Sans, sans-serif'

const ASSETS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../assets/fonts')
const require = createRequire(import.meta.url)

const FONT_CANDIDATES: Array<{ file: string; weight: number }> = [
  { file: 'dejavu-sans-latin-400-normal.woff2', weight: 400 },
  { file: 'dejavu-sans-latin-700-normal.woff2', weight: 700 },
]

function resolveFontPath(filename: string): string | null {
  const assetPath = join(ASSETS_DIR, filename)
  if (existsSync(assetPath)) return assetPath

  try {
    const pkgDir = dirname(require.resolve('@fontsource/dejavu-sans/package.json'))
    const npmPath = join(pkgDir, 'files', filename)
    if (existsSync(npmPath)) return npmPath
  } catch {
    // @fontsource optional at runtime if assets are present
  }

  return null
}

export function loadBundledFontBuffers(): Buffer[] {
  return FONT_CANDIDATES.map(({ file }) => resolveFontPath(file))
    .filter((path): path is string => path !== null)
    .map((path) => readFileSync(path))
}

let cachedFontFaceStyles: string | null | undefined

function buildFontFaceStyles(): string | null {
  const rules = FONT_CANDIDATES.map(({ file, weight }) => {
    const path = resolveFontPath(file)
    if (!path) return null
    const base64 = readFileSync(path).toString('base64')
    return `@font-face{font-family:'DejaVu Sans';font-style:normal;font-weight:${weight};src:url('data:font/woff2;base64,${base64}') format('woff2');}`
  }).filter((rule): rule is string => rule !== null)

  if (rules.length === 0) return null
  return `<defs><style><![CDATA[${rules.join('')}]]></style></defs>`
}

/** Inline @font-face rules so resvg can render text without system fonts. */
export function getSvgFontFaceStyles(): string | null {
  if (cachedFontFaceStyles !== undefined) return cachedFontFaceStyles
  cachedFontFaceStyles = buildFontFaceStyles()
  return cachedFontFaceStyles
}

export function getSvgFontStatus(): { ready: boolean; files: number } {
  const files = FONT_CANDIDATES.map(({ file }) => resolveFontPath(file)).filter(Boolean).length
  return { ready: files > 0, files }
}

/** Ensure SVG carries embedded fonts before rasterizing to PNG. */
export function injectSvgFonts(svg: string): string {
  const styles = getSvgFontFaceStyles()
  if (!styles || svg.includes("@font-face{font-family:'DejaVu Sans'")) return svg
  return svg.replace(/(<svg\b[^>]*>)/i, `$1${styles}`)
}
