export type TeamChatMessageInput = {
	displayName: string
	bookTitle: string
	teamName: string
	submissionType?: 'add' | 'sabotage'
	targetTeamName?: string | null
}

/** Placeholders admins can use in templates (shown in the Settings UI). */
export const TEAM_CHAT_VARIABLES = [
	{ key: 'displayName', label: 'Reader display name' },
	{ key: 'bookTitle', label: 'Book title' },
	{ key: 'teamName', label: 'Reader’s realm' },
	{ key: 'targetTeamName', label: 'Sabotage target realm (rivals only)' },
	{ key: 'submissionType', label: 'add or sabotage' },
] as const

/** Seeded when the DB list for that category is empty. Keep tone plain. */
export const DEFAULT_TEAM_CHAT_ADD_TEMPLATES = [
	'📖 **{{displayName}}** just finished **"{{bookTitle}}"** for the **{{teamName}}**!',
	'📖 **{{displayName}}** logged **"{{bookTitle}}"** for **{{teamName}}**.',
	'📚 **"{{bookTitle}}"** is in — **{{displayName}}** (**{{teamName}}**)',
	'✅ **{{displayName}}** finished **"{{bookTitle}}"** · **{{teamName}}**',
	'📕 **{{displayName}}**: **"{{bookTitle}}"** (**{{teamName}}**)',
] as const

export const DEFAULT_TEAM_CHAT_SABOTAGE_TEMPLATES = [
	'⚔️ **{{displayName}}** sabotaged **{{targetTeamName}}** with **"{{bookTitle}}"**!',
	'💀 **{{displayName}}** hit **{{targetTeamName}}** — **"{{bookTitle}}"**',
	'⚔️ **"{{bookTitle}}"** from **{{displayName}}** just landed on **{{targetTeamName}}**.',
	'🗡️ **{{displayName}}** (**{{teamName}}**) attacked **{{targetTeamName}}** with **"{{bookTitle}}"**',
	'💥 Sabotage: **{{displayName}}** → **{{targetTeamName}}** · **"{{bookTitle}}"**',
] as const

export function renderTeamChatTemplate(
	template: string,
	vars: Record<string, string>,
): string {
	return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
		return vars[key] ?? ''
	})
}

function pickTemplate(templates: string[], rng: () => number): string {
	if (templates.length === 0) return ''
	const index = Math.min(
		templates.length - 1,
		Math.max(0, Math.floor(rng() * templates.length)),
	)
	return templates[index]!
}

function usableTemplates(
	pool: string[],
	input: TeamChatMessageInput,
): string[] {
	const hasTarget = Boolean(input.targetTeamName?.trim())
	if (hasTarget || input.submissionType !== 'sabotage') return pool
	// Prefer sabotage lines that don't require a target when we don't have one.
	const withoutTarget = pool.filter((t) => !t.includes('{{targetTeamName}}'))
	return withoutTarget.length > 0 ? withoutTarget : pool
}

/**
 * Builds a short Discord-markdown realm-chat line for a book log.
 * Uses the provided template pool (from settings), or built-in defaults.
 */
export function buildTeamChatMessage(
	input: TeamChatMessageInput,
	opts: {
		templates?: string[] | null
		rng?: () => number
	} = {},
): string {
	const rng = opts.rng ?? Math.random
	const defaults =
		input.submissionType === 'sabotage'
			? [...DEFAULT_TEAM_CHAT_SABOTAGE_TEMPLATES]
			: [...DEFAULT_TEAM_CHAT_ADD_TEMPLATES]
	const rawPool =
		opts.templates && opts.templates.length > 0
			? opts.templates.map((t) => t.trim()).filter(Boolean)
			: defaults
	const pool = usableTemplates(rawPool, input)
	const template = pickTemplate(pool, rng)
	if (!template) {
		return `📖 **${input.displayName}** logged "${input.bookTitle}" for **${input.teamName}**!`
	}

	const vars: Record<string, string> = {
		displayName: input.displayName,
		bookTitle: input.bookTitle,
		teamName: input.teamName,
		targetTeamName: input.targetTeamName?.trim() || 'a rival',
		submissionType: input.submissionType ?? 'add',
	}
	return renderTeamChatTemplate(template, vars)
}

export function normalizeTemplateList(raw: unknown): string[] {
	if (!Array.isArray(raw)) return []
	return raw
		.filter((item): item is string => typeof item === 'string')
		.map((s) => s.trim())
		.filter(Boolean)
}
