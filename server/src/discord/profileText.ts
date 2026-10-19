import { formatMinutes } from './sprintState.js'

export type ProfileInput = {
	username: string
	nametag: string | null
	totalPages: number
	totalMinutes: number
	sprintsJoined: number
	sprintsCompleted: number
	lastSprintPages: number | null
	lastSprintMinutes: number | null
	lastSprintBook: string | null
	libraryCount: number
	live: string | null
	email: string | null
	teamName: string | null
	site: string | null
}

export function formatProfile(profile: ProfileInput): string {
	const lines = [`**${profile.username}**`]
	if (profile.nametag) lines.push(profile.nametag)
	if (profile.teamName) lines.push(`Team: **${profile.teamName}**`)
	if (profile.email) lines.push(`Email: ${profile.email}`)
	lines.push(
		`Pages read in sprints: **${profile.totalPages}**`,
		`Time in sprints: **${formatMinutes(profile.totalMinutes)}**`,
		`Sprints joined: **${profile.sprintsJoined}**`,
		`Sprints finished: **${profile.sprintsCompleted}**`,
	)
	if (profile.lastSprintPages != null && profile.lastSprintMinutes != null) {
		const book = profile.lastSprintBook ? ` — ${profile.lastSprintBook}` : ''
		lines.push(
			`Last sprint: **${profile.lastSprintPages}** pages in ${formatMinutes(profile.lastSprintMinutes)}${book}`,
		)
	}
	if (profile.live) lines.push(profile.live)
	lines.push(`Library: **${profile.libraryCount}** books`)
	if (profile.site) lines.push(`Website: ${profile.site}`)
	return lines.join('\n')
}
