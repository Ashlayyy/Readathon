import mongoose, { Schema, type InferSchemaType } from 'mongoose'

const siteSettingsSchema = new Schema(
  {
    showTeamRosters: { type: Boolean, default: false },
    downtimeMode: { type: Boolean, default: false },
    discordWebhookUrl: { type: String, default: '' },
    discordRoleId: { type: String, default: '' },
    teamChatHooksEnabled: { type: Boolean, default: false },
    /** teamId -> webhook URL */
    teamChatWebhookUrls: { type: Schema.Types.Mixed, default: {} },
    /** Discord message templates for realm chat (add logs). Empty → seeded with defaults. */
    teamChatAddTemplates: { type: [String], default: undefined },
    /** Discord message templates for realm chat (sabotage logs). Empty → seeded with defaults. */
    teamChatSabotageTemplates: { type: [String], default: undefined },
    scheduledPublishEnabled: { type: Boolean, default: false },
    /** 0 = Sunday .. 6 = Saturday (matches JS Date#getDay); default Monday */
    scheduledPublishDay: { type: Number, default: 1 },
    scheduledPublishHour: { type: Number, default: 9 },
    scheduledPublishTimezone: { type: String, default: 'Europe/Amsterdam' },
    /** Staged copy/prompt overrides not yet promoted to live config */
    configDraft: { type: Schema.Types.Mixed, default: null },
    /** Live overlay merged into getConfig() - promoted from configDraft via "Publish draft" */
    configOverrides: { type: Schema.Types.Mixed, default: null },
    /** { slug, title, from, to, message, publishedStandingsIds[] } for a wrapped-up season */
    seasonArchive: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
)

export type ISiteSettings = InferSchemaType<typeof siteSettingsSchema> & {
  _id: mongoose.Types.ObjectId
}

export const SiteSettings = mongoose.model('SiteSettings', siteSettingsSchema)
