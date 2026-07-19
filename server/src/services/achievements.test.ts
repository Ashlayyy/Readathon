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

describe('computeAchievements', () => {
	it('returns all five achievements, none earned, for an empty list', () => {
		const result = computeAchievements([])
		assert.equal(result.length, 5)
		assert.ok(result.every((a) => !a.earned && a.earnedAt === null))
		assert.deepEqual(
			result.map((a) => a.id),
			[
				'doorstopper',
				'first_sabotage',
				'five_book_club',
				'pacifist',
				'format_specialist',
			],
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

	it('earns pacifist with 3+ adds and zero sabotages', () => {
		const result = computeAchievements([
			sub({ submissionType: 'add' }),
			sub({ submissionType: 'add' }),
			sub({ submissionType: 'add' }),
		])
		assert.equal(result.find((a) => a.id === 'pacifist')!.earned, true)
	})

	it('does not earn pacifist if any sabotage exists', () => {
		const result = computeAchievements([
			sub({ submissionType: 'add' }),
			sub({ submissionType: 'add' }),
			sub({ submissionType: 'sabotage' }),
		])
		assert.equal(result.find((a) => a.id === 'pacifist')!.earned, false)
	})

	it('earns format_specialist when 3+ books share one format', () => {
		const result = computeAchievements([
			sub({ format: 'audiobook' }),
			sub({ format: 'audiobook' }),
			sub({ format: 'audiobook' }),
		])
		assert.equal(result.find((a) => a.id === 'format_specialist')!.earned, true)
	})

	it('does not earn format_specialist with mixed formats', () => {
		const result = computeAchievements([
			sub({ format: 'physical' }),
			sub({ format: 'ebook' }),
			sub({ format: 'physical' }),
		])
		assert.equal(result.find((a) => a.id === 'format_specialist')!.earned, false)
	})
})
