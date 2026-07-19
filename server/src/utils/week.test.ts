import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
	endOfIsoWeek,
	getWeekBoundsFromKey,
	getWeekInfo,
	startOfIsoWeek,
	toDateInputValue,
} from '../utils/week.js'

describe('week utils', () => {
	it('startOfIsoWeek is always a Monday at midnight', () => {
		const samples = [
			new Date(2026, 6, 19), // Sun
			new Date(2026, 6, 20), // Mon
			new Date(2026, 6, 22), // Wed
			new Date(2026, 6, 25), // Sat
		]
		for (const d of samples) {
			const monday = startOfIsoWeek(d)
			assert.equal(monday.getDay(), 1)
			assert.equal(monday.getHours(), 0)
			assert.equal(monday.getMinutes(), 0)
		}
	})

	it('endOfIsoWeek is exactly 7 days after the Monday start', () => {
		const d = new Date(2026, 6, 22)
		const from = startOfIsoWeek(d)
		const to = endOfIsoWeek(d)
		assert.equal(to.getTime() - from.getTime(), 7 * 24 * 60 * 60 * 1000)
	})

	it('getWeekInfo returns a stable weekKey format', () => {
		const { weekKey, weekLabel } = getWeekInfo(new Date(2026, 6, 16)) // Thu Jul 16 2026
		assert.match(weekKey, /^\d{4}-W\d{2}$/)
		assert.match(weekLabel, /^Week of /)
	})

	it('getWeekBoundsFromKey parses a known ISO week', () => {
		const { from, to } = getWeekBoundsFromKey('2026-W29')
		assert.equal(from.getDay(), 1)
		assert.equal(to.getTime() - from.getTime(), 7 * 24 * 60 * 60 * 1000)
		// Round-trip: a day inside the range should report the same week key
		const mid = new Date(from)
		mid.setDate(mid.getDate() + 2)
		assert.equal(getWeekInfo(mid).weekKey, '2026-W29')
	})

	it('getWeekBoundsFromKey falls back for garbage keys', () => {
		const { from, to } = getWeekBoundsFromKey('not-a-week')
		assert.ok(from instanceof Date)
		assert.ok(to > from)
	})

	it('toDateInputValue formats YYYY-MM-DD', () => {
		assert.equal(toDateInputValue(new Date(2026, 0, 5)), '2026-01-05')
		assert.equal(toDateInputValue(new Date(2026, 11, 31)), '2026-12-31')
	})
})
