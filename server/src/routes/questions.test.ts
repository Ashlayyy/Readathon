import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { sign } from 'hono/jwt'
import { Hono } from 'hono'
import { User } from '../db/models/User.js'
import { Question } from '../db/models/Question.js'
import { startMemoryMongo, type MemoryMongo } from '../test/memoryMongo.js'
import { questionRoutes } from './questions.js'

const SESSION_SECRET = 'dev-secret-change-in-production'

async function sessionCookie(userId: string): Promise<string> {
  const token = await sign(
    { userId, exp: Math.floor(Date.now() / 1000) + 3600 },
    SESSION_SECRET,
    'HS256',
  )
  return `realm_session=${token}`
}

describe('question routes', () => {
  let db: MemoryMongo

  before(async () => {
    db = await startMemoryMongo()
  })

  after(async () => {
    await db.stop()
  })

  it('creates a question for an authenticated user', async () => {
    const user = await User.create({
      displayName: 'Question Reader',
      email: 'question@example.test',
    })
    const app = new Hono()
    app.route('/api/questions', questionRoutes)

    const res = await app.request('http://localhost/api/questions', {
      method: 'POST',
      headers: {
        Cookie: await sessionCookie(user._id.toString()),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: 'Could you explain how weekly prompts work?' }),
    })

    assert.equal(res.status, 200)
    const body = (await res.json()) as { question: { message: string; status: string } }
    assert.equal(body.question.message, 'Could you explain how weekly prompts work?')
    assert.equal(body.question.status, 'unread')
    assert.equal(await Question.countDocuments({ userId: user._id }), 1)
  })
})
