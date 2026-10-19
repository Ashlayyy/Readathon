export type ParticipantStatus = 'reading' | 'paused'

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
}

export type SprintView = {
	status: 'scheduled' | 'running' | 'grace' | 'ended'
	hostName: string
	durationMinutes: number
	startsAt: number
	endsAt: number | null
	goal: string | null
	participants: Participant[]
}

export type StepOk<T> = { ok: true; value: T }
export type StepFail = { ok: false; error: string }

const MAX_PAGE = 1_000_000

export function pagesRead(participant: Participant): number {
	const session = Math.max(0, participant.currentPage - participant.startPage)
	return participant.bankedPages + session
}

export function formatMinutes(minutes: number): string {
	if (minutes < 60) return `${minutes} min`
	const hours = Math.floor(minutes / 60)
	const rest = minutes % 60
	return rest ? `${hours} hr ${rest} min` : `${hours} hr`
}

export function activeMinutes(
	participant: Participant,
	runningFrom: number,
	runningUntil: number,
): number {
	const start = Math.max(participant.joinedAt, runningFrom)
	if (runningUntil <= start) return 0
	let paused = participant.pausedMs
	if (participant.status === 'paused' && participant.pausedAt != null) {
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
): StepOk<Participant> | StepFail {
	if (!Number.isInteger(page) || page < 0 || page > MAX_PAGE) {
		return { ok: false, error: 'Enter a page number from 0 to 1000000.' }
	}
	if (participant.status === 'paused') {
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
}): StepOk<Participant[]> | StepFail {
	if (input.existing.some((person) => person.userId === input.userId)) {
		return { ok: false, error: 'You are already in this sprint.' }
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
	}
	return { ok: true, value: [...input.existing, next] }
}

export function renderSprint(view: SprintView, now: number): string {
	const stamp = (ms: number) => `<t:${Math.floor(ms / 1000)}:R>`
	const headline =
		view.status === 'scheduled'
			? `Starts ${stamp(view.startsAt)} · ${view.durationMinutes} min`
			: view.status === 'running'
				? `Ends ${stamp(view.endsAt ?? now)} · ${view.durationMinutes} min`
				: view.endsAt == null
					? 'Cancelled before it started'
					: `Finished · ${view.durationMinutes} min`
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
