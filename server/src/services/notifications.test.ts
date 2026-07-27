import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { mock } from 'node:test'
import { User } from '../db/models/User.js'
import { startMemoryMongo, type MemoryMongo } from '../test/memoryMongo.js'
import { notifyQuestionAnswered, notifyStandingsPublished } from './notifications.js'

describe('notifications', () => {
  let db: MemoryMongo
  const savedApiKey = process.env.RESEND_API_KEY

  before(async () => {
    db = await startMemoryMongo()
    process.env.RESEND_API_KEY = 'test-key'
  })

  after(async () => {
    await db.stop()
    if (savedApiKey === undefined) delete process.env.RESEND_API_KEY
    else process.env.RESEND_API_KEY = savedApiKey
  })

  it('uses the email transport for answered-question notifications', async () => {
    const originalFetch = globalThis.fetch
    const sent: RequestInit[] = []
    globalThis.fetch = mock.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      sent.push(init!)
      return new Response('{}', { status: 200 })
    }) as typeof fetch

    try {
      await notifyQuestionAnswered({
        userId: 'reader-id',
        displayName: 'Reader',
        email: 'reader@example.test',
        question: 'What does this prompt mean?',
        answer: 'Read any genre you enjoy.',
        adminName: 'Admin',
      })

      assert.equal(sent.length, 1)
      const body = JSON.parse(String(sent[0]!.body)) as { to: string[]; subject: string }
      assert.deepEqual(body.to, ['reader@example.test'])
      assert.match(body.subject, /answer/i)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('counts successful and failed standings email sends', async () => {
    await User.create([
      { displayName: 'First', email: 'first@example.test', notifyStandings: true },
      { displayName: 'Second', email: 'second@example.test', notifyStandings: true },
    ])
    const originalFetch = globalThis.fetch
    let requestCount = 0
    globalThis.fetch = mock.fn(async () => {
      requestCount++
      return new Response(
        requestCount === 1 ? '{}' : 'email rejected',
        { status: requestCount === 1 ? 200 : 500 },
      )
    }) as typeof fetch

    try {
      assert.deepEqual(
        await notifyStandingsPublished({ weekLabel: 'Week 1' }),
        { sent: 1, skipped: 1 },
      )
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
