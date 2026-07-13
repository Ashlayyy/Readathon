import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { Resvg } from '@resvg/resvg-js'

const require = createRequire(import.meta.url)

function bundledFontBuffers(): Buffer[] {
  let pkgDir: string
  try {
    pkgDir = dirname(require.resolve('@fontsource/dejavu-sans/package.json'))
  } catch {
    return []
  }

  const filesDir = join(pkgDir, 'files')
  const candidates = [
    'dejavu-sans-latin-400-normal.woff2',
    'dejavu-sans-latin-700-normal.woff2',
  ]

  return candidates
    .map((name) => join(filesDir, name))
    .filter((path) => existsSync(path))
    .map((path) => readFileSync(path))
}

function resvgFontOptions() {
  const fontBuffers = bundledFontBuffers()
  return {
    loadSystemFonts: false,
    fontBuffers,
    defaultFontFamily: 'DejaVu Sans',
    sansSerifFamily: 'DejaVu Sans',
    serifFamily: 'DejaVu Sans',
    monospaceFamily: 'DejaVu Sans',
  }
}

/** Rasterize standings SVG to PNG for Discord (SVG uploads are unreliable in webhooks). */
export function svgToPng(svg: string, width = 1200): Buffer {
  const resvg = new Resvg(svg, {
    background: '#0f0e14',
    fitTo: { mode: 'width', value: width },
    font: resvgFontOptions(),
  })
  return resvg.render().asPng()
}

export function isPngBuffer(data: Buffer): boolean {
  return data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
}
