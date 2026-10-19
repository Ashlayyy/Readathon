import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
	activeMinutes,
	joinParticipant,
	pagesRead,
	pauseParticipant,
	resumeParticipant,
	setParticipantPage,
	switchParticipantBook,
} from './sprintState.js'
import { formatProfile } from './profileText.js'
import type { Participant } from './sprintState.js'

const MIN = 60_000

function reader(overrides: Partial<Participant> = {}): Participant {
	return {
		userId: 'u1',
		username: 'Ada',
		bookTitle: 'The Left Hand of Darkness',
		status: 'reading',
		joinedAt: 0,
		startPage: 10,
		currentPage: 25,
		bankedPages: 0,
		pausedMs: 0,
		pausedAt: null,
		...overrides,
	}
}

describe('sprint pages', () => {
	it('counts pages from the starting page', () => {
		assert.equal(pagesRead(reader()), 15)
	})

	it('keeps pages already read when the book changes', () => {
		const switched = switchParticipantBook(reader(), 'A Wizard of Earthsea', 0)
		assert.equal(switched.ok, true)
		if (!switched.ok) return
		assert.equal(switched.value.bankedPages, 15)
		assert.equal(pagesRead(switched.value), 15)
		const later = setParticipantPage(switched.value, 8)
		assert.equal(later.ok, true)
		if (!later.ok) return
		assert.equal(pagesRead(later.value), 23)
		assert.equal(later.value.bookTitle, 'A Wizard of Earthsea')
	})

	it('refuses a page update while paused', () => {
		const paused = pauseParticipant(reader(), 10 * MIN)
		assert.equal(paused.ok, true)
		if (!paused.ok) return
		const page = setParticipantPage(paused.value, 30)
		assert.equal(page.ok, false)
	})

	it('refuses a page behind the start of this book', () => {
		const page = setParticipantPage(reader(), 4)
		assert.equal(page.ok, false)
	})
})

describe('sprint time', () => {
	it('drops paused time out of the minutes', () => {
		const full = activeMinutes(reader(), 0, 25 * MIN)
		assert.equal(full, 25)

		const stillPaused = pauseParticipant(reader(), 10 * MIN)
		assert.equal(stillPaused.ok, true)
		if (!stillPaused.ok) return
		assert.equal(activeMinutes(stillPaused.value, 0, 25 * MIN), 10)

		const resumed = resumeParticipant(stillPaused.value, 15 * MIN)
		assert.equal(resumed.ok, true)
		if (!resumed.ok) return
		assert.equal(activeMinutes(resumed.value, 0, 25 * MIN), 20)
	})

	it('does not pause twice or resume while reading', () => {
		assert.equal(resumeParticipant(reader(), 0).ok, false)
		const paused = pauseParticipant(reader(), 0)
		assert.equal(paused.ok, true)
		if (!paused.ok) return
		assert.equal(pauseParticipant(paused.value, MIN).ok, false)
	})
})

describe('joining', () => {
	it('rejects a second join from the same person', () => {
		const first = joinParticipant({
			userId: 'u1',
			username: 'Ada',
			bookTitle: 'Kindred',
			startPage: 0,
			now: 0,
			existing: [],
		})
		assert.equal(first.ok, true)
		if (!first.ok) return
		const again = joinParticipant({
			userId: 'u1',
			username: 'Ada',
			bookTitle: 'Kindred',
			startPage: 0,
			now: MIN,
			existing: first.value,
		})
		assert.equal(again.ok, false)
	})
})

describe('profile', () => {
	it('includes sprint pages and time', () => {
		const text = formatProfile({
			username: 'Ada',
			nametag: 'night reader',
			totalPages: 120,
			totalMinutes: 80,
			sprintsJoined: 4,
			sprintsCompleted: 3,
			lastSprintPages: 23,
			lastSprintMinutes: 20,
			lastSprintBook: 'Kindred',
			libraryCount: 6,
			live: 'In a sprint now: Kindred — 8 pages',
			email: 'ada@example.com',
			teamName: 'Riders',
			site: 'https://bookbaddies.net/readers/1',
		})
		assert.match(text, /Pages read in sprints: \*\*120\*\*/)
		assert.match(text, /1 hr 20 min/)
		assert.match(text, /Last sprint: \*\*23\*\* pages/)
		assert.match(text, /In a sprint now/)
	})
})
