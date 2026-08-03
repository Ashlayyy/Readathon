import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { sign } from 'hono/jwt'
import { Hono } from 'hono'
import { User } from '../db/models/User.js'
import { startMemoryMongo, type MemoryMongo } from '../test/memoryMongo.js'
import { profileRoutes } from './profile.js'

async function sessionCookie(userId: string): Promise<string> {
  const token = await sign(
    { userId, exp: Math.floor(Date.now() / 1000) + 3600 },
    'dev-secret-change-in-production',
    'HS256',
  )
  return `realm_session=${token}`
}

describe('profile routes', () => {
  let db: MemoryMongo

  before(async () => {
    db = await startMemoryMongo()
  })

  after(async () => {
    await db.stop()
  })

  it('returns profile settings for the authenticated user', async () => {
    const user = await User.create({
      displayName: 'Profile Reader',
      email: 'profile@example.test',
      notifyStandings: true,
      notifyAnswers: true,
    })
    const app = new Hono()
    app.route('/api/profile', profileRoutes)

    const res = await app.request('http://localhost/api/profile', {
      headers: { Cookie: await sessionCookie(user._id.toString()) },
    })

    assert.equal(res.status, 200)
    const body = (await res.json()) as {
      user: {
        displayName: string
        notifyStandings: boolean
        notifyAnswers: boolean
        preferEventThemes: boolean
      }
      submissions: unknown[]
      questions: unknown[]
    }
    assert.equal(body.user.displayName, 'Profile Reader')
    assert.equal(body.user.notifyStandings, true)
    assert.equal(body.user.notifyAnswers, true)
    assert.equal(body.user.preferEventThemes, true)
    assert.deepEqual(body.submissions, [])
    assert.deepEqual(body.questions, [])
  })

  it('patches preferEventThemes', async () => {
    const user = await User.create({
      displayName: 'Theme Pref Reader',
      email: 'theme-pref@example.test',
    })
    const app = new Hono()
    app.route('/api/profile', profileRoutes)

    const res = await app.request('http://localhost/api/profile/settings', {
      method: 'PATCH',
      headers: {
        Cookie: await sessionCookie(user._id.toString()),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ preferEventThemes: false }),
    })

    assert.equal(res.status, 200)
    const body = (await res.json()) as {
      settings: { preferEventThemes: boolean }
    }
    assert.equal(body.settings.preferEventThemes, false)
    const refreshed = await User.findById(user._id)
    assert.equal(refreshed?.preferEventThemes, false)
  })
})
