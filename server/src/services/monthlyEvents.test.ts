import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  findOverlappingScheduled,
  isFirstMondayOfMonth,
  isMonthlyEventLive,
  normalizeMonthlyEventSlot,
  validateMonthlyEventsList,
} from './monthlyEvents.js'

describe('monthlyEvents', () => {
  it('treats draft slots as never live', () => {
    const slot = normalizeMonthlyEventSlot({
      status: 'draft',
      title: 'August',
      from: '2026-08-01',
      to: '2026-08-31',
      timezone: 'UTC',
    })!
    assert.equal(isMonthlyEventLive(slot, new Date('2026-08-15T12:00:00Z')), false)
  })

  it('is live only inside the scheduled window', () => {
    const slot = normalizeMonthlyEventSlot({
      status: 'scheduled',
      title: 'August',
      from: '2026-08-01',
      to: '2026-08-31',
      timezone: 'UTC',
    })!
    assert.equal(isMonthlyEventLive(slot, new Date('2026-07-31T12:00:00Z')), false)
    assert.equal(isMonthlyEventLive(slot, new Date('2026-08-01T12:00:00Z')), true)
    assert.equal(isMonthlyEventLive(slot, new Date('2026-08-31T12:00:00Z')), true)
    assert.equal(isMonthlyEventLive(slot, new Date('2026-09-01T12:00:00Z')), false)
  })

  it('rejects overlapping scheduled themes', () => {
    const a = normalizeMonthlyEventSlot({
      id: 'a',
      status: 'scheduled',
      title: 'A',
      from: '2026-08-01',
      to: '2026-08-20',
    })!
    const b = normalizeMonthlyEventSlot({
      id: 'b',
      status: 'scheduled',
      title: 'B',
      from: '2026-08-15',
      to: '2026-08-31',
    })!
    assert.ok(findOverlappingScheduled([a, b], b))
    assert.match(validateMonthlyEventsList([a, b]) ?? '', /overlap/i)
  })

  it('allows draft to overlap a scheduled theme', () => {
    const live = normalizeMonthlyEventSlot({
      id: 'a',
      status: 'scheduled',
      title: 'A',
      from: '2026-08-01',
      to: '2026-08-31',
    })!
    const draft = normalizeMonthlyEventSlot({
      id: 'b',
      status: 'draft',
      title: 'B',
      from: '2026-08-01',
      to: '2026-08-31',
    })!
    assert.equal(validateMonthlyEventsList([live, draft]), null)
  })

  it('detects first Monday of the month', () => {
    // 2026-08-03 is the first Monday of August 2026
    assert.equal(isFirstMondayOfMonth(new Date('2026-08-03T10:00:00Z'), 'UTC'), true)
    assert.equal(isFirstMondayOfMonth(new Date('2026-08-10T10:00:00Z'), 'UTC'), false)
  })
})
