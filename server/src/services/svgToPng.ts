import { Resvg } from '@resvg/resvg-js'
import { injectSvgFonts, loadBundledFontBuffers } from '../lib/svgFonts.js'
import { outlineSvgText } from '../lib/svgTextPaths.js'

function prepareSvgForPng(svg: string): string {
  return outlineSvgText(injectSvgFonts(svg))
}

function rasterize(svg: string, width: number): Buffer {
  const fontBuffers = loadBundledFontBuffers()
  const resvg = new Resvg(svg, {
    background: '#0f0e14',
    fitTo: { mode: 'width', value: width },
    font: {
      loadSystemFonts: fontBuffers.length === 0,
      fontBuffers,
      defaultFontFamily: 'DejaVu Sans',
      sansSerifFamily: 'DejaVu Sans',
      serifFamily: 'DejaVu Sans',
      monospaceFamily: 'DejaVu Sans',
      // fontBuffers is supported at runtime; resvg-js typings are incomplete
    } as { loadSystemFonts: boolean; defaultFontFamily: string; sansSerifFamily: string },
  })
  return resvg.render().asPng()
}

/** Rasterize standings SVG to PNG for Discord (SVG uploads are unreliable in webhooks). */
export function svgToPng(svg: string, width = 1200): Buffer {
  return rasterize(prepareSvgForPng(svg), width)
}

/** Profile cards skip text outlining. Embedded fonts are enough and the page flip stays quick. */
export function svgToPngFast(svg: string, width = 1100): Buffer {
  return rasterize(injectSvgFonts(svg), width)
}

export function isPngBuffer(data: Buffer): boolean {
  return data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
}

export function prepareSvgForPngExport(svg: string): string {
  return prepareSvgForPng(svg)
}
