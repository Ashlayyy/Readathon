import mongoose, { Schema, type InferSchemaType } from 'mongoose'

/**
 * Account membership in a tenant (the per-event "player / host admin" row).
 * During Phase 0 we also keep the legacy User collection in sync for compatibility.
 */
const membershipSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    accountId: { type: Schema.Types.ObjectId, ref: 'PlatformAccount', required: true, index: true },
    /** Legacy User._id this membership mirrors (Phase 0 bridge). */
    legacyUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    displayName: { type: String, required: true, trim: true },
    teamId: { type: String, default: null },
    isAdmin: { type: Boolean, default: false },
    status: { type: String, enum: ['pending', 'assigned'], default: 'pending' },
    role: {
      type: String,
      enum: ['owner', 'admin', 'member'],
      default: 'member',
    },
    notifyStandings: { type: Boolean, default: false },
    notifyAnswers: { type: Boolean, default: false },
    preferEventThemes: { type: Boolean, default: true },
    currentlyReadingTitle: { type: String, default: null, trim: true },
    currentlyReadingAuthor: { type: String, default: null, trim: true },
    currentlyReadingCoverUrl: { type: String, default: null, trim: true },
    currentlyReadingUpdatedAt: { type: Date, default: null },
    avatarUrl: { type: String, default: null, trim: true },
    googleAvatarUrl: { type: String, default: null, trim: true },
    /** Host-console checklist progress (owners/admins). */
    hostOnboarding: {
      sharedPlayerLink: { type: Boolean, default: false },
      discordBotInvited: { type: Boolean, default: false },
      openedAdmin: { type: Boolean, default: false },
      previewOpened: { type: Boolean, default: false },
      dismissed: { type: Boolean, default: false },
    },
  },
  { timestamps: true },
)

membershipSchema.index({ tenantId: 1, accountId: 1 }, { unique: true })
membershipSchema.index({ tenantId: 1, legacyUserId: 1 }, { sparse: true })

export type IMembership = InferSchemaType<typeof membershipSchema> & {
  _id: mongoose.Types.ObjectId
}

export const Membership = mongoose.model('Membership', membershipSchema)
