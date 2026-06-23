import { Hono } from 'hono'
import { Submission } from '../db/models/Submission.js'
import { getSessionUser, requireAuth } from '../services/auth.js'
import {
  calculateScore,
  submissionToPublic,
  validateSubmission,
  type SubmissionInput,
} from '../services/scoring.js'

function optionalDate(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed || null
}

export const submissionRoutes = new Hono()

submissionRoutes.get('/mine', async (c) => {
  const user = requireAuth(await getSessionUser(c))
  const rows = await Submission.find({ userId: user._id }).sort({ createdAt: -1 })
  return c.json({ submissions: rows.map(submissionToPublic) })
})

submissionRoutes.post('/', async (c) => {
  const user = requireAuth(await getSessionUser(c))
  const body = await c.req.json<SubmissionInput>()

  const error = await validateSubmission(user, body)
  if (error) return c.json({ error }, 400)

  const score = calculateScore(user, body)

  const submission = await Submission.create({
    userId: user._id,
    bookTitle: body.bookTitle.trim(),
    bookAuthor: body.bookAuthor.trim(),
    pageCount: body.pageCount,
    format: body.format,
    startedAt: optionalDate(body.startedAt),
    finishedAt: optionalDate(body.finishedAt),
    isReread: body.isReread,
    submissionType: body.submissionType,
    targetTeamId: body.targetTeamId ?? null,
    promptIds: body.promptIds,
    bonusCompetition: body.bonusCompetition,
    bonusTeamPromptIds: body.bonusTeamPromptIds,
    pageBonus: score.pageBonus,
    promptPoints: score.promptPoints,
    bonusPoints: score.bonusPoints,
    totalImpact: score.totalImpact,
  })

  return c.json({ submission: submissionToPublic(submission), breakdown: score })
})
