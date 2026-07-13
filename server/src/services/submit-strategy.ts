import { calculateStandings } from './scoring.js'

const CLOSE_AVG_GAP = 10

export type SubmitStrategy = {
  standingsAvailable: boolean
  yourRank: number | null
  yourTeamId: string | null
  yourTeamName: string | null
  suggestion: 'add' | 'sabotage' | null
  targetTeamId: string | null
  targetTeamName: string | null
  reason: string
}

export async function getSubmitStrategy(userTeamId: string): Promise<SubmitStrategy> {
  const standings = await calculateStandings()
  return buildSubmitStrategy(standings, userTeamId)
}

export function buildSubmitStrategy(
  standings: Awaited<ReturnType<typeof calculateStandings>>,
  userTeamId: string,
): SubmitStrategy {
  const myIndex = standings.findIndex((t) => t.teamId === userTeamId)

  if (myIndex === -1) {
    return {
      standingsAvailable: true,
      yourRank: null,
      yourTeamId: userTeamId,
      yourTeamName: null,
      suggestion: null,
      targetTeamId: null,
      targetTeamName: null,
      reason: 'Pick add XP to help your realm, or sabotage to slow a rival.',
    }
  }

  const my = standings[myIndex]!
  const leader = standings[0]!
  const runnerUp = standings[1]
  const rank = myIndex + 1

  if (rank === 1 && runnerUp) {
    const avgGap = leader.averagePerMember - runnerUp.averagePerMember
    if (avgGap <= CLOSE_AVG_GAP) {
      return {
        standingsAvailable: true,
        yourRank: rank,
        yourTeamId: my.teamId,
        yourTeamName: my.teamName,
        suggestion: 'sabotage',
        targetTeamId: runnerUp.teamId,
        targetTeamName: runnerUp.teamName,
        reason: `${runnerUp.teamName} is close behind (${avgGap} avg/person). Sabotage protects your lead.`,
      }
    }
    return {
      standingsAvailable: true,
      yourRank: rank,
      yourTeamId: my.teamId,
      yourTeamName: my.teamName,
      suggestion: 'add',
      targetTeamId: null,
      targetTeamName: null,
      reason: `You're in the lead. Adding XP widens the gap over ${runnerUp.teamName}.`,
    }
  }

  if (rank === 1) {
    return {
      standingsAvailable: true,
      yourRank: rank,
      yourTeamId: my.teamId,
      yourTeamName: my.teamName,
      suggestion: 'add',
      targetTeamId: null,
      targetTeamName: null,
      reason: "You're in the lead — keep adding XP to stay ahead.",
    }
  }

  const gapToLeader = leader.averagePerMember - my.averagePerMember

  if (rank === 2 && gapToLeader <= CLOSE_AVG_GAP) {
    return {
      standingsAvailable: true,
      yourRank: rank,
      yourTeamId: my.teamId,
      yourTeamName: my.teamName,
      suggestion: 'add',
      targetTeamId: null,
      targetTeamName: null,
      reason: `You're #2, only ${gapToLeader} avg/person behind ${leader.teamName}. Adding XP is the fastest way to catch up.`,
    }
  }

  return {
    standingsAvailable: true,
    yourRank: rank,
    yourTeamId: my.teamId,
    yourTeamName: my.teamName,
    suggestion: 'add',
    targetTeamId: null,
    targetTeamName: null,
    reason: `You're #${rank}. Adding XP helps ${my.teamName} climb — sabotage only helps if you want to slow a specific rival.`,
  }
}
