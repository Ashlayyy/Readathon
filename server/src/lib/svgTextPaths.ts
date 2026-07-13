import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as fontkit from 'fontkit'
import type { Font } from 'fontkit'

const ASSETS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../assets/fonts')

const FONT_FILES = {
  regular: 'DejaVuSans.ttf',
  bold: 'DejaVuSans-Bold.ttf',
} as const

let regularFont: Font | null | undefined
let boldFont: Font | null | undefined

function openFont(filename: string): Font | null {
  const path = join(ASSETS_DIR, filename)
  if (!existsSync(path)) return null
  return fontkit.openSync(path)
}

function getRegularFont(): Font | null {
  if (regularFont !== undefined) return regularFont
  regularFont = openFont(FONT_FILES.regular)
  return regularFont
}

function getBoldFont(): Font | null {
  if (boldFont !== undefined) return boldFont
  boldFont = openFont(FONT_FILES.bold)
  return boldFont
}

export function getSvgTextPathStatus(): { ready: boolean; files: number } {
  const files = [FONT_FILES.regular, FONT_FILES.bold].filter((file) =>
    existsSync(join(ASSETS_DIR, file)),
  ).length
  return { ready: files >= 2, files }
}

function decodeXml(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function readAttr(attrs: string, name: string): string | undefined {
  const match = attrs.match(new RegExp(`\\b${name}="([^"]*)"`))
  return match?.[1]
}

function pickFont(attrs: string): Font | null {
  const weight = readAttr(attrs, 'font-weight')
  const isBold = weight === 'bold' || (weight !== undefined && Number(weight) >= 600)
  return (isBold ? getBoldFont() : getRegularFont()) ?? getRegularFont()
}

function textWidth(font: Font, text: string, fontSize: number): number {
  const run = font.layout(text)
  const scale = fontSize / font.unitsPerEm
  return run.positions.reduce((sum, pos) => sum + pos.xAdvance * scale, 0)
}

function textToPathData(
  font: Font,
  text: string,
  x: number,
  y: number,
  fontSize: number,
  anchor: string | undefined,
): string {
  const scale = fontSize / font.unitsPerEm
  const width = textWidth(font, text, fontSize)
  let startX = x
  if (anchor === 'middle') startX = x - width / 2
  else if (anchor === 'end') startX = x - width

  const run = font.layout(text)
  let cursorX = startX
  const parts: string[] = []

  for (let i = 0; i < run.glyphs.length; i++) {
    const glyph = run.glyphs[i]
    if (!glyph) continue
    const pos = run.positions[i]!
    const glyphPath = glyph.path
      .scale(scale)
      .translate(cursorX + pos.xOffset * scale, y + pos.yOffset * scale)
    parts.push(glyphPath.toSVG())
    cursorX += pos.xAdvance * scale
  }

  return parts.join(' ')
}

function textElementToPath(_match: string, attrs: string, rawText: string): string {
  const text = decodeXml(rawText)
  if (!text) return _match

  const font = pickFont(attrs)
  if (!font) return _match

  const x = Number(readAttr(attrs, 'x') ?? 0)
  const y = Number(readAttr(attrs, 'y') ?? 0)
  const fontSize = Number(readAttr(attrs, 'font-size') ?? 16)
  const fill = readAttr(attrs, 'fill') ?? '#ffffff'
  const anchor = readAttr(attrs, 'text-anchor')

  const d = textToPathData(font, text, x, y, fontSize, anchor)
  if (!d.trim()) return _match

  return `<path d="${d}" fill="${fill}"/>`
}

/** Convert SVG text nodes to filled paths so PNG rasterizers never need font files. */
export function outlineSvgText(svg: string): string {
  if (!getSvgTextPathStatus().ready) return svg
  return svg.replace(/<text\b([^>]*)>([\s\S]*?)<\/text>/g, textElementToPath)
}
