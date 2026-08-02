import { buildAdminAnalytics } from './adminAnalytics.js'
import { generateMonthlyWrapSvg } from './monthly-wrap-image.js'
import {
  getPublishPeriodEndMonday,
  toDateInputValue,
} from '../utils/week.js'
import { getSiteSettingsAdminSync } from './siteSettings.js'

/**
 * Last 4 ISO weeks ending at the current publish-period Monday
 * (same boundary as weekly vibes — upcoming Monday Tue–Sun, today if Monday).
 */
export function resolveLast4WeeksRange(
  now = new Date(),
  timeZone = 'Europe/Amsterdam',
): {
  from: Date
  toExclusive: Date
  fromInput: string
  toInput: string
  label: string
} {
  const endMon = getPublishPeriodEndMonday(now, timeZone)
  const from = new Date(endMon)
  from.setDate(from.getDate() - 28)
  const toExclusive = endMon
  const toInclusive = new Date(endMon)
  toInclusive.setDate(toInclusive.getDate() - 1)
  const fromInput = toDateInputValue(from)
  const toInput = toDateInputValue(toInclusive)
  return {
    from,
    toExclusive,
    fromInput,
    toInput,
    label: `${fromInput} → ${toInput} (4 weeks)`,
  }
}

export async function buildMonthlyWrapSvg(opts?: {
  now?: Date
  timeZone?: string
}): Promise<{ svg: string; label: string; fromInput: string; toInput: string }> {
  const timeZone =
    opts?.timeZone?.trim() ||
    getSiteSettingsAdminSync().scheduledPublishTimezone ||
    'Europe/Amsterdam'
  const range = resolveLast4WeeksRange(opts?.now, timeZone)
  const analytics = await buildAdminAnalytics({
    from: range.fromInput,
    to: range.toInput,
    preset: 'custom',
  })
  const svg = generateMonthlyWrapSvg(analytics, {
    title: undefined,
    subtitle: `Last 4 weeks · ${range.label}`,
  })
  return {
    svg,
    label: range.label,
    fromInput: range.fromInput,
    toInput: range.toInput,
  }
}
