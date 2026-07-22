import { PublishedStandings } from '../db/models/PublishedStandings.js'
import { getSiteSettingsAdminSync } from './siteSettings.js'
import { publishStandings } from './standingsPublish.js'
import { getWeekInfo } from '../utils/week.js'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
/** Publish only within this many minutes past the top of the configured hour, so a 60s poll can't double-publish. */
export const PUBLISH_WINDOW_MINUTES = 2

/** actorName shown in the audit log / StandingsEvent for scheduler-triggered publishes. */
const SCHEDULER_ACTOR = { displayName: 'Scheduler', email: 'scheduler@system' }

let intervalHandle: ReturnType<typeof setInterval> | null = null
let checkInFlight = false

export function getZonedParts(date: Date, timeZone: string): { day: number; hour: number; minute: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    }).formatToParts(date)

    const weekdayStr = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun'
    const hourStr = parts.find((p) => p.type === 'hour')?.value ?? '0'
    const minuteStr = parts.find((p) => p.type === 'minute')?.value ?? '0'

    const day = WEEKDAYS.indexOf(weekdayStr)
    let hour = parseInt(hourStr, 10)
    if (hour === 24) hour = 0 // some locales render midnight as "24"

    return {
      day: day < 0 ? date.getDay() : day,
      hour: Number.isFinite(hour) ? hour : date.getHours(),
      minute: Number.isFinite(parseInt(minuteStr, 10)) ? parseInt(minuteStr, 10) : date.getMinutes(),
    }
  } catch (e) {
    console.error(`[scheduler] Invalid timezone "${timeZone}", falling back to server local time:`, e)
    return { day: date.getDay(), hour: date.getHours(), minute: date.getMinutes() }
  }
}

/** Pure check: is `now` inside the configured day/hour/timezone publish window? */
export function isWithinScheduledPublishWindow(
  now: Date,
  opts: {
    enabled: boolean
    day: number
    hour: number
    timezone: string
  },
): boolean {
  if (!opts.enabled) return false
  const timezone = opts.timezone || 'Europe/Amsterdam'
  const { day, hour, minute } = getZonedParts(now, timezone)
  if (day !== opts.day) return false
  if (hour !== opts.hour) return false
  if (minute >= PUBLISH_WINDOW_MINUTES) return false
  return true
}

async function alreadyPublishedThisWeek(weekKey: string): Promise<boolean> {
  const last = await PublishedStandings.findOne().sort({ createdAt: -1 }).select('weekKey')
  return last?.weekKey === weekKey
}

async function maybePublish(now = new Date()): Promise<void> {
  const settings = getSiteSettingsAdminSync()
  if (
    !isWithinScheduledPublishWindow(now, {
      enabled: settings.scheduledPublishEnabled,
      day: settings.scheduledPublishDay,
      hour: settings.scheduledPublishHour,
      timezone: settings.scheduledPublishTimezone || 'Europe/Amsterdam',
    })
  ) {
    return
  }

  const { weekKey } = getWeekInfo(now)
  if (await alreadyPublishedThisWeek(weekKey)) return

  console.log(`[scheduler] Publishing standings for ${weekKey}`)
  try {
    const result = await publishStandings(SCHEDULER_ACTOR, {
      preset: 'lastMonToThisMon',
    })
    console.log(
      `[scheduler] Published ${result.weekLabel}: ${result.emailsSent} emails, discord=${result.discordSent}`,
    )
  } catch (e) {
    console.error('[scheduler] Scheduled publish failed:', e)
  }
}

/** Boots the interval that checks (every `intervalMs`, default 60s) whether it's time for the weekly scheduled publish. */
export function startScheduledPublishChecker(intervalMs = 60_000): void {
  if (intervalHandle) return
  intervalHandle = setInterval(() => {
    if (checkInFlight) return
    checkInFlight = true
    maybePublish()
      .catch((e) => console.error('[scheduler] Check failed:', e))
      .finally(() => {
        checkInFlight = false
      })
  }, intervalMs)
}

export function stopScheduledPublishChecker(): void {
  if (intervalHandle) clearInterval(intervalHandle)
  intervalHandle = null
}
