import mongoose, { Schema, type InferSchemaType } from 'mongoose'

const siteSettingsSchema = new Schema(
  {
    showTeamRosters: { type: Boolean, default: false },
    downtimeMode: { type: Boolean, default: false },
    discordWebhookUrl: { type: String, default: '' },
    discordRoleId: { type: String, default: '' },
  },
  { timestamps: true },
)

export type ISiteSettings = InferSchemaType<typeof siteSettingsSchema> & {
  _id: mongoose.Types.ObjectId
}

export const SiteSettings = mongoose.model('SiteSettings', siteSettingsSchema)
