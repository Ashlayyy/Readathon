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

function assertNoRankLanguage(text: string) {
  assert.doesNotMatch(text, /#\d/)
  assert.doesNotMatch(text, /\b\d+(st|nd|rd|th)\b/i)
  assert.doesNotMatch(text, /\bin the lead\b/i)
  assert.doesNotMatch(text, /\brank(ed)?\b/i)
}

describe('buildSubmitStrategy', () => {
  it('suggests sabotage when leading but closest rival is close in team points', () => {
    const standings = [team('sun', 'Sun', 810), team('moon', 'Moon', 780), team('star', 'Star', 650)]
    const result = buildSubmitStrategy(standings, 'sun')
    assert.equal(result.suggestion, 'sabotage')
    assert.equal(result.targetTeamId, 'moon')
    assert.equal(result.gapToClose, 30)
    assert.equal(result.estimatedCloseBy, 25)
    assertNoRankLanguage(result.reason)
  })

  it('suggests add when behind the leader', () => {
    const standings = [team('sun', 'Sun', 820), team('moon', 'Moon', 760), team('star', 'Star', 700)]
    const result = buildSubmitStrategy(standings, 'moon')
    assert.equal(result.suggestion, 'add')
    assert.equal(result.gapToClose, 60)
    assert.match(result.reason, /60 team points/)
    assertNoRankLanguage(result.reason)
  })

  it('targets the highest team points rival when leading among three teams', () => {
    const standings = [team('sun', 'Sun', 900), team('moon', 'Moon', 850), team('star', 'Star', 820)]
    const result = buildSubmitStrategy(standings, 'sun')
    assert.equal(result.suggestion, 'add')
    assert.match(result.reason, /Moon/)
    assertNoRankLanguage(result.reason)
  })

  it('never includes yourRank and never uses ordinal/rank language in any branch', () => {
    const scenarios: Array<[TeamStanding[], string]> = [
      [[team('sun', 'Sun', 810), team('moon', 'Moon', 780), team('star', 'Star', 650)], 'sun'],
      [[team('sun', 'Sun', 900), team('moon', 'Moon', 500), team('star', 'Star', 400)], 'sun'],
      [[team('sun', 'Sun', 900), team('moon', 'Moon', 850), team('star', 'Star', 820)], 'moon'],
      [[team('sun', 'Sun', 900), team('moon', 'Moon', 850), team('star', 'Star', 500)], 'star'],
      [[team('sun', 'Sun', 900), team('moon', 'Moon', 700), team('star', 'Star', 690), team('void', 'Void', 680)], 'void'],
    ]
    for (const [standings, teamId] of scenarios) {
      const result = buildSubmitStrategy(standings, teamId)
      assert.ok(!('yourRank' in result))
      assertNoRankLanguage(result.reason)
    }
  })

  it('computes rivals with xpGap and a sabotage close-by estimate for each other team', () => {
    const standings = [team('sun', 'Sun', 900), team('moon', 'Moon', 850), team('star', 'Star', 700)]
    const result = buildSubmitStrategy(standings, 'star')
    assert.equal(result.rivals.length, 2)
    const sun = result.rivals.find((r) => r.teamId === 'sun')!
    const moon = result.rivals.find((r) => r.teamId === 'moon')!
    assert.equal(sun.xpGap, 200)
    assert.equal(sun.ifSabotageCloseBy, 25)
    assert.equal(moon.xpGap, 150)
    assert.equal(moon.ifSabotageCloseBy, 25)
  })

  it('caps ifSabotageCloseBy at the actual gap when the gap is small', () => {
    const standings = [team('sun', 'Sun', 810), team('moon', 'Moon', 780), team('star', 'Star', 650)]
    const result = buildSubmitStrategy(standings, 'sun')
    const moon = result.rivals.find((r) => r.teamId === 'moon')!
    assert.equal(moon.xpGap, -30)
    assert.equal(moon.ifSabotageCloseBy, 25)
  })

  it('reports gapToClose null and empty rivals when the team is not found in standings', () => {
    const standings = [team('sun', 'Sun', 900), team('moon', 'Moon', 850)]
    const result = buildSubmitStrategy(standings, 'ghost')
    assert.equal(result.suggestion, null)
    assert.equal(result.gapToClose, null)
    assert.deepEqual(result.rivals, [])
    assertNoRankLanguage(result.reason)
  })
})
