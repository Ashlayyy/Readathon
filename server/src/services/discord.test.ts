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
  const prevEncKey = process.env.SETTINGS_ENCRYPTION_KEY

  before(async () => {
    process.env.SETTINGS_ENCRYPTION_KEY = 'test-encryption-key-for-discord-tests'
    db = await startMemoryMongo()
    await updateSiteSettings({
      discordTestDeliveryMode: 'webhook',
      discordProductionDeliveryMode: 'webhook',
      discordBotToken: 'test-bot-token',
      discordGuildId: '111111111111111111',
      discordProductionWebhookUrl: ' https://discord.com/api/webhooks/123/token ',
      discordProductionRoleId: ' <@&123456789012345678> ',
      discordTestWebhookUrl: 'https://discord.com/api/webhooks/999/test',
      discordTestRoleId: '999999999999999999',
    })
  })

  after(async () => {
    if (prevEncKey === undefined) delete process.env.SETTINGS_ENCRYPTION_KEY
    else process.env.SETTINGS_ENCRYPTION_KEY = prevEncKey
    await db.stop()
  })

  it('reads normalized webhook and role settings', async () => {
    assert.equal(getDiscordWebhookUrl(), 'https://discord.com/api/webhooks/123/token')
    assert.equal(getDiscordRoleId(), '123456789012345678')
  })

  it('sends the safe test content and disables mentions', async () => {
    const { sendDiscordChannelMessage } = await import('./discord.js')
    const originalFetch = globalThis.fetch
    const calls: Array<{ url: string; init?: RequestInit }> = []
    globalThis.fetch = mock.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: url.toString(), init })
      return new Response('{}', { status: 200 })
    }) as typeof fetch

    try {
      const result = await sendDiscordChannelMessage({
        channel: 'test',
        withPing: false,
      })

      assert.equal(result.sent, true)
      assert.equal(calls.length, 1)
      assert.equal(calls[0]!.url, 'https://discord.com/api/webhooks/999/test?wait=true')
      assert.deepEqual(JSON.parse(String(calls[0]!.init!.body)), {
        content: DISCORD_TEST_WEBHOOK_CONTENT,
        allowed_mentions: { parse: [] },
      })
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('pings the configured role when withPing is true', async () => {
    const { sendDiscordChannelMessage } = await import('./discord.js')
    const originalFetch = globalThis.fetch
    const calls: Array<{ url: string; init?: RequestInit }> = []
    globalThis.fetch = mock.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const href = url.toString()
      calls.push({ url: href, init })
      if (href.includes('/guilds/') && href.endsWith('/roles')) {
        return new Response(
          JSON.stringify([
            { id: '123456789012345678', name: 'Readers' },
            { id: '999999999999999999', name: 'Testers' },
          ]),
          { status: 200 },
        )
      }
      return new Response('{}', { status: 200 })
    }) as typeof fetch

    try {
      const result = await sendDiscordChannelMessage({
        channel: 'production',
        withPing: true,
      })
      assert.equal(result.sent, true, result.error ?? 'send failed')
      const webhookCall = calls.find((c) => c.url.includes('/webhooks/'))
      assert.ok(webhookCall)
      const body = JSON.parse(String(webhookCall!.init!.body)) as {
        content: string
        allowed_mentions: { roles: string[] }
      }
      assert.match(body.content, /^<@&123456789012345678> /)
      assert.deepEqual(body.allowed_mentions, { roles: ['123456789012345678'] })
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('returns an error when Discord rejects the test message', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = mock.fn(async () => new Response('bad webhook', { status: 401 })) as typeof fetch

    try {
      const result = await sendDiscordWebhookTest()
      assert.equal(result.sent, false)
      assert.match(result.error ?? '', /401/)
      assert.equal(result.channel, 'production')
      assert.equal(result.withPing, false)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
