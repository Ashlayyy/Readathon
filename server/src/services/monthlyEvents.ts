import { randomUUID } from 'node:crypto'
import { calendarDateInTimeZone } from '../utils/week.js'

export type MonthlyEventMultipliers = {
  prompts: number
  bonuses: number
  pageBonus: number
}

export type MonthlyEventSiteOverride = {
  event?: Record<string, unknown>
  copy?: Record<string, unknown>
  branding?: { theme?: Record<string, string> }
}

export type MonthlyEventStatus = 'draft' | 'scheduled'

export type MonthlyEventSlot = {
  id: string
  status: MonthlyEventStatus
  title: string
  blurb: string
  from: string
  to: string
  timezone: string
  multipliers: MonthlyEventMultipliers
  featuredPromptIds: string[]
  siteOverride: MonthlyEventSiteOverride
}

/** Public slice when a scheduled event is currently live. */
export type ActiveMonthlyEventPublic = {
  id: string
  title: string
  blurb: string
  from: string
  to: string
  featuredPromptIds: string[]
  multipliers: MonthlyEventMultipliers
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export const DEFAULT_MULTIPLIERS: MonthlyEventMultipliers = {
  prompts: 1,
  bonuses: 1,
  pageBonus: 1,
}

function clampMultiplier(n: unknown, fallback = 1): number {
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(v) || v < 0) return fallback
  // Cap absurd values so a typo can't nuke standings.
  return Math.min(v, 100)
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined
  return v as Record<string, unknown>
}

function normalizeSiteOverride(raw: unknown): MonthlyEventSiteOverride {
  const obj = asRecord(raw) ?? {}
  const brandingRaw = asRecord(obj.branding)
  const themeRaw = brandingRaw ? asRecord(brandingRaw.theme) : undefined
  const theme =
    themeRaw &&
    Object.fromEntries(
      Object.entries(themeRaw).filter(
        ([, v]) => typeof v === 'string' && v.trim().length > 0,
      ),
    )
  return {
    event: asRecord(obj.event),
    copy: asRecord(obj.copy),
    branding: theme && Object.keys(theme).length > 0 ? { theme: theme as Record<string, string> } : undefined,
  }
}

function normalizeMultipliers(raw: unknown): MonthlyEventMultipliers {
  const obj = asRecord(raw) ?? {}
  return {
    prompts: clampMultiplier(obj.prompts, 1),
    bonuses: clampMultiplier(obj.bonuses, 1),
    pageBonus: clampMultiplier(obj.pageBonus, 1),
  }
}

export function normalizeMonthlyEventSlot(raw: unknown): MonthlyEventSlot | null {
  const obj = asRecord(raw)
  if (!obj) return null
  const from = String(obj.from ?? '').trim()
  const to = String(obj.to ?? '').trim()
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) return null
  if (to < from) return null

  const status: MonthlyEventStatus = obj.status === 'scheduled' ? 'scheduled' : 'draft'
  const featured = Array.isArray(obj.featuredPromptIds)
    ? obj.featuredPromptIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    : []

  return {
    id: typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim() : randomUUID(),
    status,
    title: String(obj.title ?? '').trim(),
    blurb: String(obj.blurb ?? '').trim(),
    from,
    to,
    timezone: String(obj.timezone ?? 'Europe/Amsterdam').trim() || 'Europe/Amsterdam',
    multipliers: normalizeMultipliers(obj.multipliers),
    featuredPromptIds: featured,
    siteOverride: normalizeSiteOverride(obj.siteOverride),
  }
}

export function normalizeMonthlyEvents(raw: unknown): MonthlyEventSlot[] {
  if (!Array.isArray(raw)) return []
  const out: MonthlyEventSlot[] = []
  for (const row of raw) {
    const slot = normalizeMonthlyEventSlot(row)
    if (slot) out.push(slot)
  }
  return out
}

/** Inclusive calendar-day window in the slot timezone. */
export function isMonthlyEventLive(slot: MonthlyEventSlot, now = new Date()): boolean {
  if (slot.status !== 'scheduled') return false
  const today = calendarDateInTimeZone(now, slot.timezone)
  const y = today.getFullYear()
  const m = String(today.getMonth() + 1).padStart(2, '0')
  const d = String(today.getDate()).padStart(2, '0')
  const key = `${y}-${m}-${d}`
  return key >= slot.from && key <= slot.to
}

export function findOverlappingScheduled(
  slots: MonthlyEventSlot[],
  candidate: MonthlyEventSlot,
): MonthlyEventSlot | null {
  if (candidate.status !== 'scheduled') return null
  for (const other of slots) {
    if (other.id === candidate.id) continue
    if (other.status !== 'scheduled') continue
    // Inclusive ranges overlap if fromA <= toB && fromB <= toA
    if (candidate.from <= other.to && other.from <= candidate.to) return other
  }
  return null
}

export function validateMonthlyEventsList(slots: MonthlyEventSlot[]): string | null {
  for (const slot of slots) {
    if (!DATE_RE.test(slot.from) || !DATE_RE.test(slot.to)) {
      return 'Each monthly event needs valid from/to dates (YYYY-MM-DD).'
    }
    if (slot.to < slot.from) {
      return `"${slot.title || slot.id}" ends before it starts.`
    }
  }
  for (const slot of slots) {
    const clash = findOverlappingScheduled(slots, slot)
    if (clash) {
      return `Scheduled themes overlap: "${slot.title || slot.id}" and "${clash.title || clash.id}". Only one theme can be live at a time.`
    }
  }
  return null
}

export function resolveActiveMonthlyEvent(
  slots: MonthlyEventSlot[],
  now = new Date(),
): MonthlyEventSlot | null {
  const live = slots.filter((s) => isMonthlyEventLive(s, now))
  if (live.length === 0) return null
  // Prefer later start if data somehow overlaps (validation should prevent this).
  live.sort((a, b) => (a.from < b.from ? 1 : a.from > b.from ? -1 : 0))
  return live[0] ?? null
}

export function toActiveMonthlyEventPublic(slot: MonthlyEventSlot): ActiveMonthlyEventPublic {
  return {
    id: slot.id,
    title: slot.title,
    blurb: slot.blurb,
    from: slot.from,
    to: slot.to,
    featuredPromptIds: [...slot.featuredPromptIds],
    multipliers: { ...slot.multipliers },
  }
}

export function createEmptyMonthlyEventSlot(
  partial?: Partial<MonthlyEventSlot>,
): MonthlyEventSlot {
  const today = new Date()
  const y = today.getFullYear()
  const m = String(today.getMonth() + 1).padStart(2, '0')
  const from = `${y}-${m}-01`
  const last = new Date(y, today.getMonth() + 1, 0)
  const to = `${y}-${m}-${String(last.getDate()).padStart(2, '0')}`
  return normalizeMonthlyEventSlot({
    id: randomUUID(),
    status: 'draft',
    title: '',
    blurb: '',
    from,
    to,
    timezone: 'Europe/Amsterdam',
    multipliers: { ...DEFAULT_MULTIPLIERS },
    featuredPromptIds: [],
    siteOverride: {},
    ...partial,
  })!
}

/** First Monday of the calendar month in `timeZone`. */
export function isFirstMondayOfMonth(now: Date, timeZone: string): boolean {
  const cal = calendarDateInTimeZone(now, timeZone)
  // JS: 0=Sun … 1=Mon
  return cal.getDay() === 1 && cal.getDate() <= 7
}

export function monthlyWrapMonthKey(now: Date, timeZone: string): string {
  const cal = calendarDateInTimeZone(now, timeZone)
  const y = cal.getFullYear()
  const m = String(cal.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}
