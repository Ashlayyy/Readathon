import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
	buildTeamChatMessage,
	DEFAULT_TEAM_CHAT_ADD_TEMPLATES,
	DEFAULT_TEAM_CHAT_SABOTAGE_TEMPLATES,
	normalizeTemplateList,
	renderTeamChatTemplate,
} from './teamChatMessage.js'

describe('renderTeamChatTemplate', () => {
	it('replaces {{variables}}', () => {
		assert.equal(
			renderTeamChatTemplate('Hi {{displayName}} — {{bookTitle}}', {
				displayName: 'Ash',
				bookTitle: 'Dune',
			}),
			'Hi Ash — Dune',
		)
	})

	it('replaces missing vars with empty string', () => {
		assert.equal(renderTeamChatTemplate('x{{missing}}y', {}), 'xy')
	})
})

describe('buildTeamChatMessage', () => {
	it('uses the first add default when rng is 0', () => {
		const msg = buildTeamChatMessage(
			{
				displayName: 'Ash',
				bookTitle: 'The Name of the Wind',
				teamName: 'Wielders',
				submissionType: 'add',
			},
			{ rng: () => 0 },
		)
		assert.equal(
			msg,
			renderTeamChatTemplate(DEFAULT_TEAM_CHAT_ADD_TEMPLATES[0]!, {
				displayName: 'Ash',
				bookTitle: 'The Name of the Wind',
				teamName: 'Wielders',
				targetTeamName: 'a rival',
				submissionType: 'add',
			}),
		)
	})

	it('uses custom templates from settings when provided', () => {
		const msg = buildTeamChatMessage(
			{
				displayName: 'Ash',
				bookTitle: 'Dune',
				teamName: 'Riders',
				submissionType: 'add',
			},
			{
				templates: ['{{displayName}} read {{bookTitle}}'],
				rng: () => 0,
			},
		)
		assert.equal(msg, 'Ash read Dune')
	})

	it('fills targetTeamName on sabotage', () => {
		const msg = buildTeamChatMessage(
			{
				displayName: 'Ash',
				bookTitle: 'Dune',
				teamName: 'Wielders',
				submissionType: 'sabotage',
				targetTeamName: 'Riders',
			},
			{
				templates: ['{{displayName}} → {{targetTeamName}}: {{bookTitle}}'],
				rng: () => 0,
			},
		)
		assert.equal(msg, 'Ash → Riders: Dune')
	})

	it('falls back to "a rival" when sabotage has no target', () => {
		const msg = buildTeamChatMessage(
			{
				displayName: 'Ash',
				bookTitle: 'Dune',
				teamName: 'Wielders',
				submissionType: 'sabotage',
			},
			{
				templates: ['hit {{targetTeamName}}'],
				rng: () => 0,
			},
		)
		assert.equal(msg, 'hit a rival')
	})

	it('uses sabotage defaults when rng is 0', () => {
		const msg = buildTeamChatMessage(
			{
				displayName: 'Ash',
				bookTitle: 'Dune',
				teamName: 'Wielders',
				submissionType: 'sabotage',
				targetTeamName: 'Riders',
			},
			{ rng: () => 0 },
		)
		assert.equal(
			msg,
			renderTeamChatTemplate(DEFAULT_TEAM_CHAT_SABOTAGE_TEMPLATES[0]!, {
				displayName: 'Ash',
				bookTitle: 'Dune',
				teamName: 'Wielders',
				targetTeamName: 'Riders',
				submissionType: 'sabotage',
			}),
		)
	})

	it('prefers sabotage templates without target when target is missing', () => {
		const msg = buildTeamChatMessage(
			{
				displayName: 'Ash',
				bookTitle: 'Dune',
				teamName: 'Wielders',
				submissionType: 'sabotage',
			},
			{
				templates: [
					'with target {{targetTeamName}}',
					'no target line for {{displayName}}',
				],
				rng: () => 0,
			},
		)
		assert.equal(msg, 'no target line for Ash')
	})

	it('falls back to a plain line when the template pool is empty', () => {
		const msg = buildTeamChatMessage(
			{
				displayName: 'Ash',
				bookTitle: 'Dune',
				teamName: 'Wielders',
				submissionType: 'add',
			},
			{ templates: ['   '], rng: () => 0 },
		)
		assert.match(msg, /Ash.*Dune.*Wielders/)
	})
})

describe('normalizeTemplateList', () => {
	it('filters non-strings and trims entries', () => {
		assert.deepEqual(
			normalizeTemplateList(['  hi ', '', 42, null, 'there']),
			['hi', 'there'],
		)
		assert.deepEqual(normalizeTemplateList('nope'), [])
	})
})
