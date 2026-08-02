import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
	buildPublishWeekLabel,
	endOfIsoWeek,
	getChallengeWeekNumber,
	getDefaultPublishRange,
	getSeasonStartDate,
	getWeekBoundsFromKey,
	getWeekInfo,
	resolvePublishRange,
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

	it('getDefaultPublishRange on Monday is last Monday through this Monday inclusive', () => {
		// Monday Jul 27, 2026 afternoon (publish day)
		const now = new Date(2026, 6, 27, 15, 0, 0)
		const range = getDefaultPublishRange(now, 'Europe/Amsterdam')
		assert.equal(range.fromInput, '2026-07-20')
		assert.equal(range.toInput, '2026-07-27')
		assert.equal(range.preset, 'lastMonToThisMon')
		// Exclusive end is Tuesday Jul 28 00:00 so Monday is fully included
		assert.equal(toDateInputValue(range.toExclusive), '2026-07-28')
		// ISO week of Jul 20 2026 is 30; label includes both ends
		assert.equal(range.weekLabel, 'Week 30 - Jul 20 - Jul 27, 2026')
	})

	it('getDefaultPublishRange on Sunday uses this Mon -> next Mon (not a week behind)', () => {
		// Sunday Aug 2, 2026 - must not still show Jul 20-27
		const now = new Date(2026, 7, 2, 15, 0, 0)
		const range = getDefaultPublishRange(now, 'Europe/Amsterdam')
		assert.equal(range.fromInput, '2026-07-27')
		assert.equal(range.toInput, '2026-08-03')
		assert.equal(range.weekLabel, 'Week 31 - Jul 27 - Aug 3, 2026')
	})

	it('getChallengeWeekNumber counts from readathon start (July 1)', () => {
		const start = getSeasonStartDate(new Date(2026, 6, 15))
		assert.equal(start.getMonth(), 6)
		assert.equal(start.getDate(), 1)
		assert.equal(getChallengeWeekNumber(new Date(2026, 6, 1), start), 1)
		assert.equal(getChallengeWeekNumber(new Date(2026, 6, 7), start), 1)
		assert.equal(getChallengeWeekNumber(new Date(2026, 6, 8), start), 2)
		assert.equal(getChallengeWeekNumber(new Date(2026, 6, 27), start), 4)
	})

	it('buildPublishWeekLabel uses ISO calendar week of the range start', () => {
		assert.equal(
			buildPublishWeekLabel(new Date(2026, 6, 20), new Date(2026, 6, 27)),
			'Week 30 - Jul 20 - Jul 27, 2026',
		)
		assert.equal(
			buildPublishWeekLabel(new Date(2026, 6, 27), new Date(2026, 7, 3)),
			'Week 31 - Jul 27 - Aug 3, 2026',
		)
	})

	it('resolvePublishRange custom uses inclusive end-of-day', () => {
		const range = resolvePublishRange({
			preset: 'custom',
			from: '2026-07-13',
			to: '2026-07-20',
		})
		assert.equal(range.fromInput, '2026-07-13')
		assert.equal(range.toInput, '2026-07-20')
		assert.equal(toDateInputValue(range.toExclusive), '2026-07-21')
	})

	it('resolvePublishRange thisWeek spans the current ISO week', () => {
		const now = new Date(2026, 6, 22, 12, 0, 0) // Wed Jul 22 2026
		const range = resolvePublishRange({
			preset: 'thisWeek',
			now,
			timeZone: 'Europe/Amsterdam',
		})
		assert.equal(range.preset, 'thisWeek')
		assert.equal(range.fromInput, '2026-07-20')
		assert.equal(range.toInput, '2026-07-26')
		assert.match(range.label, /^This week/)
		assert.match(range.weekLabel, /^Week 30 -/)
	})

	it('resolvePublishRange lastWeek is the prior ISO week', () => {
		const now = new Date(2026, 6, 22, 12, 0, 0)
		const range = resolvePublishRange({
			preset: 'lastWeek',
			now,
			timeZone: 'Europe/Amsterdam',
		})
		assert.equal(range.preset, 'lastWeek')
		assert.equal(range.fromInput, '2026-07-13')
		assert.equal(range.toInput, '2026-07-19')
		assert.match(range.label, /^Last week/)
		assert.equal(range.weekLabel, 'Week 29 - Jul 13 - Jul 19, 2026')
	})

	it('resolvePublishRange last7 covers the trailing seven calendar days', () => {
		const now = new Date(2026, 6, 22, 12, 0, 0)
		const range = resolvePublishRange({
			preset: 'last7',
			now,
			timeZone: 'Europe/Amsterdam',
		})
		assert.equal(range.preset, 'last7')
		assert.equal(range.fromInput, '2026-07-16')
		assert.equal(range.toInput, '2026-07-22')
		assert.match(range.label, /^Last 7 days/)
	})

	it('resolvePublishRange falls back to default for unknown presets', () => {
		const now = new Date(2026, 6, 27, 15, 0, 0)
		const range = resolvePublishRange({
			preset: 'unknown-preset',
			now,
			timeZone: 'Europe/Amsterdam',
		})
		assert.equal(range.preset, 'lastMonToThisMon')
		assert.equal(range.fromInput, '2026-07-20')
		assert.equal(range.toInput, '2026-07-27')
	})

	it('uses Amsterdam calendar day so late-Sunday UTC still counts as Monday there', () => {
		// Monday 27 Jul 2026 00:30 in Amsterdam = Sunday 26 Jul 22:30 UTC
		const now = new Date(Date.UTC(2026, 6, 26, 22, 30, 0))
		const range = resolvePublishRange({
			preset: 'lastMonToThisMon',
			now,
			timeZone: 'Europe/Amsterdam',
		})
		assert.equal(range.toInput, '2026-07-27')
		assert.equal(range.fromInput, '2026-07-20')
	})
})
