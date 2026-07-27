import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { startMemoryMongo, type MemoryMongo } from '../test/memoryMongo.js'
import {
  getConfigOverridesSync,
  getSiteSettingsAdminSync,
  getSiteSettingsSync,
  refreshSiteSettingsCache,
  updateSiteSettings,
} from './siteSettings.js'

describe('site settings cache', () => {
  let db: MemoryMongo

  before(async () => {
    db = await startMemoryMongo()
  })

  after(async () => {
    await db.stop()
  })

  it('loads defaults into the synchronous public and admin getters', async () => {
    await refreshSiteSettingsCache()

    assert.deepEqual(getSiteSettingsSync(), {
      showTeamRosters: false,
      downtimeMode: false,
      seasonArchive: null,
    })
    const settings = getSiteSettingsAdminSync()
    assert.equal(settings.discordWebhookUrl, '')
    assert.equal(settings.scheduledPublishTimezone, 'Europe/Amsterdam')
    assert.ok(settings.teamChatAddTemplates.length > 0)
  })

  it('updates the in-memory cache and returns defensive copies', async () => {
    await updateSiteSettings({
      showTeamRosters: true,
      teamChatWebhookUrls: {
        alpha: 'https://discord.com/api/webhooks/123/token',
      },
      teamChatAddTemplates: ['{reader} logged {book}'],
      configOverrides: { banner: 'Live' },
    })

    const first = getSiteSettingsAdminSync()
    first.teamChatWebhookUrls.alpha = 'changed'
    first.teamChatAddTemplates.push('changed')

    assert.equal(getSiteSettingsSync().showTeamRosters, true)
    assert.equal(
      getSiteSettingsAdminSync().teamChatWebhookUrls.alpha,
      'https://discord.com/api/webhooks/123/token',
    )
    assert.deepEqual(getSiteSettingsAdminSync().teamChatAddTemplates, [
      '{reader} logged {book}',
    ])
    assert.deepEqual(getConfigOverridesSync(), { banner: 'Live' })
  })
})
