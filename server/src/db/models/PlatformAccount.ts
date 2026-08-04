import mongoose, { Schema, type InferSchemaType } from 'mongoose'

/**
 * Global login identity. One email → one account across all tenants.
 * Per-tenant state lives on Membership (and, during migration, still on User).
 */
const platformAccountSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    displayName: { type: String, required: true, trim: true },
    googleId: { type: String, sparse: true, unique: true },
    avatarUrl: { type: String, default: null, trim: true },
    googleAvatarUrl: { type: String, default: null, trim: true },
  },
  { timestamps: true },
)

export type IPlatformAccount = InferSchemaType<typeof platformAccountSchema> & {
  _id: mongoose.Types.ObjectId
}

export const PlatformAccount = mongoose.model('PlatformAccount', platformAccountSchema)
