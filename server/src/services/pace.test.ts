import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildPaceSeries, paceSparklinePath } from './pace.js'

describe('buildPaceSeries', () => {
	it('computes pages/day from started and finished dates', () => {
		const points = buildPaceSeries([
			{
				bookTitle: 'Slow',
				pageCount: 300,
				startedAt: '2026-07-01',
				finishedAt: '2026-07-11',
			},
		])
		assert.equal(points.length, 1)
		assert.equal(points[0]!.pagesPerDay, 30)
	})

	it('sorts by finish date', () => {
		const points = buildPaceSeries([
			{
				bookTitle: 'B',
				pageCount: 100,
				startedAt: '2026-07-01',
				finishedAt: '2026-07-10',
			},
			{
				bookTitle: 'A',
				pageCount: 100,
				startedAt: '2026-06-01',
				finishedAt: '2026-06-05',
			},
		])
		assert.deepEqual(
			points.map((p) => p.title),
			['A', 'B'],
		)
	})

	it('builds a sparkline path when there are 2+ pace values', () => {
		const points = buildPaceSeries([
			{
				bookTitle: 'A',
				pageCount: 100,
				startedAt: '2026-07-01',
				finishedAt: '2026-07-05',
			},
			{
				bookTitle: 'B',
				pageCount: 200,
				startedAt: '2026-07-06',
				finishedAt: '2026-07-10',
			},
		])
		const path = paceSparklinePath(points)
		assert.ok(path)
		assert.match(path!, /^M/)
	})

	it('returns null sparkline for fewer than 2 paced books', () => {
		assert.equal(paceSparklinePath([]), null)
		assert.equal(
			paceSparklinePath(
				buildPaceSeries([
					{
						bookTitle: 'Only',
						pageCount: 100,
						startedAt: '2026-07-01',
						finishedAt: '2026-07-02',
					},
				]),
			),
			null,
		)
	})

	it('uses createdAt when finishedAt is missing', () => {
		const points = buildPaceSeries([
			{
				bookTitle: 'Logged',
				pageCount: 200,
				startedAt: '2026-07-01',
				createdAt: new Date('2026-07-10T18:00:00Z'),
			},
		])
		assert.equal(points.length, 1)
		assert.equal(points[0]!.at, '2026-07-10')
	})

	it('skips books with no finish date and null pagesPerDay for bad ranges', () => {
		const points = buildPaceSeries([
			{ bookTitle: 'No dates', pageCount: 100 },
			{
				bookTitle: 'Reversed',
				pageCount: 100,
				startedAt: '2026-07-10',
				finishedAt: '2026-07-01',
			},
			{
				bookTitle: 'Zero pages',
				pageCount: 0,
				startedAt: '2026-07-01',
				finishedAt: '2026-07-05',
			},
		])
		assert.equal(points.length, 2)
		assert.equal(points[0]!.pagesPerDay, null)
		assert.equal(points[1]!.pagesPerDay, null)
	})

	it('draws a flat sparkline when all pace values match', () => {
		const points = buildPaceSeries([
			{
				bookTitle: 'A',
				pageCount: 100,
				startedAt: '2026-07-01',
				finishedAt: '2026-07-05',
			},
			{
				bookTitle: 'B',
				pageCount: 100,
				startedAt: '2026-07-06',
				finishedAt: '2026-07-10',
			},
		])
		const path = paceSparklinePath(points)
		assert.ok(path)
		assert.match(path!, /^M[\d.]+ [\d.]+ L/)
	})
})
