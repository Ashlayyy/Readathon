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
