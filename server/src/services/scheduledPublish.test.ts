import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
	getZonedParts,
	isWithinScheduledPublishWindow,
	PUBLISH_WINDOW_MINUTES,
	scheduledPublishWeekKey,
} from './scheduledPublish.js'
import { getDefaultPublishRange, getWeekInfo } from '../utils/week.js'

describe('scheduled publish window', () => {
	it('exposes a short publish window so a 60s poll cannot double-fire forever', () => {
		assert.ok(PUBLISH_WINDOW_MINUTES >= 1)
		assert.ok(PUBLISH_WINDOW_MINUTES <= 5)
	})

	it('getZonedParts returns weekday/hour/minute in UTC', () => {
		// 2026-07-20 is a Monday; 09:01 UTC
		const when = new Date(Date.UTC(2026, 6, 20, 9, 1, 0))
		const parts = getZonedParts(when, 'UTC')
		assert.equal(parts.day, 1) // Mon
		assert.equal(parts.hour, 9)
		assert.equal(parts.minute, 1)
	})

	it('returns false when scheduling is disabled', () => {
		const when = new Date(Date.UTC(2026, 6, 20, 9, 0, 0))
		assert.equal(
			isWithinScheduledPublishWindow(when, {
				enabled: false,
				day: 1,
				hour: 9,
				timezone: 'UTC',
			}),
			false,
		)
	})

	it('returns true at the top of the configured hour', () => {
		const when = new Date(Date.UTC(2026, 6, 20, 9, 0, 30))
		assert.equal(
			isWithinScheduledPublishWindow(when, {
				enabled: true,
				day: 1,
				hour: 9,
				timezone: 'UTC',
			}),
			true,
		)
	})

	it('returns false outside the minute window', () => {
		const when = new Date(Date.UTC(2026, 6, 20, 9, PUBLISH_WINDOW_MINUTES, 0))
		assert.equal(
			isWithinScheduledPublishWindow(when, {
				enabled: true,
				day: 1,
				hour: 9,
				timezone: 'UTC',
			}),
			false,
		)
	})

	it('returns false on the wrong weekday', () => {
		// Tuesday 09:00 UTC
		const when = new Date(Date.UTC(2026, 6, 21, 9, 0, 0))
		assert.equal(
			isWithinScheduledPublishWindow(when, {
				enabled: true,
				day: 1, // Monday
				hour: 9,
				timezone: 'UTC',
			}),
			false,
		)
	})

	it('returns false on the wrong hour', () => {
		const when = new Date(Date.UTC(2026, 6, 20, 10, 0, 0))
		assert.equal(
			isWithinScheduledPublishWindow(when, {
				enabled: true,
				day: 1,
				hour: 9,
				timezone: 'UTC',
			}),
			false,
		)
	})
})

describe('scheduledPublishWeekKey', () => {
	it('matches the weekKey publishStandings stores for lastMonToThisMon (not getWeekInfo(now))', () => {
		// Monday 2026-08-10 — current week is W33, but the publish range starts previous Mon (W32).
		const monday = new Date(Date.UTC(2026, 7, 10, 8, 0, 0))
		const stored = getDefaultPublishRange(monday, 'UTC').weekKey
		const nowKey = getWeekInfo(monday).weekKey
		assert.equal(scheduledPublishWeekKey(monday, 'UTC'), stored)
		assert.notEqual(scheduledPublishWeekKey(monday, 'UTC'), nowKey)
	})
})
