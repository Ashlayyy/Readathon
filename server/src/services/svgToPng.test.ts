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
  })
})
