import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { computeStreakWeeks } from './profileDashboard.js'
import { getWeekInfo } from '../utils/week.js'

describe('computeStreakWeeks', () => {
	it('returns 0 for an empty list', () => {
		assert.equal(computeStreakWeeks([]), 0)
	})

	it('returns 0 when nothing was logged in the current ISO week', () => {
		const { weekKey: current } = getWeekInfo()
		// Pick a date two weeks ago so it cannot be "this week"
		const old = new Date()
		old.setDate(old.getDate() - 14)
		assert.notEqual(getWeekInfo(old).weekKey, current)
		assert.equal(computeStreakWeeks([old]), 0)
	})

	it('returns at least 1 when there is a submission in the current week', () => {
		assert.equal(computeStreakWeeks([new Date()]), 1)
	})

	it('counts consecutive prior weeks', () => {
		const thisWeek = new Date()
		const lastWeek = new Date()
		lastWeek.setDate(lastWeek.getDate() - 7)
		const twoWeeksAgo = new Date()
		twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)

		assert.equal(computeStreakWeeks([thisWeek, lastWeek, twoWeeksAgo]), 3)
	})

	it('stops counting when a week is missing', () => {
		const thisWeek = new Date()
		const twoWeeksAgo = new Date()
		twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)
		// Current week present, last week missing → streak is only 1
		assert.equal(computeStreakWeeks([thisWeek, twoWeeksAgo]), 1)
	})
})
