import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { sign } from 'hono/jwt'
import { Hono } from 'hono'
import { Submission } from '../db/models/Submission.js'
import { User } from '../db/models/User.js'
import { startMemoryMongo, type MemoryMongo } from '../test/memoryMongo.js'
import { submissionRoutes } from './submissions.js'

async function sessionCookie(userId: string): Promise<string> {
  const token = await sign(
    { userId, exp: Math.floor(Date.now() / 1000) + 3600 },
    'dev-secret-change-in-production',
    'HS256',
  )
  return `realm_session=${token}`
}

describe('submission routes', () => {
  let db: MemoryMongo

  before(async () => {
    db = await startMemoryMongo()
  })

  after(async () => {
    await db.stop()
  })

  it('lists only the authenticated user’s active submissions', async () => {
    const [owner, other] = await User.create([
      { displayName: 'Owner', email: 'owner@example.test' },
      { displayName: 'Other', email: 'other@example.test' },
    ])
    await Submission.create([
      {
        userId: owner._id,
        bookTitle: 'Owned Book',
        bookAuthor: 'Author One',
        pageCount: 300,
        format: 'print',
        submissionType: 'add',
        promptIds: [],
        totalImpact: 50,
      },
      {
        userId: other._id,
        bookTitle: 'Other Book',
        bookAuthor: 'Author Two',
        pageCount: 200,
        format: 'ebook',
        submissionType: 'add',
        promptIds: [],
        totalImpact: 10,
      },
    ])
    const app = new Hono()
    app.route('/api/submissions', submissionRoutes)

    const res = await app.request('http://localhost/api/submissions/mine', {
      headers: { Cookie: await sessionCookie(owner._id.toString()) },
    })

    assert.equal(res.status, 200)
    const body = (await res.json()) as {
      submissions: Array<{ bookTitle: string; totalImpact: number }>
    }
    assert.equal(body.submissions.length, 1)
    assert.equal(body.submissions[0]!.bookTitle, 'Owned Book')
    assert.equal(body.submissions[0]!.totalImpact, 50)
  })
})
