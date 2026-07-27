import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { mock } from 'node:test'
import { startMemoryMongo, type MemoryMongo } from '../test/memoryMongo.js'
import {
  getDiscordRoleId,
  getDiscordWebhookUrl,
  updateSiteSettings,
} from './siteSettings.js'
import {
  DISCORD_TEST_WEBHOOK_CONTENT,
  sendDiscordWebhookTest,
} from './discord.js'

describe('Discord webhook test sender', () => {
  let db: MemoryMongo

  before(async () => {
    db = await startMemoryMongo()
  })

  after(async () => {
    await db.stop()
  })

  it('reads normalized webhook and role settings', async () => {
    await updateSiteSettings({
      discordWebhookUrl: ' https://discord.com/api/webhooks/123/token ',
      discordRoleId: ' <@&123456789> ',
    })

    assert.equal(getDiscordWebhookUrl(), 'https://discord.com/api/webhooks/123/token')
    assert.equal(getDiscordRoleId(), '123456789')
  })

  it('sends the safe test content and disables mentions', async () => {
    const originalFetch = globalThis.fetch
    const calls: Array<{ url: string; init?: RequestInit }> = []
    globalThis.fetch = mock.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: url.toString(), init })
      return new Response('{}', { status: 200 })
    }) as typeof fetch

    try {
      const result = await sendDiscordWebhookTest()

      assert.deepEqual(result, { sent: true })
      assert.equal(calls.length, 1)
      assert.equal(calls[0]!.url, 'https://discord.com/api/webhooks/123/token?wait=true')
      assert.deepEqual(JSON.parse(String(calls[0]!.init!.body)), {
        content: DISCORD_TEST_WEBHOOK_CONTENT,
        allowed_mentions: { parse: [] },
      })
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('returns an error when Discord rejects the test message', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = mock.fn(async () => new Response('bad webhook', { status: 401 })) as typeof fetch

    try {
      assert.deepEqual(await sendDiscordWebhookTest(), {
        sent: false,
        error: 'Discord returned 401',
      })
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
