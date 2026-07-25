export type TeamChatMessageInput = {
	displayName: string
	bookTitle: string
	teamName: string
	submissionType?: 'add' | 'sabotage'
	targetTeamName?: string | null
}

const ADD_TEMPLATES: Array<(i: TeamChatMessageInput) => string> = [
	(i) =>
		`📖 **${i.displayName}** just finished **"${i.bookTitle}"** for the **${i.teamName}**!`,
	(i) =>
		`📚 Stack update: **${i.displayName}** logged **"${i.bookTitle}"** — **${i.teamName}** grow stronger!`,
	(i) =>
		`✨ Fresh ink: **${i.displayName}** added **"${i.bookTitle}"** for **${i.teamName}**.`,
	(i) =>
		`🔥 **${i.teamName}** scored another read — **${i.displayName}** logged **"${i.bookTitle}"**!`,
	(i) =>
		`🗡️ Quest complete: **${i.displayName}** brought **"${i.bookTitle}"** home for **${i.teamName}**.`,
	(i) =>
		`🌟 Page turner alert — **${i.displayName}** finished **"${i.bookTitle}"** (**${i.teamName}**)!`,
]

const SABOTAGE_TEMPLATES: Array<(i: TeamChatMessageInput) => string> = [
	(i) =>
		i.targetTeamName
			? `⚔️ **${i.displayName}** struck **${i.targetTeamName}** with **"${i.bookTitle}"**!`
			: `⚔️ **${i.displayName}** launched a sabotage with **"${i.bookTitle}"**!`,
	(i) =>
		i.targetTeamName
			? `💥 Sabotage drop: **${i.displayName}** hit **${i.targetTeamName}** via **"${i.bookTitle}"**.`
			: `💥 Sabotage drop: **${i.displayName}** logged **"${i.bookTitle}"** against a rival realm.`,
	(i) =>
		i.targetTeamName
			? `🗡️ **${i.displayName}** (for **${i.teamName}**) just sabotaged **${i.targetTeamName}** with **"${i.bookTitle}"**!`
			: `🗡️ **${i.displayName}** (for **${i.teamName}**) just logged a sabotage: **"${i.bookTitle}"**!`,
]

/**
 * Builds a short, Discord-markdown realm-chat line for a book log.
 * Pure function so we can unit-test wording without hitting Discord.
 */
export function buildTeamChatMessage(
	input: TeamChatMessageInput,
	rng: () => number = Math.random,
): string {
	const templates =
		input.submissionType === 'sabotage' ? SABOTAGE_TEMPLATES : ADD_TEMPLATES
	const index = Math.min(
		templates.length - 1,
		Math.max(0, Math.floor(rng() * templates.length)),
	)
	return templates[index]!(input)
}
