import { Hono } from 'hono'
import { Question } from '../db/models/Question.js'
import { Submission } from '../db/models/Submission.js'
import { getSessionUser, requireAuth, userToPublic } from '../services/auth.js'
import { submissionToPublic } from '../services/scoring.js'

export const profileRoutes = new Hono()

profileRoutes.get('/', async (c) => {
  const user = requireAuth(await getSessionUser(c))

  const [submissions, questions] = await Promise.all([
    Submission.find({ userId: user._id }).sort({ createdAt: -1 }),
    Question.find({ userId: user._id }).sort({ createdAt: -1 }),
  ])

  return c.json({
    user: {
      ...userToPublic(user),
      notifyStandings: user.notifyStandings ?? false,
      notifyAnswers: user.notifyAnswers ?? false,
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
  })
})

profileRoutes.patch('/settings', async (c) => {
  const user = requireAuth(await getSessionUser(c))
  const body = await c.req.json<{ notifyStandings?: boolean; notifyAnswers?: boolean }>()

  if (typeof body.notifyStandings === 'boolean') user.notifyStandings = body.notifyStandings
  if (typeof body.notifyAnswers === 'boolean') user.notifyAnswers = body.notifyAnswers
  await user.save()

  return c.json({
    settings: {
      notifyStandings: user.notifyStandings,
      notifyAnswers: user.notifyAnswers,
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
