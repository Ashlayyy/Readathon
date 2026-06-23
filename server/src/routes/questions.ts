import { Hono } from 'hono'
import { Question } from '../db/models/Question.js'
import { getSessionUser, requireAuth } from '../services/auth.js'

export const questionRoutes = new Hono()

questionRoutes.post('/', async (c) => {
  const user = requireAuth(await getSessionUser(c))
  const { message } = await c.req.json<{ message: string }>()

  const trimmed = message?.trim()
  if (!trimmed || trimmed.length < 10) {
    return c.json({ error: 'Please write at least 10 characters.' }, 400)
  }
  if (trimmed.length > 2000) {
    return c.json({ error: 'Message must be 2000 characters or fewer.' }, 400)
  }

  const question = await Question.create({
    userId: user._id,
    displayName: user.displayName,
    email: user.email,
    message: trimmed,
  })

  return c.json({
    question: {
      id: question._id.toString(),
      message: question.message,
      status: question.status,
      createdAt: question.createdAt,
    },
  })
})
