import mongoose, { Schema, type InferSchemaType } from 'mongoose'
import { tenantScopePlugin } from '../../tenancy/plugin.js'

const userSchema = new Schema(
  {
    displayName: { type: String, required: true, trim: true },
    /** Unique per tenant (same email may join multiple events via PlatformAccount). */
    email: { type: String, required: true, lowercase: true, trim: true },
    googleId: { type: String, sparse: true },
    teamId: { type: String, default: null },
    isAdmin: { type: Boolean, default: false },
    status: { type: String, enum: ['pending', 'assigned'], default: 'pending' },
    notifyStandings: { type: Boolean, default: false },
    notifyAnswers: { type: Boolean, default: false },
    /** When true (default), use live host event light/dark palettes instead of personal presets. */
    preferEventThemes: { type: Boolean, default: true },
    currentlyReadingTitle: { type: String, default: null, trim: true },
    currentlyReadingAuthor: { type: String, default: null, trim: true },
    currentlyReadingCoverUrl: { type: String, default: null, trim: true },
    currentlyReadingUpdatedAt: { type: Date, default: null },
    avatarUrl: { type: String, default: null, trim: true },
    googleAvatarUrl: { type: String, default: null, trim: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
    accountId: {
      type: Schema.Types.ObjectId,
      ref: 'PlatformAccount',
      default: null,
      index: true,
    },
  },
  { timestamps: true },
)

userSchema.index({ tenantId: 1, email: 1 }, { unique: true })
userSchema.index(
  { tenantId: 1, googleId: 1 },
  { unique: true, sparse: true, partialFilterExpression: { googleId: { $type: 'string' } } },
)

userSchema.plugin(tenantScopePlugin)

export type IUser = InferSchemaType<typeof userSchema> & { _id: mongoose.Types.ObjectId }

export const User = mongoose.model('User', userSchema)
