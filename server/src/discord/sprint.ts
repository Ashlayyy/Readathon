import { ReadingSprint } from '../db/models/ReadingSprint.js'
import { editChannelMessage, sendChannelMessage } from './botApi.js'
import { bumpSprintsJoined, creditSprintFinish } from './members.js'
import { getDiscordChannelConfig } from '../services/siteSettings.js'
import { sprintMessage } from './embeds.js'
import {
	activeMinutes,
	joinParticipant,
	pagesRead,
	pauseParticipant,
	resumeParticipant,
	setParticipantPage,
	switchParticipantBook,
	type Participant,
	type SprintView,
} from './sprintState.js'

type SprintDoc = {
	_id: { toString(): string }
	guildId: string
	channelId: string
	messageId?: string | null
	hostId: string
	hostName: string
	status: 'scheduled' | 'running' | 'grace' | 'ended'
	durationMinutes: number
	startsAt: Date
	endsAt?: Date | null
	goal?: string | null
	statsApplied?: boolean
	participants: Array<{
		userId: string
		username: string
		bookTitle?: string
		status?: string
		joinedAt: Date
		startPage?: number
		currentPage?: number
		bankedPages?: number
		pausedMs?: number
		pausedAt?: Date | null
	}>
	markModified: (path: string) => void
	save: () => Promise<unknown>
}

const tails = new Map<string, Promise<unknown>>()
const timers = new Map<string, NodeJS.Timeout>()

function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
	const prev = tails.get(key) ?? Promise.resolve()
	const run = prev.then(fn, fn)
	tails.set(
		key,
		run.then(
			() => undefined,
			() => undefined,
		),
	)
	return run
}

function toParticipant(raw: SprintDoc['participants'][number]): Participant {
	return {
		userId: raw.userId,
		username: raw.username,
		bookTitle: raw.bookTitle ?? '',
		status: raw.status === 'paused' ? 'paused' : 'reading',
		joinedAt: new Date(raw.joinedAt).getTime(),
		startPage: raw.startPage ?? 0,
		currentPage: raw.currentPage ?? 0,
		bankedPages: raw.bankedPages ?? 0,
		pausedMs: raw.pausedMs ?? 0,
		pausedAt: raw.pausedAt ? new Date(raw.pausedAt).getTime() : null,
	}
}

function fromParticipant(participant: Participant) {
	return {
		...participant,
		joinedAt: new Date(participant.joinedAt),
		pausedAt: participant.pausedAt == null ? null : new Date(participant.pausedAt),
	}
}

function viewOf(sprint: SprintDoc): SprintView {
	return {
		status: sprint.status,
		hostName: sprint.hostName,
		durationMinutes: sprint.durationMinutes,
		startsAt: new Date(sprint.startsAt).getTime(),
		endsAt: sprint.endsAt ? new Date(sprint.endsAt).getTime() : null,
		goal: sprint.goal ?? null,
		participants: sprint.participants.map(toParticipant),
	}
}

function messageBody(sprint: SprintDoc, now: number) {
	const board = sprintMessage(viewOf(sprint), now)
	return {
		content: board.content,
		embeds: board.embeds.map((embed) => embed.toJSON()),
		components: board.components,
		allowed_mentions: { parse: [] as string[] },
	}
}

async function syncMessage(sprint: SprintDoc): Promise<void> {
	const body = messageBody(sprint, Date.now())
	if (!sprint.messageId) {
		const sent = await sendChannelMessage(sprint.channelId, body)
		if (sent.ok) {
			sprint.messageId = sent.id
			await sprint.save()
		}
		return
	}
	const edited = await editChannelMessage(sprint.channelId, sprint.messageId, body)
	if (!edited.ok && edited.status === 404) {
		const sent = await sendChannelMessage(sprint.channelId, body)
		if (sent.ok) {
			sprint.messageId = sent.id
			await sprint.save()
		}
	}
}

function clearTimer(id: string) {
	const timer = timers.get(id)
	if (timer) clearTimeout(timer)
	timers.delete(id)
}

function arm(id: string, at: number, fn: () => void) {
	clearTimer(id)
	const delay = Math.max(0, at - Date.now())
	const maxDelay = 2_147_483_647
	if (delay > maxDelay) {
		timers.set(
			id,
			setTimeout(() => arm(id, at, fn), maxDelay),
		)
		return
	}
	timers.set(id, setTimeout(fn, delay))
}

async function pingSprintRole(guildId: string, channelId: string): Promise<void> {
	const roleId = getDiscordChannelConfig('production', guildId).roleId
	if (!roleId) return
	await sendChannelMessage(channelId, {
		content: `<@&${roleId}> a reading sprint just started.`,
		allowed_mentions: { parse: [], roles: [roleId] },
	})
}

async function findActive(channelId: string) {
	return ReadingSprint.findOne({
		channelId,
		status: { $in: ['scheduled', 'running', 'grace'] },
	}) as Promise<SprintDoc | null>
}

export async function liveSprintLine(userId: string): Promise<string | null> {
	const sprint = (await ReadingSprint.findOne({
		status: { $in: ['scheduled', 'running', 'grace'] },
		'participants.userId': userId,
	})) as SprintDoc | null
	if (!sprint) return null
	const person = sprint.participants.map(toParticipant).find((row) => row.userId === userId)
	if (!person) return null
	const book = person.bookTitle || 'No book yet'
	const when = sprint.status === 'scheduled' ? 'Scheduled' : 'In a sprint now'
	return `${when}: ${book} — ${pagesRead(person)} pages`
}

const GRACE_MS = 5 * 60_000

async function applyFinish(sprint: SprintDoc, now: number) {
	if (sprint.statsApplied || (sprint.status !== 'running' && sprint.status !== 'grace')) {
		sprint.status = 'ended'
		sprint.statsApplied = true
		return
	}
	const from = new Date(sprint.startsAt).getTime()
	const until = sprint.endsAt ? new Date(sprint.endsAt).getTime() : now
	for (const raw of sprint.participants) {
		const person = toParticipant(raw)
		await creditSprintFinish({
			userId: person.userId,
			pages: pagesRead(person),
			minutes: activeMinutes(person, from, until),
			book: person.bookTitle,
		})
	}
	sprint.status = 'ended'
	sprint.statsApplied = true
}

async function openSprint(sprint: SprintDoc) {
	const start = new Date(sprint.startsAt).getTime()
	const end = start + sprint.durationMinutes * 60_000
	sprint.status = 'running'
	sprint.endsAt = new Date(end)
	await sprint.save()
	await syncMessage(sprint)
	await pingSprintRole(sprint.guildId, sprint.channelId)
	arm(sprint._id.toString(), end, () => {
		void enterGrace(sprint._id.toString())
	})
}

async function enterGrace(sprintId: string): Promise<{ ok: true; reply: string } | { ok: false; reply: string }> {
	return withLock(sprintId, async () => {
		const sprint = (await ReadingSprint.findById(sprintId)) as SprintDoc | null
		if (!sprint || sprint.status !== 'running') {
			return { ok: false, reply: 'That sprint is already over.' }
		}
		sprint.status = 'grace'
		await sprint.save()
		await syncMessage(sprint)
		const end = sprint.endsAt ? new Date(sprint.endsAt).getTime() : Date.now()
		arm(sprintId, end + GRACE_MS, () => {
			void finishSprint(sprintId, sprint.hostId, true)
		})
		return { ok: true, reply: 'Sprint ended. You have 5 minutes to update your page.' }
	})
}

export async function finishSprint(
	sprintId: string,
	actorId: string,
	automatic: boolean,
): Promise<{ ok: true; reply: string } | { ok: false; reply: string }> {
	return withLock(sprintId, async () => {
		const sprint = (await ReadingSprint.findById(sprintId)) as SprintDoc | null
		if (!sprint || sprint.status === 'ended') {
			return { ok: false, reply: 'That sprint is already over.' }
		}
		if (!automatic && actorId !== sprint.hostId) {
			return { ok: false, reply: 'Only the host can end this sprint.' }
		}
		clearTimer(sprintId)
		const cancelled = sprint.status === 'scheduled'
		if (sprint.status === 'grace') {
			await applyFinish(sprint, Date.now())
		} else if (!cancelled) {
			const now = Date.now()
			sprint.endsAt = new Date(now)
			await applyFinish(sprint, now)
		} else {
			sprint.status = 'ended'
			sprint.statsApplied = true
		}
		await sprint.save()
		await syncMessage(sprint)
		return {
			ok: true,
			reply: cancelled ? 'Scheduled sprint cancelled.' : 'Sprint ended. Pages and time are on your `/profile`.',
		}
	})
}

async function catchUp(sprint: SprintDoc) {
	const id = sprint._id.toString()
	const now = Date.now()
	const start = new Date(sprint.startsAt).getTime()
	const plannedEnd = start + sprint.durationMinutes * 60_000
	if (sprint.status === 'scheduled') {
		if (now >= plannedEnd + GRACE_MS) {
			sprint.status = 'running'
			sprint.endsAt = new Date(plannedEnd)
			await applyFinish(sprint, plannedEnd)
			await sprint.save()
			await syncMessage(sprint)
			return
		}
		if (now >= plannedEnd) {
			sprint.status = 'running'
			sprint.endsAt = new Date(plannedEnd)
			await sprint.save()
			await enterGrace(id)
			return
		}
		if (now >= start) {
			await openSprint(sprint)
			return
		}
		arm(id, start, () => {
			void withLock(id, async () => {
				const fresh = (await ReadingSprint.findById(id)) as SprintDoc | null
				if (fresh?.status === 'scheduled') await openSprint(fresh)
			})
		})
		return
	}
	const end = sprint.endsAt ? new Date(sprint.endsAt).getTime() : plannedEnd
	if (sprint.status === 'grace') {
		if (now >= end + GRACE_MS) {
			await applyFinish(sprint, end)
			await sprint.save()
			await syncMessage(sprint)
			return
		}
		arm(id, end + GRACE_MS, () => {
			void finishSprint(id, sprint.hostId, true)
		})
		return
	}
	if (now >= end + GRACE_MS) {
		await applyFinish(sprint, end)
		await sprint.save()
		await syncMessage(sprint)
		return
	}
	if (now >= end) {
		await enterGrace(id)
		return
	}
	arm(id, end, () => {
		void enterGrace(id)
	})
}

export async function restoreSprintTimers(): Promise<void> {
	const rows = (await ReadingSprint.find({
		status: { $in: ['scheduled', 'running', 'grace'] },
	})) as unknown as SprintDoc[]
	for (const sprint of rows) {
		try {
			await catchUp(sprint)
		} catch (error) {
			console.error('[discord] sprint restore failed:', error)
		}
	}
}

async function ensureChannelFree(channelId: string) {
	const existing = await findActive(channelId)
	if (existing) {
		return 'This channel already has a sprint. End that one before starting another.'
	}
	return null
}

export async function beginSprint(input: {
	guildId: string
	channelId: string
	hostId: string
	hostName: string
	durationMinutes: number
	bookTitle: string
	startPage: number
	goal: string | null
	inMinutes?: number
}): Promise<{ ok: true; reply: string } | { ok: false; reply: string }> {
	return withLock(`channel:${input.channelId}`, () => createSprint(input))
}

async function createSprint(input: {
	guildId: string
	channelId: string
	hostId: string
	hostName: string
	durationMinutes: number
	bookTitle: string
	startPage: number
	goal: string | null
	inMinutes?: number
}): Promise<{ ok: true; reply: string } | { ok: false; reply: string }> {
	const busy = await ensureChannelFree(input.channelId)
	if (busy) return { ok: false, reply: busy }
	const now = Date.now()
	const delay = (input.inMinutes ?? 0) * 60_000
	const startsAt = now + delay
	const joined = joinParticipant({
		userId: input.hostId,
		username: input.hostName,
		bookTitle: input.bookTitle,
		startPage: input.startPage,
		now: startsAt,
		existing: [],
	})
	if (!joined.ok) return { ok: false, reply: joined.error }
	const scheduled = delay > 0
	const sprint = (await ReadingSprint.create({
		guildId: input.guildId,
		channelId: input.channelId,
		hostId: input.hostId,
		hostName: input.hostName,
		status: scheduled ? 'scheduled' : 'running',
		durationMinutes: input.durationMinutes,
		startsAt: new Date(startsAt),
		endsAt: scheduled ? null : new Date(startsAt + input.durationMinutes * 60_000),
		goal: input.goal,
		participants: joined.value.map(fromParticipant),
	})) as unknown as SprintDoc
	await bumpSprintsJoined(input.hostId)
	const sent = await sendChannelMessage(input.channelId, messageBody(sprint, now))
	if (!sent.ok) {
		await ReadingSprint.deleteOne({ _id: sprint._id })
		return { ok: false, reply: `I couldn't post in that channel. ${sent.error}` }
	}
	sprint.messageId = sent.id
	await sprint.save()
	if (!scheduled) {
		await pingSprintRole(input.guildId, input.channelId)
		arm(sprint._id.toString(), new Date(sprint.endsAt ?? startsAt).getTime(), () => {
			void enterGrace(sprint._id.toString())
		})
	} else {
		arm(sprint._id.toString(), startsAt, () => {
			void withLock(sprint._id.toString(), async () => {
				const fresh = (await ReadingSprint.findById(sprint._id)) as SprintDoc | null
				if (fresh?.status === 'scheduled') await openSprint(fresh)
			})
		})
	}
	return {
		ok: true,
		reply: scheduled
			? `Sprint scheduled in this channel for ${input.durationMinutes} minutes.`
			: `Sprint started in this channel for ${input.durationMinutes} minutes.`,
	}
}

async function mutateParticipant(
	channelId: string,
	userId: string,
	username: string,
	change: (person: Participant, sprint: SprintDoc) => { ok: true; value: Participant } | { ok: false; error: string },
	options?: { requireRunning?: boolean; allowGrace?: boolean },
): Promise<{ ok: true; reply: string } | { ok: false; reply: string }> {
	const sprint = await findActive(channelId)
	if (!sprint) return { ok: false, reply: 'There is no sprint in this channel.' }
	return withLock(sprint._id.toString(), async () => {
		const fresh = (await ReadingSprint.findById(sprint._id)) as SprintDoc | null
		if (!fresh || fresh.status === 'ended') {
			return { ok: false, reply: 'That sprint is already over.' }
		}
		if (options?.requireRunning && fresh.status !== 'running') {
			if (options.allowGrace && fresh.status === 'grace') {
				// Page updates stay open for five minutes after the timer.
			} else if (fresh.status === 'grace') {
				return { ok: false, reply: 'The sprint is over. You can still update your page with the button.' }
			} else {
				return { ok: false, reply: 'That sprint has not started yet.' }
			}
		}
		const people = fresh.participants.map(toParticipant)
		const person = people.find((row) => row.userId === userId)
		if (!person) return { ok: false, reply: 'Join the sprint first.' }
		person.username = username
		const next = change(person, fresh)
		if (!next.ok) return { ok: false, reply: next.error }
		fresh.participants = people.map((row) =>
			row.userId === userId ? fromParticipant(next.value) : fromParticipant(row),
		) as SprintDoc['participants']
		fresh.markModified('participants')
		await fresh.save()
		await syncMessage(fresh)
		return { ok: true, reply: 'Updated.' }
	})
}

export async function joinSprint(input: {
	channelId: string
	userId: string
	username: string
	bookTitle: string
	startPage: number
}): Promise<{ ok: true; reply: string } | { ok: false; reply: string }> {
	const sprint = await findActive(input.channelId)
	if (!sprint) return { ok: false, reply: 'There is no sprint in this channel. Start one with `/sprint start`.' }
	return withLock(sprint._id.toString(), async () => {
		const fresh = (await ReadingSprint.findById(sprint._id)) as SprintDoc | null
		if (!fresh || fresh.status === 'ended') {
			return { ok: false, reply: 'That sprint is already over.' }
		}
		if (fresh.status === 'grace') {
			return { ok: false, reply: 'That sprint has ended. Update your page with the button if the window is still open.' }
		}
		const people = fresh.participants.map(toParticipant)
		const joined = joinParticipant({
			userId: input.userId,
			username: input.username,
			bookTitle: input.bookTitle,
			startPage: input.startPage,
			now: Date.now(),
			existing: people,
		})
		if (!joined.ok) return { ok: false, reply: joined.error }
		fresh.participants = joined.value.map(fromParticipant) as SprintDoc['participants']
		fresh.markModified('participants')
		await fresh.save()
		await bumpSprintsJoined(input.userId)
		await syncMessage(fresh)
		const when = fresh.status === 'scheduled' ? 'You are in. It has not started yet.' : 'You joined the sprint.'
		return { ok: true, reply: when }
	})
}

export async function updateSprintPage(input: {
	channelId: string
	userId: string
	username: string
	page: number
}) {
	const result = await mutateParticipant(
		input.channelId,
		input.userId,
		input.username,
		(person) => setParticipantPage(person, input.page),
		{ requireRunning: true, allowGrace: true },
	)
	if (!result.ok) return result
	return { ok: true as const, reply: `Page set to ${input.page}.` }
}

export async function pauseSprint(input: { channelId: string; userId: string; username: string }) {
	const result = await mutateParticipant(
		input.channelId,
		input.userId,
		input.username,
		(person) => pauseParticipant(person, Date.now()),
		{ requireRunning: true },
	)
	if (!result.ok) return result
	return { ok: true as const, reply: 'Paused. Your pages stay. Resume when you are reading again.' }
}

export async function resumeSprint(input: { channelId: string; userId: string; username: string }) {
	const result = await mutateParticipant(
		input.channelId,
		input.userId,
		input.username,
		(person) => resumeParticipant(person, Date.now()),
		{ requireRunning: true },
	)
	if (!result.ok) return result
	return { ok: true as const, reply: 'You are reading again.' }
}

export async function switchSprintBook(input: {
	channelId: string
	userId: string
	username: string
	bookTitle: string
	startPage: number
}) {
	const result = await mutateParticipant(
		input.channelId,
		input.userId,
		input.username,
		(person) => switchParticipantBook(person, input.bookTitle, input.startPage),
		{ requireRunning: true },
	)
	if (!result.ok) return result
	return {
		ok: true as const,
		reply: `Switched to **${input.bookTitle.trim()}**. Pages you already read are kept.`,
	}
}

export async function endChannelSprint(channelId: string, actorId: string) {
	const sprint = await findActive(channelId)
	if (!sprint) return { ok: false as const, reply: 'There is no sprint in this channel.' }
	if (actorId !== sprint.hostId) {
		return { ok: false as const, reply: 'Only the host can end this sprint.' }
	}
	if (sprint.status === 'running') return enterGrace(sprint._id.toString())
	return finishSprint(sprint._id.toString(), actorId, false)
}
