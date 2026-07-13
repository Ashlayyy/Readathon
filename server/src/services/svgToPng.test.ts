import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { generateStandingsSvg } from './standings-image.js'
import { isPngBuffer, svgToPng } from './svgToPng.js'

describe('svgToPng', () => {
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
          xpLost: 50,
          netXp: 350,
          averagePerMember: 29.2,
        },
        {
          teamId: 'b',
          teamName: 'Realm Beta',
          icon: 'B',
          color: '#4a90d4',
          memberCount: 10,
          xpGained: 300,
          xpLost: 80,
          netXp: 220,
          averagePerMember: 22,
        },
      ],
      'Test Event — Week 1',
    )

    const png = svgToPng(svg)
    assert.ok(Buffer.isBuffer(png))
    assert.ok(isPngBuffer(png))
    assert.ok(png.length > 1000)
  })
})
