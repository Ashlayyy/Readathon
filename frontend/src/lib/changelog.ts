import { APP_VERSION } from './version';

/**
 * What’s-new entries. The latest entry’s version is always the root package.json
 * version (`APP_VERSION`) — bump that when you ship so the home popup shows again.
 * Older entries may keep an explicit `version` for history.
 */
export type ChangelogEntry = {
	/** Only needed for older entries; the first entry uses APP_VERSION. */
	version?: string;
	date: string;
	title: string;
	items: string[];
};

export const CHANGELOG: ChangelogEntry[] = [
	{
		date: '2026-07-26',
		title: 'Profiles, realm chat & what’s new',
		items: [
			'Fixed a few security issues and updated dependencies.',
			'Account settings (notifications, currently reading, custom themes) now live behind the Settings control on your own profile.',
			'This What’s new changelog on the home page.',
		],
	},
];

export function changelogEntryVersion(
	entry: ChangelogEntry,
	index: number,
): string {
	if (index === 0) return APP_VERSION;
	return entry.version ?? APP_VERSION;
}

/** Used for localStorage “seen” — bumps when root package.json version bumps. */
export const LATEST_CHANGELOG_VERSION = APP_VERSION;

export const CHANGELOG_SEEN_KEY = 'realm-changelog-seen-version';
