import { Resvg } from '@resvg/resvg-js'

/** Rasterize standings SVG to PNG for Discord (SVG uploads are unreliable in webhooks). */
export function svgToPng(svg: string, width = 1200): Buffer {
  const resvg = new Resvg(svg, {
    background: '#0f0e14',
    fitTo: { mode: 'width', value: width },
    font: {
      // In minimal server/container images there may be no fonts available.
      // Resvg will render *no text* if it can't resolve a font, so we opt into
      // system fonts and provide a reasonable default family.
      loadSystemFonts: true,
      defaultFontFamily: 'DejaVu Sans',
    },
  })
  return resvg.render().asPng()
}

export function isPngBuffer(data: Buffer): boolean {
  return data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
}
