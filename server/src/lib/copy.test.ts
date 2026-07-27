import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { formatCopy, getCopyVars } from './copy.js'
import { getStaticConfig } from '../config.js'

describe('formatCopy', () => {
	it('substitutes known placeholders', () => {
		assert.equal(
			formatCopy('{eventName} — {teamCount} teams', {
				eventName: 'Readathon',
				teamCount: 4,
			}),
			'Readathon — 4 teams',
		)
	})

	it('leaves unknown placeholders intact', () => {
		assert.equal(formatCopy('Hello {missing}', { eventName: 'X' }), 'Hello {missing}')
	})
})

describe('getCopyVars', () => {
	it('derives counts from loaded config', () => {
		const config = getStaticConfig()
		const vars = getCopyVars()

		assert.equal(vars.eventName, config.event.name)
		assert.equal(vars.eventSubtitle, config.event.subtitle)
		assert.equal(vars.teamCount, config.teams.length)
		assert.equal(vars.positiveCount, config.prompts.positive.length)
		assert.equal(vars.negativeCount, config.prompts.negative.length)
		assert.equal(vars.promptCount, vars.positiveCount + vars.negativeCount)
		assert.equal(
			vars.maxPrompts,
			(config.scoringRules.maxPromptsPerBook as number) ?? 5,
		)
	})
})
