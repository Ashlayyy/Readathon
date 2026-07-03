import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getConfig } from './prompts.js'
import { calculateScore, type SubmissionInput } from './scoring.js'
import type { HydratedDocument } from 'mongoose'
import type { IUser } from '../db/models/User.js'

function mockUser(teamId: string): HydratedDocument<IUser> {
  return {
    _id: { toString: () => 'user1' } as IUser['_id'],
    teamId,
    status: 'assigned',
    displayName: 'Test',
    email: 'test@example.com',
  } as HydratedDocument<IUser>
}

describe('calculateScore', () => {
  const config = getConfig()
  const positivePrompt = config.prompts.positive[0]!
  const negativePrompt = config.prompts.negative[0]!

  it('adds page bonus for positive submission', () => {
    const user = mockUser('clerics')
    const input: SubmissionInput = {
      bookTitle: 'Test Book',
      bookAuthor: 'Author',
      pageCount: 250,
      format: 'ebook',
      submissionType: 'add',
      promptIds: [positivePrompt.id],
      bonusCompetition: false,
      bonusTeamPromptIds: [],
    }
    const score = calculateScore(user, input)
    assert.ok(score.pageBonus > 0)
    assert.equal(score.totalImpact, score.promptPoints + score.bonusPoints + score.pageBonus)
  })

  it('sabotage uses negative prompt points', () => {
    const user = mockUser('clerics')
    const input: SubmissionInput = {
      bookTitle: 'Attack Book',
      bookAuthor: 'Author',
      pageCount: 100,
      format: 'physical',
      submissionType: 'sabotage',
      targetTeamId: 'rogues',
      promptIds: [negativePrompt.id],
      bonusCompetition: false,
      bonusTeamPromptIds: [],
    }
    const score = calculateScore(user, input)
    assert.ok(score.promptPoints < 0)
  })
})
