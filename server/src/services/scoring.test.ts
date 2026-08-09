import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getConfig } from './prompts.js'
import { calculateScore, validateSubmission, type SubmissionInput } from './scoring.js'
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

const TEST_COVER = 'https://covers.openlibrary.org/b/id/12345-L.jpg'

function baseInput(extra: Partial<SubmissionInput> = {}): SubmissionInput {
  return {
    bookTitle: 'Test Book',
    bookAuthor: 'Author',
    pageCount: 250,
    format: 'ebook',
    coverUrl: TEST_COVER,
    submissionType: 'add',
    promptIds: [],
    bonusCompetition: false,
    bonusTeamPromptIds: [],
    startedAt: '2026-07-01',
    finishedAt: '2026-07-10',
    ...extra,
  }
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

describe('validateSubmission dates', () => {
  it('requires start and finish dates', async () => {
    const user = mockUser('clerics')
    assert.equal(
      await validateSubmission(user, baseInput({ startedAt: '', finishedAt: '2026-07-10' })),
      'Start date is required.',
    )
    assert.equal(
      await validateSubmission(user, baseInput({ startedAt: '2026-07-01', finishedAt: '' })),
      'Finish date is required.',
    )
  })

  it('rejects finish before start', async () => {
    const user = mockUser('clerics')
    assert.equal(
      await validateSubmission(
        user,
        baseInput({ startedAt: '2026-07-10', finishedAt: '2026-07-01' }),
      ),
      'Finish date cannot be before the start date.',
    )
  })

  it('accepts valid start/finish range', async () => {
    const user = mockUser('clerics')
    assert.equal(await validateSubmission(user, baseInput()), null)
  })

  it('requires a cover URL', async () => {
    const user = mockUser('clerics')
    assert.equal(
      await validateSubmission(user, baseInput({ coverUrl: null })),
      'Cover is required.',
    )
    assert.equal(
      await validateSubmission(user, baseInput({ coverUrl: '' })),
      'Cover is required.',
    )
  })
})
