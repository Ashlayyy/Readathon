import { Hono } from 'hono'
import { Question } from '../db/models/Question.js'
import { Submission } from '../db/models/Submission.js'
import { withActive } from '../db/activeSubmission.js'
import { getSessionUser, requireAuth, userToPublic } from '../services/auth.js'
import { submissionToPublic } from '../services/scoring.js'
import { computeAchievements } from '../services/achievements.js'
import { buildProfileDashboard } from '../services/profileDashboard.js'
import { buildPaceSeries, paceSparklinePath } from '../services/pace.js'
import { lookupBookCover } from '../services/covers.js'

export const profileRoutes = new Hono()

profileRoutes.get('/', async (c) => {
  const user = requireAuth(await getSessionUser(c))

  const [submissions, questions] = await Promise.all([
    Submission.find(withActive({ userId: user._id })).sort({ createdAt: -1 }),
    Question.find({ userId: user._id }).sort({ createdAt: -1 }),
  ])

  const dashboard = await buildProfileDashboard(user, submissions)
  const achievements = computeAchievements(submissions)
  const pacePoints = buildPaceSeries(submissions)

  return c.json({
    user: {
      ...userToPublic(user),
      notifyStandings: user.notifyStandings ?? false,
      notifyAnswers: user.notifyAnswers ?? false,
      currentlyReading: user.currentlyReadingTitle?.trim()
        ? {
            title: user.currentlyReadingTitle.trim(),
            author: user.currentlyReadingAuthor?.trim() || '',
            coverUrl: user.currentlyReadingCoverUrl?.trim() || null,
            updatedAt: user.currentlyReadingUpdatedAt?.toISOString() ?? null,
          }
        : null,
    },
    submissions: submissions.map(submissionToPublic),
    questions: questions.map((q) => ({
      id: q._id.toString(),
      message: q.message,
      status: q.status,
      answer: q.answer,
      answeredAt: q.answeredAt,
      answeredByName: q.answeredByName,
      answerSeen: q.answerSeen,
      createdAt: q.createdAt,
    })),
    dashboard,
    achievements,
    pace: {
      points: pacePoints,
      sparklinePath: paceSparklinePath(pacePoints),
    },
  })
})

profileRoutes.patch('/settings', async (c) => {
  const user = requireAuth(await getSessionUser(c))
  const body = await c.req.json<{
    notifyStandings?: boolean
    notifyAnswers?: boolean
    currentlyReading?: {
      title?: string | null
      author?: string | null
      clear?: boolean
      lookupCover?: boolean
    }
  }>()

  if (typeof body.notifyStandings === 'boolean') user.notifyStandings = body.notifyStandings
  if (typeof body.notifyAnswers === 'boolean') user.notifyAnswers = body.notifyAnswers

  if (body.currentlyReading) {
    if (body.currentlyReading.clear) {
      user.currentlyReadingTitle = null
      user.currentlyReadingAuthor = null
      user.currentlyReadingCoverUrl = null
      user.currentlyReadingUpdatedAt = null
    } else {
      const title = body.currentlyReading.title?.trim() ?? ''
      const author = body.currentlyReading.author?.trim() ?? ''
      if (title.length >= 2) {
        user.currentlyReadingTitle = title
        user.currentlyReadingAuthor = author || null
        user.currentlyReadingUpdatedAt = new Date()
        if (body.currentlyReading.lookupCover !== false) {
          const cover = await lookupBookCover(title, author || undefined)
          user.currentlyReadingCoverUrl = cover?.coverUrl ?? null
        }
      }
    }
  }

  await user.save()

  return c.json({
    settings: {
      notifyStandings: user.notifyStandings,
      notifyAnswers: user.notifyAnswers,
      currentlyReading: user.currentlyReadingTitle?.trim()
        ? {
            title: user.currentlyReadingTitle.trim(),
            author: user.currentlyReadingAuthor?.trim() || '',
            coverUrl: user.currentlyReadingCoverUrl?.trim() || null,
            updatedAt: user.currentlyReadingUpdatedAt?.toISOString() ?? null,
          }
        : null,
    },
  })
})

profileRoutes.post('/questions/:id/seen', async (c) => {
  const user = requireAuth(await getSessionUser(c))
  const question = await Question.findOne({ _id: c.req.param('id'), userId: user._id })
  if (!question) return c.json({ error: 'Question not found' }, 404)

  question.answerSeen = true
  await question.save()
  return c.json({ ok: true })
})
