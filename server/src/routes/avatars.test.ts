import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Hono } from 'hono'
import { avatarRoutes } from './avatars.js'

describe('avatar routes', () => {
  it('returns 404 for a missing avatar file', async () => {
    const app = new Hono()
    app.route('/api/avatars', avatarRoutes)

    const res = await app.request(
      'http://localhost/api/avatars/files/not-a-real-avatar.png',
    )

    assert.equal(res.status, 404)
    assert.deepEqual(await res.json(), { error: 'Not found' })
  })
})
