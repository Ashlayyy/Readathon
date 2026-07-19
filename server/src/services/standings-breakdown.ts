import { getConfigWithPrompts } from './prompts.js'
import { User } from '../db/models/User.js'
import { Submission } from '../db/models/Submission.js'
import { withActive } from '../db/activeSubmission.js'

export type MemberContribution = {
  userId: string
  displayName: string
  xpGained: number
  xpDealt: number
  addCount: number
  sabotageCount: number
}

export type IncomingAttack = {
  userId: string
  displayName: string
  attackerTeamId: string
  attackerTeamName: string
  damage: number
}

export type TeamBreakdown = {
  teamId: string
  teamName: string
  color: string
  icon: string
  members: MemberContribution[]
  attacksFromOthers: IncomingAttack[]
}

export type StandingsBreakdown = {
  teams: TeamBreakdown[]
}

export async function calculateStandingsBreakdown(): Promise<StandingsBreakdown> {
  const config = getConfigWithPrompts()
  const assignedUsers = await User.find({ status: 'assigned', teamId: { $ne: null } })
  const userTeamMap = new Map<string, string>()
  const userNameMap = new Map<string, string>()

  for (const u of assignedUsers) {
    if (!u.teamId) continue
    userTeamMap.set(u._id.toString(), u.teamId)
    userNameMap.set(u._id.toString(), u.displayName)
  }

  const memberStats = new Map<
    string,
    { xpGained: number; xpDealt: number; addCount: number; sabotageCount: number }
  >()

  for (const u of assignedUsers) {
    memberStats.set(u._id.toString(), {
      xpGained: 0,
      xpDealt: 0,
      addCount: 0,
      sabotageCount: 0,
    })
  }

  const attacksOnTeam = new Map<string, Map<string, IncomingAttack>>()

  const allSubs = await Submission.find(withActive())
  for (const sub of allSubs) {
    const userId = sub.userId.toString()
    const teamId = userTeamMap.get(userId)
    if (!teamId) continue

    const stats = memberStats.get(userId)
    if (!stats) continue

    const promptAndBonus = sub.promptPoints + sub.bonusPoints

    if (sub.submissionType === 'add') {
      stats.xpGained += promptAndBonus + sub.pageBonus
      stats.addCount++
    } else if (sub.submissionType === 'sabotage' && sub.targetTeamId) {
      const damage = Math.abs(promptAndBonus)
      stats.xpDealt += damage
      stats.xpGained += sub.pageBonus
      stats.sabotageCount++

      const targetAttacks = attacksOnTeam.get(sub.targetTeamId) ?? new Map()
      const key = userId
      const existing = targetAttacks.get(key)
      if (existing) {
        existing.damage += damage
      } else {
        const attackerTeam = config.teams.find((t) => t.id === teamId)
        targetAttacks.set(key, {
          userId,
          displayName: userNameMap.get(userId) ?? 'Unknown',
          attackerTeamId: teamId,
          attackerTeamName: attackerTeam?.name ?? teamId,
          damage,
        })
      }
      attacksOnTeam.set(sub.targetTeamId, targetAttacks)
    }
  }

  const teams: TeamBreakdown[] = config.teams.map((team) => {
    const members = assignedUsers
      .filter((u) => u.teamId === team.id)
      .map((u) => {
        const id = u._id.toString()
        const s = memberStats.get(id)!
        return {
          userId: id,
          displayName: u.displayName,
          xpGained: s.xpGained,
          xpDealt: s.xpDealt,
          addCount: s.addCount,
          sabotageCount: s.sabotageCount,
        }
      })
      .sort((a, b) => {
        const aTotal = a.xpGained + a.xpDealt
        const bTotal = b.xpGained + b.xpDealt
        if (bTotal !== aTotal) return bTotal - aTotal
        if (b.xpDealt !== a.xpDealt) return b.xpDealt - a.xpDealt
        if (b.xpGained !== a.xpGained) return b.xpGained - a.xpGained
        return a.displayName.localeCompare(b.displayName)
      })

    const attacksFromOthers = [...(attacksOnTeam.get(team.id)?.values() ?? [])].sort(
      (a, b) => b.damage - a.damage,
    )

    return {
      teamId: team.id,
      teamName: team.name,
      color: team.color ?? '#888',
      icon: team.icon ?? '◆',
      members,
      attacksFromOthers,
    }
  })

  return { teams }
}
