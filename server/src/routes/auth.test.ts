import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { sign } from 'hono/jwt'
import { Hono } from 'hono'
import { User } from '../db/models/User.js'
import { startMemoryMongo, type MemoryMongo } from '../test/memoryMongo.js'
import { authRoutes } from './auth.js'

const SESSION_SECRET = 'dev-secret-change-in-production'

async function sessionCookie(userId: string): Promise<string> {
  const token = await sign(
    { userId, exp: Math.floor(Date.now() / 1000) + 3600 },
    SESSION_SECRET,
    'HS256',
  )
  return `realm_session=${token}`
}

describe('auth routes', () => {
  let db: MemoryMongo
  const app = new Hono()

  before(async () => {
    db = await startMemoryMongo()
    app.route('/api/auth', authRoutes)
  })

  after(async () => {
    await db.stop()
  })

  it('returns a null user without a session cookie', async () => {
    const res = await app.request('http://localhost/api/auth/me')

    assert.equal(res.status, 200)
    const body = (await res.json()) as {
      user: null
      account: null
      isMarketingHost: boolean
    }
    assert.equal(body.user, null)
    assert.equal(body.account, null)
    assert.equal(typeof body.isMarketingHost, 'boolean')
  })

  it('returns the session user', async () => {
    const user = await User.create({
      displayName: 'Session Reader',
      email: 'session@example.test',
      status: 'assigned',
      teamId: 'team-1',
    })

    const res = await app.request('http://localhost/api/auth/me', {
      headers: { Cookie: await sessionCookie(user._id.toString()) },
    })

    assert.equal(res.status, 200)
    const body = (await res.json()) as {
      user: { id: string; displayName: string; email: string; unreadAnswers: number }
    }
    assert.equal(body.user.id, user._id.toString())
    assert.equal(body.user.displayName, 'Session Reader')
    assert.equal(body.user.email, 'session@example.test')
    assert.equal(body.user.unreadAnswers, 0)
  })
})
