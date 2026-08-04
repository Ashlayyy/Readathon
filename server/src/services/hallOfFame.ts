import { Submission } from '../db/models/Submission.js'
import { User } from '../db/models/User.js'
import { withActive } from '../db/activeSubmission.js'
import { getTeamById } from './prompts.js'

export type HallOfFameEntry = {
  userId: string
  displayName: string
  teamId: string | null
  teamName: string | null
  teamColor: string | null
  value: number
  detail?: string
}

export type HallOfFame = {
  mostBooks: HallOfFameEntry[]
  mostPages: HallOfFameEntry[]
  mostSabotageDealt: HallOfFameEntry[]
  generatedAt: string
}

const TOP_N = 5

/**
 * Season leaders from active submissions (all-time for the current DB season).
 */
export async function buildHallOfFame(): Promise<HallOfFame> {
  const subs = await Submission.find(withActive({})).select(
    'userId pageCount submissionType promptIds',
  )
  const users = await User.find({}).select('displayName teamId')
  const userMap = new Map(
    users.map((u) => [u._id.toString(), u] as const),
  )

  type Acc = {
    books: number
    pages: number
    sabotage: number
  }
  const byUser = new Map<string, Acc>()

  for (const s of subs) {
    const id = s.userId.toString()
    const acc = byUser.get(id) ?? { books: 0, pages: 0, sabotage: 0 }
    acc.books += 1
    acc.pages += Math.max(0, Number(s.pageCount) || 0)
    if (s.submissionType === 'sabotage') {
      // Rough dealt score: count sabotage logs (detailed XP lives in scoring)
      acc.sabotage += 1
    }
    byUser.set(id, acc)
  }

  function toEntries(
    pick: (a: Acc) => number,
    detail: (a: Acc) => string,
  ): HallOfFameEntry[] {
    return [...byUser.entries()]
      .map(([userId, acc]) => {
        const u = userMap.get(userId)
        const team = u?.teamId ? getTeamById(u.teamId) : null
        return {
          userId,
          displayName: u?.displayName ?? 'Unknown reader',
          teamId: u?.teamId ?? null,
          teamName: team?.name ?? null,
          teamColor: team?.color ?? null,
          value: pick(acc),
          detail: detail(acc),
        }
      })
      .filter((e) => e.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, TOP_N)
  }

  return {
    mostBooks: toEntries((a) => a.books, (a) => `${a.books} books`),
    mostPages: toEntries(
      (a) => a.pages,
      (a) => `${a.pages.toLocaleString()} pages`,
    ),
    mostSabotageDealt: toEntries(
      (a) => a.sabotage,
      (a) => `${a.sabotage} sabotage log${a.sabotage === 1 ? '' : 's'}`,
    ),
    generatedAt: new Date().toISOString(),
  }
}
