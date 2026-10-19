export type ParticipantStatus = 'reading' | 'paused' | 'left'

export type Participant = {
	userId: string
	username: string
	bookTitle: string
	status: ParticipantStatus
	joinedAt: number
	startPage: number
	currentPage: number
	bankedPages: number
	pausedMs: number
	pausedAt: number | null
	confirmed: boolean
}

export type SprintView = {
	status: 'scheduled' | 'running' | 'grace' | 'ended'
	hostName: string
	durationMinutes: number
	startsAt: number
	endsAt: number | null
	goal: string | null
	title: string | null
	participants: Participant[]
}

export type StepOk<T> = { ok: true; value: T }
export type StepFail = { ok: false; error: string }

const MAX_PAGE = 1_000_000

export function pagesRead(participant: Participant): number {
	const session = Math.max(0, participant.currentPage - participant.startPage)
	return participant.bankedPages + session
}

const MAX_SPRINT_MINUTES = 24 * 60

export function formatMinutes(minutes: number): string {
	const whole = Math.max(0, Math.round(minutes))
	const hours = Math.floor(whole / 60)
	const rest = whole % 60
	const hourLabel = hours === 1 ? '1 hour' : `${hours} hours`
	const minuteLabel = rest === 1 ? '1 minute' : `${rest} minutes`
	if (hours > 0 && rest > 0) return `${hourLabel} ${minuteLabel}`
	if (hours > 0) return hourLabel
	return minuteLabel
}

export function parseSprintDuration(
	raw: string,
): { ok: true; minutes: number } | { ok: false; error: string } {
	const match = raw
		.trim()
		.toLowerCase()
		.match(/^(\d+)\s*(minutes?|mins?|m|hours?|hrs?|h)?$/)
	const hint = 'A number under 12 is hours. 12 or more is minutes. You can also write 5m or 2h.'
	const invalid = `${raw.trim().slice(0, 40) || 'That'} is not a valid duration.\n${hint}`
	if (!match) return { ok: false, error: invalid }
	const value = Number(match[1])
	if (!Number.isSafeInteger(value) || value <= 0) return { ok: false, error: invalid }
	const suffix = match[2] ?? ''
	const asHours = suffix.startsWith('h') || (suffix === '' && value < 12)
	const minutes = asHours ? value * 60 : value
	if (minutes > MAX_SPRINT_MINUTES) return { ok: false, error: 'A sprint can last up to 24 hours.' }
	return { ok: true, minutes }
}

const MAX_JOIN_WAIT_SECONDS = 5 * 60

export function parseJoinWait(
	raw: string,
): { ok: true; seconds: number } | { ok: false; error: string } {
	const match = raw
		.trim()
		.toLowerCase()
		.match(/^(\d+)\s*(seconds?|secs?|s|minutes?|mins?|m)?$/)
	const hint = 'Use a wait up to 5 minutes, like 60s, 90s, or 2m. A plain number is seconds.'
	if (!match) return { ok: false, error: hint }
	const value = Number(match[1])
	if (!Number.isSafeInteger(value) || value < 0) return { ok: false, error: hint }
	const suffix = match[2] ?? ''
	const seconds = suffix.startsWith('m') ? value * 60 : value
	if (seconds > MAX_JOIN_WAIT_SECONDS) return { ok: false, error: 'Joining wait can be at most 5 minutes.' }
	return { ok: true, seconds }
}

export function activeMinutes(
	participant: Participant,
	runningFrom: number,
	runningUntil: number,
): number {
	const start = Math.max(participant.joinedAt, runningFrom)
	if (runningUntil <= start) return 0
	let paused = participant.pausedMs
	if (
		(participant.status === 'paused' || participant.status === 'left') &&
		participant.pausedAt != null
	) {
		const pauseStart = Math.max(participant.pausedAt, start)
		if (runningUntil > pauseStart) paused += runningUntil - pauseStart
	}
	const ms = Math.max(0, runningUntil - start - paused)
	return Math.round(ms / 60_000)
}

export function pauseParticipant(
	participant: Participant,
	now: number,
): StepOk<Participant> | StepFail {
	if (participant.status === 'left') {
		return { ok: false, error: 'You left this sprint. Press Join to pick up where you left off.' }
	}
	if (participant.status === 'paused') {
		return { ok: false, error: 'You are already paused. Use resume when you are reading again.' }
	}
	return {
		ok: true,
		value: { ...participant, status: 'paused', pausedAt: now },
	}
}

export function resumeParticipant(
	participant: Participant,
	now: number,
): StepOk<Participant> | StepFail {
	if (participant.status !== 'paused' || participant.pausedAt == null) {
		return { ok: false, error: 'You are not paused.' }
	}
	return {
		ok: true,
		value: {
			...participant,
			status: 'reading',
			pausedMs: participant.pausedMs + Math.max(0, now - participant.pausedAt),
			pausedAt: null,
		},
	}
}

export function setParticipantPage(
	participant: Participant,
	page: number,
	options?: { allowPaused?: boolean },
): StepOk<Participant> | StepFail {
	if (!Number.isInteger(page) || page < 0 || page > MAX_PAGE) {
		return { ok: false, error: 'Enter a page number from 0 to 1000000.' }
	}
	if (participant.status === 'left') {
		return { ok: false, error: 'You left this sprint. Press Join to pick up where you left off.' }
	}
	if (participant.status === 'paused' && !options?.allowPaused) {
		return { ok: false, error: 'Resume the sprint before you update your page.' }
	}
	if (page < participant.startPage) {
		return {
			ok: false,
			error: `That page is before where you started this book (${participant.startPage}). Switch book if you moved to a different one.`,
		}
	}
	return { ok: true, value: { ...participant, currentPage: page } }
}

export function switchParticipantBook(
	participant: Participant,
	title: string,
	startPage: number,
): StepOk<Participant> | StepFail {
	const bookTitle = title.trim()
	if (!bookTitle) return { ok: false, error: 'Tell me the book you switched to.' }
	if (bookTitle.length > 200) {
		return { ok: false, error: 'That title is too long. Keep it under 200 characters.' }
	}
	if (participant.status === 'left') {
		return { ok: false, error: 'You left this sprint. Press Join to pick up where you left off.' }
	}
	if (!Number.isInteger(startPage) || startPage < 0 || startPage > MAX_PAGE) {
		return { ok: false, error: 'Enter a starting page from 0 to 1000000.' }
	}
	return {
		ok: true,
		value: {
			...participant,
			bookTitle,
			bankedPages: pagesRead(participant),
			startPage,
			currentPage: startPage,
		},
	}
}

export function joinParticipant(input: {
	userId: string
	username: string
	bookTitle: string
	startPage: number
	now: number
	existing: Participant[]
}): StepOk<Participant[]> & { rejoined?: boolean } | StepFail {
	const prior = input.existing.find((person) => person.userId === input.userId)
	if (prior && prior.status !== 'left') {
		return { ok: false, error: 'You are already in this sprint.' }
	}
	if (prior) {
		if (prior.pausedAt == null) return { ok: false, error: 'You are already in this sprint.' }
		const next = input.existing.map((person) =>
			person.userId === input.userId
				? {
						...person,
						username: input.username,
						status: 'reading' as const,
						pausedMs: person.pausedMs + Math.max(0, input.now - (person.pausedAt ?? input.now)),
						pausedAt: null,
						confirmed: false,
					}
				: person,
		)
		return { ok: true, value: next, rejoined: true }
	}
	const bookTitle = input.bookTitle.trim()
	if (bookTitle.length > 200) {
		return { ok: false, error: 'That title is too long. Keep it under 200 characters.' }
	}
	if (!Number.isInteger(input.startPage) || input.startPage < 0 || input.startPage > MAX_PAGE) {
		return { ok: false, error: 'Enter a starting page from 0 to 1000000.' }
	}
	const next: Participant = {
		userId: input.userId,
		username: input.username,
		bookTitle,
		status: 'reading',
		joinedAt: input.now,
		startPage: input.startPage,
		currentPage: input.startPage,
		bankedPages: 0,
		pausedMs: 0,
		pausedAt: null,
		confirmed: false,
	}
	return { ok: true, value: [...input.existing, next] }
}

export function leaveParticipant(
	participant: Participant,
	page: number,
	now: number,
): StepOk<Participant> | StepFail {
	if (participant.status === 'left') {
		return { ok: false, error: 'You already left this sprint.' }
	}
	const paged = setParticipantPage(participant, page, { allowPaused: true })
	if (!paged.ok) return paged
	return {
		ok: true,
		value: {
			...paged.value,
			status: 'left',
			pausedAt: participant.status === 'paused' && participant.pausedAt != null ? participant.pausedAt : now,
			confirmed: true,
		},
	}
}

export function stillWaiting(participants: Participant[]): boolean {
	return participants.some((person) => person.status !== 'left' && !person.confirmed)
}

export function renderSprint(view: SprintView, now: number): string {
	const stamp = (ms: number) => `<t:${Math.floor(ms / 1000)}:R>`
	const headline =
		view.status === 'scheduled'
			? `Starts ${stamp(view.startsAt)} · ${formatMinutes(view.durationMinutes)}`
			: view.status === 'running'
				? `Ends ${stamp(view.endsAt ?? now)} · ${formatMinutes(view.durationMinutes)}`
				: view.endsAt == null
					? 'Cancelled before it started'
					: `Finished · ${formatMinutes(view.durationMinutes)}`
	const lines = [
		`**Reading sprint**`,
		headline,
		`Host: ${view.hostName}`,
	]
	if (view.goal) lines.push(`Goal: ${view.goal}`)
	if (view.participants.length === 0) {
		lines.push('', 'Nobody has joined yet.')
		return lines.join('\n')
	}
	lines.push('', 'Readers:')
	const shown = view.participants.slice(0, 25)
	for (const person of shown) {
		const book = person.bookTitle || 'No book yet'
		const state = person.status === 'paused' ? ' · paused' : ''
		const from = view.status === 'ended' && view.endsAt != null ? view.startsAt : now
		const until = view.status === 'ended' && view.endsAt != null ? view.endsAt : now
		const minutes =
			view.status === 'ended' ? ` · ${formatMinutes(activeMinutes(person, from, until))}` : ''
		lines.push(
			`- ${person.username} — ${book} — ${pagesRead(person)} pages${state}${minutes}`,
		)
	}
	if (view.participants.length > shown.length) {
		lines.push(`+ ${view.participants.length - shown.length} more`)
	}
	return lines.join('\n').slice(0, 1900)
}
