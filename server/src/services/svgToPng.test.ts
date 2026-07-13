import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Resvg } from '@resvg/resvg-js'
import { generateStandingsSvg } from './standings-image.js'
import { isPngBuffer, svgToPng } from './svgToPng.js'
import { getSvgTextPathStatus, outlineSvgText } from '../lib/svgTextPaths.js'

describe('svgToPng', () => {
  it('has TTF fonts available for path-based text', () => {
    assert.ok(getSvgTextPathStatus().ready, 'expected DejaVu TTF files in server/assets/fonts')
  })

  it('converts standings SVG to a valid PNG buffer', () => {
    const svg = generateStandingsSvg(
      [
        {
          teamId: 'a',
          teamName: 'Realm Alpha',
          icon: 'A',
          color: '#d4634a',
          memberCount: 12,
          xpGained: 400,
          xpDealt: 50,
          xpLost: 50,
          netXp: 350,
          totalTeamXp: 750,
          averagePerMember: 37.5,
        },
        {
          teamId: 'b',
          teamName: 'Realm Beta',
          icon: 'B',
          color: '#4a90d4',
          memberCount: 10,
          xpGained: 300,
          xpDealt: 20,
          xpLost: 80,
          netXp: 220,
          totalTeamXp: 620,
          averagePerMember: 32,
        },
      ],
      'Week of Jul 13, 2026',
    )

    const png = svgToPng(svg)
    assert.ok(Buffer.isBuffer(png))
    assert.ok(isPngBuffer(png))
    assert.ok(png.length > 1000)

    const outlined = outlineSvgText(svg)
    assert.ok(!outlined.includes('<text'), 'text should be converted to paths before rasterizing')
    const pngNoFonts = new Resvg(outlined, {
      background: '#0f0e14',
      fitTo: { mode: 'width', value: 1200 },
      font: { loadSystemFonts: false },
    })
      .render()
      .asPng()
    assert.ok(pngNoFonts.length > 1000)

    const svgEmpty = outlined.replace(/<path\b[^>]*fill="#(?:f0ebe3|a89f94|c45c3e|7ec89a|d4634a|6a635a)[^"]*"[^>]*\/>/g, '')
    const pngEmpty = new Resvg(svgEmpty, {
      background: '#0f0e14',
      fitTo: { mode: 'width', value: 1200 },
      font: { loadSystemFonts: false },
    })
      .render()
      .asPng()
    assert.ok(pngNoFonts.length > pngEmpty.length + 500, 'PNG with text paths should be substantially larger')
  })
})
