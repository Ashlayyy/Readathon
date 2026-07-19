import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { TeamStanding } from './scoring.js'
import { buildSubmitStrategy } from './submit-strategy.js'

function team(
  id: string,
  name: string,
  totalTeamXp: number,
  averagePerMember = totalTeamXp - 100,
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
  it('suggests sabotage when leading but closest rival is close in team XP', () => {
    const standings = [team('sun', 'Sun', 810), team('moon', 'Moon', 780), team('star', 'Star', 650)]
    const result = buildSubmitStrategy(standings, 'sun')
    assert.equal(result.suggestion, 'sabotage')
    assert.equal(result.targetTeamId, 'moon')
  })

  it('suggests add when behind the leader', () => {
    const standings = [team('sun', 'Sun', 820), team('moon', 'Moon', 760), team('star', 'Star', 700)]
    const result = buildSubmitStrategy(standings, 'moon')
    assert.equal(result.suggestion, 'add')
    assert.equal(result.yourRank, 2)
    assert.match(result.reason, /60 team XP/)
  })

  it('targets the highest team XP rival when leading among three teams', () => {
    const standings = [team('sun', 'Sun', 900), team('moon', 'Moon', 850), team('star', 'Star', 820)]
    const result = buildSubmitStrategy(standings, 'sun')
    assert.equal(result.suggestion, 'add')
    assert.match(result.reason, /Moon/)
  })
})
