import { PublishedStandings } from '../db/models/PublishedStandings.js'
import { getStaticConfig } from '../config.js'
import {
  getSiteSettingsAdminSync,
  updateSiteSettings,
  type SeasonArchive,
} from './siteSettings.js'
import { logAudit, type AuditActor } from './audit.js'

export type CloseSeasonInput = {
  /** When true, also enable downtime mode for non-admins. */
  enableDowntime?: boolean
  title?: string
  message?: string
  slug?: string
  from?: string
  to?: string
}

export type CloseSeasonResult = {
  archive: NonNullable<SeasonArchive>
  downtimeMode: boolean
}

function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64) || 'season'
}

/**
 * One-click season close: freeze archive metadata pointing at the latest
 * published standings snapshot. Does not auto-run — admin must click.
 */
export async function closeSeason(
  actor: AuditActor,
  input: CloseSeasonInput = {},
): Promise<CloseSeasonResult> {
  const cfg = getStaticConfig()
  const settings = getSiteSettingsAdminSync()
  const published = await PublishedStandings.findOne({ isActive: true }).sort({
    createdAt: -1,
  })

  const eventName = String(cfg.event?.name ?? 'Readathon').trim() || 'Readathon'
  const title =
    input.title?.trim() || `${eventName} — season archive`
  const message =
    input.message?.trim() ||
    'This season is archived. Final standings below are frozen from the last publish.'
  const slug = slugify(input.slug?.trim() || eventName)
  const nowIso = new Date().toISOString().slice(0, 10)

  const archive: NonNullable<SeasonArchive> = {
    slug,
    title,
    from: input.from?.trim() || '',
    to: input.to?.trim() || nowIso,
    message,
    publishedStandingsIds: published ? [published._id.toString()] : [],
  }

  const enableDowntime = Boolean(input.enableDowntime)
  await updateSiteSettings({
    seasonArchive: archive,
    ...(enableDowntime ? { downtimeMode: true } : {}),
  })

  await logAudit({
    actor,
    action: 'season.closed',
    entityType: 'SeasonArchive',
    entityId: slug,
    detail: {
      title,
      downtimeMode: enableDowntime || settings.downtimeMode,
      publishedStandingsId: published?._id.toString() ?? null,
    },
  })

  const next = getSiteSettingsAdminSync()
  return {
    archive,
    downtimeMode: next.downtimeMode,
  }
}
