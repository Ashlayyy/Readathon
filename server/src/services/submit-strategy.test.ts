import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { TeamStanding } from './scoring.js'
import { buildSubmitStrategy } from './submit-strategy.js'

function team(
  id: string,
  name: string,
  averagePerMember: number,
  totalTeamXp = 400,
): TeamStanding {
  return {
    teamId: id,
    teamName: name,
    memberCount: 1,
    xpGained: averagePerMember,
    xpDealt: 0,
    xpLost: 0,
    netXp: averagePerMember,
    totalTeamXp,
    averagePerMember,
    color: '#888',
    icon: '◆',
  }
}

describe('buildSubmitStrategy', () => {
  it('suggests sabotage when leading but runner-up is close', () => {
    const standings = [team('sun', 'Sun', 410, 810), team('moon', 'Moon', 405, 805)]
    const result = buildSubmitStrategy(standings, 'sun')
    assert.equal(result.suggestion, 'sabotage')
    assert.equal(result.targetTeamId, 'moon')
  })

  it('suggests add when behind the leader', () => {
    const standings = [team('sun', 'Sun', 420), team('moon', 'Moon', 400)]
    const result = buildSubmitStrategy(standings, 'moon')
    assert.equal(result.suggestion, 'add')
    assert.equal(result.yourRank, 2)
  })
})
