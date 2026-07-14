import { calculateStandings, type TeamStanding } from './scoring.js'

const CLOSE_TEAM_XP_GAP = 40

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

function teamXpGap(ahead: TeamStanding, behind: TeamStanding): number {
  return ahead.totalTeamXp - behind.totalTeamXp
}

function closestRivalByTeamXp(standings: TeamStanding[], myTeamId: string): TeamStanding | null {
  return (
    standings
      .filter((t) => t.teamId !== myTeamId)
      .sort((a, b) => b.totalTeamXp - a.totalTeamXp)[0] ?? null
  )
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
  const rank = myIndex + 1
  const closestRival = closestRivalByTeamXp(standings, my.teamId)

  if (rank === 1) {
    if (closestRival) {
      const xpGap = teamXpGap(my, closestRival)
      if (xpGap <= CLOSE_TEAM_XP_GAP) {
        return {
          standingsAvailable: true,
          yourRank: rank,
          yourTeamId: my.teamId,
          yourTeamName: my.teamName,
          suggestion: 'sabotage',
          targetTeamId: closestRival.teamId,
          targetTeamName: closestRival.teamName,
          reason: `${closestRival.teamName} is only ${xpGap} team XP behind. Sabotage protects your lead.`,
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
        reason: `You're in the lead by ${xpGap} team XP over ${closestRival.teamName}. Adding XP widens the gap.`,
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
      reason: "You're in the lead — keep adding XP to stay ahead.",
    }
  }

  const gapToLeader = teamXpGap(leader, my)
  const teamAbove = myIndex > 0 ? standings[myIndex - 1]! : null
  const gapToTeamAbove = teamAbove ? teamXpGap(teamAbove, my) : null

  if (gapToLeader <= CLOSE_TEAM_XP_GAP) {
    return {
      standingsAvailable: true,
      yourRank: rank,
      yourTeamId: my.teamId,
      yourTeamName: my.teamName,
      suggestion: 'add',
      targetTeamId: null,
      targetTeamName: null,
      reason: `You're #${rank}, only ${gapToLeader} team XP behind ${leader.teamName}. Adding XP is the fastest way to catch up.`,
    }
  }

  if (rank >= 3 && teamAbove && gapToTeamAbove !== null && gapToTeamAbove <= CLOSE_TEAM_XP_GAP) {
    return {
      standingsAvailable: true,
      yourRank: rank,
      yourTeamId: my.teamId,
      yourTeamName: my.teamName,
      suggestion: 'add',
      targetTeamId: null,
      targetTeamName: null,
      reason: `You're #${rank} — ${gapToTeamAbove} team XP behind ${teamAbove.teamName} and ${gapToLeader} behind ${leader.teamName}. Adding XP helps you climb.`,
    }
  }

  if (rank === 2) {
    return {
      standingsAvailable: true,
      yourRank: rank,
      yourTeamId: my.teamId,
      yourTeamName: my.teamName,
      suggestion: 'add',
      targetTeamId: null,
      targetTeamName: null,
      reason: `You're #2, ${gapToLeader} team XP behind ${leader.teamName}. Adding XP helps ${my.teamName} take the lead.`,
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
    reason: `You're #${rank}, ${gapToLeader} team XP behind ${leader.teamName}. Adding XP helps ${my.teamName} climb — sabotage slows a specific rival.`,
  }
}
