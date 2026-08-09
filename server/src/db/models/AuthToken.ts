import mongoose, { Schema, type InferSchemaType } from 'mongoose'
import { tenantScopePlugin } from '../../tenancy/plugin.js'

const authTokenSchema = new Schema(
  {
    /** Multi-tenant scope (default tenant backfilled on boot). */
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true, index: true },
    usedAt: { type: Date, default: null },
    /**
     * Tenant slug at request time so /auth/verify (API host) can redirect
     * back to /e/{slug}/… after the magic link is clicked.
     */
    tenantSlug: { type: String, default: null, lowercase: true, trim: true },
    /** true when the link was requested from the marketing / host console. */
    forPlatform: { type: Boolean, default: false },
  },
  { timestamps: true },
)

authTokenSchema.plugin(tenantScopePlugin)

export type IAuthToken = InferSchemaType<typeof authTokenSchema> & { _id: mongoose.Types.ObjectId }

export const AuthToken = mongoose.model('AuthToken', authTokenSchema)
