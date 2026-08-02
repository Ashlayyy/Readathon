import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeMonthlyEventSlot } from './monthlyEvents.js'
import { mergeActiveMonthlyEvent } from './prompts.js'
import { getStaticConfig } from '../config.js'

describe('mergeActiveMonthlyEvent (preview)', () => {
  it('merges event branding and copy onto base config', () => {
    const base = getStaticConfig()
    const slot = normalizeMonthlyEventSlot({
      status: 'draft',
      title: 'Spooky',
      from: '2026-10-01',
      to: '2026-10-31',
      siteOverride: {
        event: { tagline: 'Boo' },
        copy: { enterCta: 'Enter the crypt' },
        branding: { theme: { accent: '#ff00aa' } },
      },
    })!
    const merged = mergeActiveMonthlyEvent(base, slot)
    assert.equal(merged.event.tagline, 'Boo')
    assert.equal(merged.copy.enterCta, 'Enter the crypt')
    const theme = (merged.branding as { theme?: Record<string, string> }).theme
    assert.equal(theme?.accent, '#ff00aa')
  })
})
