import { APP_VERSION } from './version'

/**
 * What’s-new entries. Set `version` on each entry (especially the latest).
 * The home popup reopens when `LATEST_CHANGELOG_VERSION` (latest entry) differs
 * from localStorage — also bump root package.json so the footer matches.
 */
export type ChangelogEntry = {
	version?: string
	date: string
	title: string
	items: string[]
}

export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '1.6.0',
		date: '2026-08-02',
		title: 'Theme of the month & more',
		items: [
			'Theme of the Month can change the site’s look and feel while it’s running.',
			'Home now shows the month’s theme banner, and sometimes a month photo.',
			'Reader of the Month on the home page.',
			'Discord standings and the new 4-week wrap images follow the live theme colors.',
		],
	},
	{
		version: '1.5.1',
		date: '2026-07-26',
		title: 'Profiles, realm chat & what’s new',
		items: [
			'Fixed a few security issues and updated dependencies.',
			'Account settings (notifications, currently reading, custom themes) now live behind the Settings control on your own profile.',
			'This What’s new changelog on the home page.',
			'You are also able to see the latest books which has been read, although you cannot see who read them.',
		],
	},
]

export function changelogEntryVersion(
	entry: ChangelogEntry,
	index: number,
): string {
	if (entry.version) return entry.version
	if (index === 0) return APP_VERSION
	return APP_VERSION
}

/**
 * Triggers the home “What’s new” popup when this differs from localStorage.
 * Prefer the latest entry’s explicit version so a new release pops even if the
 * Vite-injected APP_VERSION is briefly stale in dev.
 */
export const LATEST_CHANGELOG_VERSION =
	CHANGELOG[0]?.version?.trim() || APP_VERSION

export const CHANGELOG_SEEN_KEY = 'realm-changelog-seen-version'
