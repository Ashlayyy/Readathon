import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parsePromptPackJson } from './promptImport.js'

describe('parsePromptPackJson', () => {
  it('parses attack-style sets with go-live dates', () => {
    const rows = parsePromptPackJson({
      kind: 'negative',
      sets: [
        {
          goesLiveAt: '2026-07-01T00:00:00.000Z',
          prompts: [
            {
              id: 'attack-s01-test',
              label: 'Test prompt',
              points: -15,
            },
          ],
        },
        {
          goesLiveAt: '2026-07-15T00:00:00.000Z',
          prompts: [
            {
              id: 'attack-s02-test',
              label: 'Later prompt',
              points: -5,
            },
          ],
        },
      ],
    })

    assert.equal(rows.length, 2)
    assert.equal(rows[0]?.goesLiveAt, '2026-07-01T00:00:00.000Z')
    assert.equal(rows[1]?.goesLiveAt, '2026-07-15T00:00:00.000Z')
    assert.equal(rows[0]?.points, -15)
  })

  it('normalizes positive points for negative kind', () => {
    const rows = parsePromptPackJson({
      kind: 'negative',
      prompts: [{ id: 'x', label: 'Y', points: 10 }],
    })
    assert.equal(rows[0]?.points, -10)
  })
})
