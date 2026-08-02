import { getStaticConfig } from '../config.js'

/** Calendar Y-M-D in a timezone, as a local Date at noon (stable for week math / DST). */
export function calendarDateInTimeZone(now: Date, timeZone: string): Date {
  try {
    const formatted = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now)
    const match = formatted.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!match) throw new Error('bad format')
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0)
  } catch {
    const d = new Date(now)
    d.setHours(12, 0, 0, 0)
    return d
  }
}

/** Season start from config (`schedule.readathonStart`, e.g. "July 1"). */
export function getSeasonStartDate(reference = new Date()): Date {
  const schedule = getStaticConfig().schedule as { readathonStart?: string }
  const raw = String(schedule.readathonStart ?? 'July 1').trim()
  const year = reference.getFullYear()
  const parsed = new Date(`${raw}, ${year}`)
  if (Number.isNaN(parsed.getTime())) {
    return startOfDay(new Date(year, 6, 1))
  }
  return startOfDay(parsed)
}

/**
 * Challenge week number: Week 1 starts on readathon start day (not ISO calendar week).
 * Uses the reference date’s calendar day (typically the range end / publish Monday).
 */
export function getChallengeWeekNumber(
  referenceDate: Date,
  seasonStart = getSeasonStartDate(referenceDate),
): number {
  const start = startOfDay(seasonStart)
  const ref = startOfDay(referenceDate)
  if (ref.getTime() < start.getTime()) return 1
  const diffDays = Math.floor((ref.getTime() - start.getTime()) / 86400000)
  return Math.floor(diffDays / 7) + 1
}

function formatDay(d: Date, withYear: boolean): string {
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' as const } : {}),
  })
}

/**
 * e.g. "Week 31 - Jul 27 - Aug 3, 2026"
 * Uses the ISO calendar week of the range start (Monday), not challenge-week-from-season-start.
 */
export function buildPublishWeekLabel(from: Date, toInclusive: Date): string {
  const { weekKey } = getWeekInfo(from)
  const match = weekKey.match(/W(\d+)$/i)
  const weekNum = match ? parseInt(match[1]!, 10) : getChallengeWeekNumber(toInclusive)
  const sameYear = from.getFullYear() === toInclusive.getFullYear()
  const fromStr = formatDay(from, !sameYear)
  const toStr = formatDay(toInclusive, true)
  return `Week ${weekNum} - ${fromStr} - ${toStr}`
}

export function getWeekInfo(date = new Date()): { weekKey: string; weekLabel: string } {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const week1 = new Date(d.getFullYear(), 0, 4)
  const weekNum =
    1 +
    Math.round(
      ((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7,
    )
  const monday = startOfIsoWeek(date)
  const weekKey = `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
  // Keep a simple Monday label for non-publish callers; publish ranges use buildPublishWeekLabel.
  const weekLabel = `Week of ${monday.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`
  return { weekKey, weekLabel }
}

/** Monday 00:00:00 local for the ISO week containing `date`. */
export function startOfIsoWeek(date = new Date()): Date {
  const monday = new Date(date)
  monday.setHours(0, 0, 0, 0)
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  return monday
}

/** Exclusive end = next Monday 00:00. */
export function endOfIsoWeek(date = new Date()): Date {
  const end = startOfIsoWeek(date)
  end.setDate(end.getDate() + 7)
  return end
}

/**
 * Parse `2026-W29` into [monday, nextMonday).
 * Falls back to current week if the key is unparseable.
 */
export function getWeekBoundsFromKey(weekKey: string): { from: Date; to: Date } {
  const match = weekKey.match(/^(\d{4})-W(\d{1,2})$/i)
  if (!match) {
    return { from: startOfIsoWeek(), to: endOfIsoWeek() }
  }
  const year = Number(match[1])
  const week = Number(match[2])
  // ISO: week 1 contains Jan 4
  const jan4 = new Date(year, 0, 4)
  const monday = startOfIsoWeek(jan4)
  monday.setDate(monday.getDate() + (week - 1) * 7)
  const to = new Date(monday)
  to.setDate(to.getDate() + 7)
  return { from: monday, to }
}

export function toDateInputValue(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Start of calendar day (local). */
export function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

/** End of calendar day inclusive → next midnight exclusive. */
export function endOfDayExclusive(date: Date): Date {
  const d = startOfDay(date)
  d.setDate(d.getDate() + 1)
  return d
}

export type PublishRangePreset =
  | 'lastMonToThisMon'
  | 'thisWeek'
  | 'lastWeek'
  | 'last7'
  | 'custom'

/**
 * Monday that ends the current standings/vibes publish window (Amsterdam calendar).
 * - On Monday: that Monday (week just finished — Monday publish).
 * - Tue–Sun: the upcoming Monday (week still in progress / next publish).
 *
 * Without this, Sunday Aug 2 still treated “this Monday” as Jul 27 and labeled
 * Jul 20–27 — a full week behind what hosts expect when testing mid-week.
 */
export function getPublishPeriodEndMonday(
  now = new Date(),
  timeZone = 'Europe/Amsterdam',
): Date {
  const localNow = calendarDateInTimeZone(now, timeZone)
  const weekStartMon = startOfIsoWeek(localNow)
  // JS: 0=Sun … 1=Mon
  if (localNow.getDay() === 1) return weekStartMon
  const nextMon = new Date(weekStartMon)
  nextMon.setDate(nextMon.getDate() + 7)
  return nextMon
}

/**
 * Default publish window: previous Monday 00:00 → period-end Monday (inclusive).
 * On Monday publish day that is last Mon → this Mon; Tue–Sun it is this Mon → next Mon.
 */
export function getDefaultPublishRange(
  now = new Date(),
  timeZone = 'Europe/Amsterdam',
): {
  from: Date
  toExclusive: Date
  fromInput: string
  toInput: string
  weekLabel: string
  weekKey: string
  preset: PublishRangePreset
  label: string
} {
  const endMon = getPublishPeriodEndMonday(now, timeZone)
  const startMon = new Date(endMon)
  startMon.setDate(startMon.getDate() - 7)
  const toExclusive = endOfDayExclusive(endMon)
  const { weekKey } = getWeekInfo(startMon)
  const weekLabel = buildPublishWeekLabel(startMon, endMon)
  const fromInput = toDateInputValue(startMon)
  const toInput = toDateInputValue(endMon)
  return {
    from: startMon,
    toExclusive,
    fromInput,
    toInput,
    weekLabel,
    weekKey,
    preset: 'lastMonToThisMon',
    label: `${fromInput} → ${toInput} (inclusive)`,
  }
}

/** Resolve a publish vibes/date window from preset or custom YYYY-MM-DD inputs. */
export function resolvePublishRange(opts: {
  preset?: string | null
  from?: string | null
  to?: string | null
  now?: Date
  /** Used so Mon 00:30 Amsterdam is still “Monday” even if the server is on UTC. */
  timeZone?: string | null
}): {
  from: Date
  toExclusive: Date
  fromInput: string
  toInput: string
  weekLabel: string
  weekKey: string
  preset: PublishRangePreset
  label: string
} {
  const timeZone = opts.timeZone?.trim() || 'Europe/Amsterdam'
  const now = calendarDateInTimeZone(opts.now ?? new Date(), timeZone)
  const presetRaw = (opts.preset ?? 'lastMonToThisMon').trim() || 'lastMonToThisMon'

  if (presetRaw === 'custom') {
    const fromInput = (opts.from ?? '').trim() || toDateInputValue(startOfIsoWeek(now))
    const toInput = (opts.to ?? '').trim() || toDateInputValue(now)
    const from = startOfDay(parseYmd(fromInput) ?? startOfIsoWeek(now))
    const toDay = startOfDay(parseYmd(toInput) ?? now)
    const toExclusive = endOfDayExclusive(toDay)
    const { weekKey } = getWeekInfo(from)
    const weekLabel = buildPublishWeekLabel(from, toDay)
    return {
      from,
      toExclusive,
      fromInput: toDateInputValue(from),
      toInput: toDateInputValue(toDay),
      weekLabel,
      weekKey,
      preset: 'custom',
      label: `${toDateInputValue(from)} → ${toDateInputValue(toDay)} (inclusive)`,
    }
  }

  if (presetRaw === 'thisWeek') {
    const from = startOfIsoWeek(now)
    const toExclusive = endOfIsoWeek(now)
    const toDay = new Date(toExclusive)
    toDay.setDate(toDay.getDate() - 1)
    const { weekKey } = getWeekInfo(from)
    const weekLabel = buildPublishWeekLabel(from, toDay)
    return {
      from,
      toExclusive,
      fromInput: toDateInputValue(from),
      toInput: toDateInputValue(toDay),
      weekLabel,
      weekKey,
      preset: 'thisWeek',
      label: `This week (${toDateInputValue(from)} → ${toDateInputValue(toDay)})`,
    }
  }

  if (presetRaw === 'lastWeek') {
    const thisMon = startOfIsoWeek(now)
    const from = new Date(thisMon)
    from.setDate(from.getDate() - 7)
    const toExclusive = thisMon
    const toDay = new Date(toExclusive)
    toDay.setDate(toDay.getDate() - 1)
    const { weekKey } = getWeekInfo(from)
    const weekLabel = buildPublishWeekLabel(from, toDay)
    return {
      from,
      toExclusive,
      fromInput: toDateInputValue(from),
      toInput: toDateInputValue(toDay),
      weekLabel,
      weekKey,
      preset: 'lastWeek',
      label: `Last week (${toDateInputValue(from)} → ${toDateInputValue(toDay)})`,
    }
  }

  if (presetRaw === 'last7') {
    const toDay = startOfDay(now)
    const from = new Date(toDay)
    from.setDate(from.getDate() - 6)
    const toExclusive = endOfDayExclusive(toDay)
    const { weekKey } = getWeekInfo(from)
    const weekLabel = buildPublishWeekLabel(from, toDay)
    return {
      from,
      toExclusive,
      fromInput: toDateInputValue(from),
      toInput: toDateInputValue(toDay),
      weekLabel,
      weekKey,
      preset: 'last7',
      label: `Last 7 days (${toDateInputValue(from)} → ${toDateInputValue(toDay)})`,
    }
  }

  return getDefaultPublishRange(now, timeZone)
}

function parseYmd(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  if (Number.isNaN(d.getTime())) return null
  return d
}
