import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildTeamRace, type TeamRaceEvent, type TeamRaceTeamInput } from './teamRace.js'

const teams: TeamRaceTeamInput[] = [
	{ id: 'riders', name: 'Riders', color: '#c9a227', icon: '♞', memberCount: 4 },
	{ id: 'wielders', name: 'Wielders', color: '#4a8f62', icon: '⚔', memberCount: 2 },
]

function at(year: number, month: number, day: number, hour = 15): Date {
	return new Date(year, month, day, hour, 0, 0, 0)
}

function event(partial: Partial<TeamRaceEvent> & Pick<TeamRaceEvent, 'createdAt' | 'userTeamId' | 'submissionType'>): TeamRaceEvent {
	return {
		targetTeamId: null,
		promptPoints: 0,
		bonusPoints: 0,
		pageBonus: 0,
		pageCount: 0,
		...partial,
	}
}

describe('buildTeamRace', () => {
	it('credits adds and splits sabotage the same way standings do', () => {
		const race = buildTeamRace({
			teams,
			startingXp: 100,
			today: at(2026, 6, 2),
			rangeFrom: at(2026, 6, 2, 0),
			rangeTo: at(2026, 6, 3, 0),
			events: [
				event({
					createdAt: at(2026, 6, 1, 11),
					userTeamId: 'riders',
					submissionType: 'add',
					promptPoints: 20,
					pageCount: 300,
				}),
				event({
					createdAt: at(2026, 6, 2, 18),
					userTeamId: 'wielders',
					submissionType: 'sabotage',
					targetTeamId: 'riders',
					promptPoints: -15,
					pageBonus: 5,
					pageCount: 120,
				}),
			],
		})

		assert.deepEqual(race.dates, ['2026-07-01', '2026-07-02'])
		assert.equal(race.rangeIsAllTime, false)

		const riders = race.teams[0]!
		const wielders = race.teams[1]!
		assert.deepEqual(riders.seasonValues, [120, 105])
		assert.deepEqual(wielders.seasonValues, [100, 105])
		assert.deepEqual(riders.windowValues, [0, -15])
		assert.deepEqual(wielders.windowValues, [0, 5])
		assert.equal(riders.seasonPoints, 105)
		assert.equal(wielders.seasonPoints, 105)
		assert.equal(riders.windowPoints, -15)
		assert.equal(wielders.windowPoints, 5)
		assert.equal(riders.windowLost, 15)
		assert.equal(wielders.windowDealt, 15)
		assert.equal(wielders.windowGained, 5)
		assert.equal(riders.books, 0)
		assert.equal(wielders.books, 1)
		assert.equal(wielders.pages, 120)
		assert.equal(riders.seasonValues.at(-1), riders.seasonPoints)
		assert.equal(wielders.windowValues.at(-1), wielders.windowPoints)
	})

	it('keeps all-time window and season series identical, including starting points', () => {
		const race = buildTeamRace({
			teams,
			startingXp: 100,
			today: at(2026, 6, 2),
			rangeFrom: null,
			rangeTo: null,
			events: [
				event({
					createdAt: at(2026, 6, 1),
					userTeamId: 'riders',
					submissionType: 'add',
					promptPoints: 20,
					bonusPoints: 10,
					pageBonus: 8,
					pageCount: 400,
				}),
			],
		})

		assert.equal(race.rangeIsAllTime, true)
		assert.equal(race.dates[0], '2026-06-30')
		const riders = race.teams[0]!
		assert.deepEqual(riders.windowValues, riders.seasonValues)
		assert.equal(riders.windowValues[0], 100)
		assert.equal(riders.seasonPoints, 138)
		assert.equal(riders.windowPoints, 138)
		assert.equal(riders.books, 1)
		assert.equal(riders.pages, 400)
		assert.equal(race.teams[1]!.seasonPoints, 100)
	})

	it('ignores readers without a realm and events outside the range end', () => {
		const race = buildTeamRace({
			teams,
			startingXp: 100,
			today: at(2026, 6, 8),
			rangeFrom: at(2026, 6, 8, 0),
			rangeTo: at(2026, 6, 9, 0),
			events: [
				event({
					createdAt: at(2026, 6, 8, 12),
					userTeamId: null,
					submissionType: 'sabotage',
					targetTeamId: 'riders',
					promptPoints: -40,
				}),
				event({
					createdAt: at(2026, 6, 9, 1),
					userTeamId: 'wielders',
					submissionType: 'add',
					promptPoints: 50,
				}),
			],
		})

		assert.equal(race.teams[0]!.windowPoints, 0)
		assert.equal(race.teams[0]!.seasonPoints, 100)
		assert.equal(race.teams[1]!.windowPoints, 0)
		assert.equal(race.teams[1]!.books, 0)
		assert.ok(!race.dates.includes('2026-07-09'))
	})

	it('returns no dates when the range is inverted', () => {
		const race = buildTeamRace({
			teams,
			startingXp: 100,
			today: at(2026, 6, 2),
			rangeFrom: at(2026, 6, 10, 0),
			rangeTo: at(2026, 6, 4, 0),
			events: [],
		})
		assert.deepEqual(race.dates, [])
		assert.equal(race.teams[0]!.seasonPoints, 100)
		assert.equal(race.teams[0]!.memberCount, 4)
	})
})
