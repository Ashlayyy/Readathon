import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { computeAchievements } from './achievements.js'

function sub(partial: {
	pageCount?: number
	submissionType?: 'add' | 'sabotage'
	format?: string
	createdAt?: Date
}) {
	return {
		pageCount: partial.pageCount ?? 200,
		submissionType: partial.submissionType ?? 'add',
		format: partial.format ?? 'physical',
		createdAt: partial.createdAt ?? new Date('2026-07-01T12:00:00Z'),
	}
}

const ALL_IDS = [
	'doorstopper',
	'first_sabotage',
	'five_book_club',
	'format_specialist',
	'page_hoarder',
	'saboteur',
	'decade_club',
	'format_explorer',
] as const

describe('computeAchievements', () => {
	it('returns all eight achievements, none earned, for an empty list', () => {
		const result = computeAchievements([])
		assert.equal(result.length, 8)
		assert.ok(result.every((a) => !a.earned && a.earnedAt === null && a.icon))
		assert.deepEqual(
			result.map((a) => a.id),
			[...ALL_IDS],
		)
	})

	it('earns doorstopper for a 500+ page book', () => {
		const when = new Date('2026-07-10T10:00:00Z')
		const result = computeAchievements([sub({ pageCount: 500, createdAt: when })])
		const door = result.find((a) => a.id === 'doorstopper')!
		assert.equal(door.earned, true)
		assert.equal(door.earnedAt, when.toISOString())
	})

	it('does not earn doorstopper at 499 pages', () => {
		const result = computeAchievements([sub({ pageCount: 499 })])
		assert.equal(result.find((a) => a.id === 'doorstopper')!.earned, false)
	})

	it('earns first_sabotage on the first sabotage submission', () => {
		const when = new Date('2026-07-05T08:00:00Z')
		const result = computeAchievements([
			sub({ submissionType: 'add', createdAt: new Date('2026-07-01T08:00:00Z') }),
			sub({ submissionType: 'sabotage', createdAt: when }),
		])
		const badge = result.find((a) => a.id === 'first_sabotage')!
		assert.equal(badge.earned, true)
		assert.equal(badge.earnedAt, when.toISOString())
	})

	it('earns five_book_club at exactly 5 books', () => {
		const books = Array.from({ length: 5 }, (_, i) =>
			sub({ createdAt: new Date(`2026-07-0${i + 1}T12:00:00Z`) }),
		)
		const result = computeAchievements(books)
		assert.equal(result.find((a) => a.id === 'five_book_club')!.earned, true)
		assert.equal(result.find((a) => a.id === 'five_book_club')!.earnedAt, books[4]!.createdAt.toISOString())
	})

	it('earns format_specialist when 3+ books share one format', () => {
		const result = computeAchievements([
			sub({ format: 'audiobook' }),
			sub({ format: 'audiobook' }),
			sub({ format: 'audiobook' }),
		])
		assert.equal(result.find((a) => a.id === 'format_specialist')!.earned, true)
	})

	it('earns format_specialist even when other formats are also logged', () => {
		const result = computeAchievements([
			sub({ format: 'physical' }),
			sub({ format: 'physical' }),
			sub({ format: 'physical' }),
			sub({ format: 'ebook' }),
		])
		assert.equal(result.find((a) => a.id === 'format_specialist')!.earned, true)
	})

	it('does not earn format_specialist with fewer than 3 of any format', () => {
		const result = computeAchievements([
			sub({ format: 'physical' }),
			sub({ format: 'ebook' }),
			sub({ format: 'physical' }),
		])
		assert.equal(result.find((a) => a.id === 'format_specialist')!.earned, false)
	})

	it('earns page_hoarder at 2000 total pages', () => {
		const result = computeAchievements([
			sub({ pageCount: 800, createdAt: new Date('2026-07-01T12:00:00Z') }),
			sub({ pageCount: 800, createdAt: new Date('2026-07-02T12:00:00Z') }),
			sub({ pageCount: 400, createdAt: new Date('2026-07-03T12:00:00Z') }),
		])
		const badge = result.find((a) => a.id === 'page_hoarder')!
		assert.equal(badge.earned, true)
		assert.equal(badge.earnedAt, new Date('2026-07-03T12:00:00Z').toISOString())
	})

	it('earns saboteur at 5 sabotages', () => {
		const books = Array.from({ length: 5 }, (_, i) =>
			sub({
				submissionType: 'sabotage',
				createdAt: new Date(`2026-07-0${i + 1}T12:00:00Z`),
			}),
		)
		const result = computeAchievements(books)
		assert.equal(result.find((a) => a.id === 'saboteur')!.earned, true)
		assert.equal(result.find((a) => a.id === 'first_sabotage')!.earned, true)
	})

	it('earns decade_club at 10 books', () => {
		const books = Array.from({ length: 10 }, (_, i) =>
			sub({
				createdAt: new Date(`2026-07-${String(i + 1).padStart(2, '0')}T12:00:00Z`),
			}),
		)
		const result = computeAchievements(books)
		assert.equal(result.find((a) => a.id === 'decade_club')!.earned, true)
		assert.equal(result.find((a) => a.id === 'five_book_club')!.earned, true)
	})

	it('earns format_explorer when all three formats are logged', () => {
		const when = new Date('2026-07-03T12:00:00Z')
		const result = computeAchievements([
			sub({ format: 'physical', createdAt: new Date('2026-07-01T12:00:00Z') }),
			sub({ format: 'ebook', createdAt: new Date('2026-07-02T12:00:00Z') }),
			sub({ format: 'audiobook', createdAt: when }),
		])
		const badge = result.find((a) => a.id === 'format_explorer')!
		assert.equal(badge.earned, true)
		assert.equal(badge.earnedAt, when.toISOString())
	})

	it('can earn all eight achievements together', () => {
		const books = [
			...Array.from({ length: 5 }, (_, i) =>
				sub({
					submissionType: 'sabotage',
					format: 'physical',
					pageCount: 500,
					createdAt: new Date(`2026-07-${String(i + 1).padStart(2, '0')}T12:00:00Z`),
				}),
			),
			sub({ format: 'ebook', pageCount: 200, createdAt: new Date('2026-07-06T12:00:00Z') }),
			sub({ format: 'audiobook', pageCount: 200, createdAt: new Date('2026-07-07T12:00:00Z') }),
			...Array.from({ length: 3 }, (_, i) =>
				sub({
					format: 'physical',
					pageCount: 200,
					createdAt: new Date(`2026-07-${String(i + 8).padStart(2, '0')}T12:00:00Z`),
				}),
			),
		]
		const result = computeAchievements(books)
		assert.equal(result.length, 8)
		assert.ok(result.every((a) => a.earned), result.filter((a) => !a.earned).map((a) => a.id).join(','))
	})
})
