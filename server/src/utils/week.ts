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
 * Default publish window: last Monday 00:00 → this Monday end-of-day (inclusive).
 * Both Mondays are included when publishing on a Monday afternoon.
 */
export function getDefaultPublishRange(now = new Date()): {
  from: Date
  toExclusive: Date
  fromInput: string
  toInput: string
  weekLabel: string
  weekKey: string
  preset: PublishRangePreset
  label: string
} {
  const thisMon = startOfIsoWeek(now)
  const lastMon = new Date(thisMon)
  lastMon.setDate(lastMon.getDate() - 7)
  const toExclusive = endOfDayExclusive(thisMon)
  const { weekKey } = getWeekInfo(lastMon)
  const weekLabel = `Week of ${lastMon.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`
  const fromInput = toDateInputValue(lastMon)
  const toInput = toDateInputValue(thisMon)
  return {
    from: lastMon,
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
  const now = opts.now ?? new Date()
  const presetRaw = (opts.preset ?? 'lastMonToThisMon').trim() || 'lastMonToThisMon'

  if (presetRaw === 'custom') {
    const fromInput = (opts.from ?? '').trim() || toDateInputValue(startOfIsoWeek(now))
    const toInput = (opts.to ?? '').trim() || toDateInputValue(now)
    const from = startOfDay(parseYmd(fromInput) ?? startOfIsoWeek(now))
    const toDay = startOfDay(parseYmd(toInput) ?? now)
    const toExclusive = endOfDayExclusive(toDay)
    const { weekKey } = getWeekInfo(from)
    const weekLabel = `Week of ${from.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })}`
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
    const { weekKey, weekLabel } = getWeekInfo(from)
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
    const weekLabel = `Week of ${from.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })}`
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
    const weekLabel = `Week of ${from.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })}`
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

  return getDefaultPublishRange(now)
}

function parseYmd(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  if (Number.isNaN(d.getTime())) return null
  return d
}
