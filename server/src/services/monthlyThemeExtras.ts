import { User } from '../db/models/User.js'
import { Submission } from '../db/models/Submission.js'
import { withActive } from '../db/activeSubmission.js'
import { getTeamById } from './prompts.js'
import { renderTeamChatTemplate } from './teamChatMessage.js'
import type {
  ActiveMonthlyEventPublic,
  MonthlyEventSlot,
  MonthlyReaderOfMonthPublic,
} from './monthlyEvents.js'
import { toActiveMonthlyEventPublic } from './monthlyEvents.js'
import { getActiveMonthlyEventSync } from './siteSettings.js'

function publicAvatar(user: {
  avatarUrl?: string | null
  googleAvatarUrl?: string | null
}): string | null {
  const custom = user.avatarUrl?.trim()
  if (custom) return custom
  const google = user.googleAvatarUrl?.trim()
  if (google) return google
  return null
}

function dayStart(iso: string): Date {
  const d = new Date(`${iso}T00:00:00.000`)
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${iso}`)
  return d
}

function dayEndExclusive(iso: string): Date {
  const d = dayStart(iso)
  d.setDate(d.getDate() + 1)
  return d
}

type ReaderAgg = { books: number; pages: number; points: number }

async function topReaderFromFilter(
  filter: Record<string, unknown>,
): Promise<{ userId: string; books: number; points: number } | null> {
  const subs = await Submission.find(withActive(filter))
    .select('userId pageCount totalImpact pageBonus submissionType')
    .lean()
  if (subs.length === 0) return null

  const byUser = new Map<string, ReaderAgg>()
  for (const sub of subs) {
    const uid = String(sub.userId)
    const row = byUser.get(uid) ?? { books: 0, pages: 0, points: 0 }
    row.books++
    row.pages += Number(sub.pageCount) || 0
    if (sub.submissionType === 'add') {
      row.points += Number(sub.totalImpact) || 0
    } else {
      row.points += Number(sub.pageBonus) || 0
    }
    byUser.set(uid, row)
  }

  const ranked = [...byUser.entries()].sort((a, b) => {
    const [idA, ra] = a
    const [idB, rb] = b
    if (rb.books !== ra.books) return rb.books - ra.books
    if (rb.pages !== ra.pages) return rb.pages - ra.pages
    if (rb.points !== ra.points) return rb.points - ra.points
    return idA.localeCompare(idB)
  })
  const top = ranked[0]
  if (!top) return null
  return { userId: top[0], books: top[1].books, points: top[1].points }
}

async function publicReaderFromUserId(
  userId: string,
  opts: {
    shoutout: string
    auto: boolean
    books: number
    points: number
    source: MonthlyReaderOfMonthPublic['source']
  },
): Promise<MonthlyReaderOfMonthPublic | null> {
  const user = await User.findById(userId).lean()
  if (!user) return null
  return {
    userId: user._id.toString(),
    displayName: user.displayName,
    avatarUrl: publicAvatar(user),
    teamName: user.teamId ? getTeamById(user.teamId)?.name ?? null : null,
    shoutout: opts.shoutout,
    auto: opts.auto,
    books: opts.books,
    points: opts.points,
    source: opts.source,
  }
}

/**
 * Top reader by books (then pages) in the theme date window, or manual override.
 * Date match uses submission createdAt OR finishedAt (YYYY-MM-DD) in range.
 * Falls back to all-time top reader if the window is empty.
 */
export async function resolveReaderOfMonth(
  slot: Pick<MonthlyEventSlot, 'from' | 'to' | 'readerOfMonth'>,
): Promise<MonthlyReaderOfMonthPublic | null> {
  const shoutout = slot.readerOfMonth?.shoutout?.trim() || ''
  const overrideId = slot.readerOfMonth?.userId?.trim() || ''

  if (overrideId) {
    return publicReaderFromUserId(overrideId, {
      shoutout,
      auto: false,
      books: 0,
      points: 0,
      source: 'override',
    })
  }

  try {
    const from = dayStart(slot.from)
    const toExclusive = dayEndExclusive(slot.to)
    const inRange = await topReaderFromFilter({
      $or: [
        { createdAt: { $gte: from, $lt: toExclusive } },
        {
          finishedAt: {
            $type: 'string',
            $gte: slot.from,
            $lte: slot.to,
          },
        },
      ],
    })
    if (inRange) {
      return publicReaderFromUserId(inRange.userId, {
        shoutout,
        auto: true,
        books: inRange.books,
        points: inRange.points,
        source: 'range',
      })
    }

    // Theme window empty (future draft / quiet month) — show all-time leader so preview isn't blank.
    const allTime = await topReaderFromFilter({})
    if (!allTime) return null
    return publicReaderFromUserId(allTime.userId, {
      shoutout,
      auto: true,
      books: allTime.books,
      points: allTime.points,
      source: 'allTime',
    })
  } catch (e) {
    console.error('[monthly-theme] failed to resolve reader of the month:', e)
    return null
  }
}

export async function enrichActiveMonthlyEvent(
  slot: MonthlyEventSlot,
): Promise<ActiveMonthlyEventPublic> {
  const base = toActiveMonthlyEventPublic(slot)
  const readerOfMonth = await resolveReaderOfMonth(slot)
  return {
    ...base,
    imageUrl: slot.imageUrl?.trim() || null,
    readerOfMonth,
  }
}

/** Live theme Discord template pools / captions (null if no live theme). */
export function getLiveMonthlyDiscordTemplates(): MonthlyEventSlot['discordTemplates'] | null {
  const live = getActiveMonthlyEventSync()
  return live?.discordTemplates ?? null
}

export function renderDiscordCaption(
  template: string | undefined | null,
  vars: Record<string, string>,
  fallback: string,
): string {
  const t = template?.trim()
  if (!t) return fallback
  return renderTeamChatTemplate(t, vars)
}
