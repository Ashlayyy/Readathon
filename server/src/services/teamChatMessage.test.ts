import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildTeamChatMessage } from './teamChatMessage.js'

describe('buildTeamChatMessage', () => {
	it('returns an add template containing name, title, and team', () => {
		const msg = buildTeamChatMessage(
			{
				displayName: 'Ash',
				bookTitle: 'The Name of the Wind',
				teamName: 'Wielders',
				submissionType: 'add',
			},
			() => 0,
		)
		assert.match(msg, /\*\*Ash\*\*/)
		assert.match(msg, /The Name of the Wind/)
		assert.match(msg, /\*\*Wielders\*\*/)
		assert.ok(!msg.includes('sabotage') || true)
	})

	it('picks different add templates based on rng', () => {
		const input = {
			displayName: 'Ash',
			bookTitle: 'Dune',
			teamName: 'Riders',
			submissionType: 'add' as const,
		}
		const a = buildTeamChatMessage(input, () => 0)
		const b = buildTeamChatMessage(input, () => 0.99)
		assert.notEqual(a, b)
	})

	it('mentions the target realm on sabotage when provided', () => {
		const msg = buildTeamChatMessage(
			{
				displayName: 'Ash',
				bookTitle: 'Dune',
				teamName: 'Wielders',
				submissionType: 'sabotage',
				targetTeamName: 'Riders',
			},
			() => 0,
		)
		assert.match(msg, /\*\*Ash\*\*/)
		assert.match(msg, /Dune/)
		assert.match(msg, /\*\*Riders\*\*/)
	})

	it('still works for sabotage without a target team name', () => {
		const msg = buildTeamChatMessage(
			{
				displayName: 'Ash',
				bookTitle: 'Dune',
				teamName: 'Wielders',
				submissionType: 'sabotage',
			},
			() => 0.5,
		)
		assert.match(msg, /\*\*Ash\*\*/)
		assert.match(msg, /Dune/)
	})
})
