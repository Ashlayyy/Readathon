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
  },
  { timestamps: true },
)

authTokenSchema.plugin(tenantScopePlugin)

export type IAuthToken = InferSchemaType<typeof authTokenSchema> & { _id: mongoose.Types.ObjectId }

export const AuthToken = mongoose.model('AuthToken', authTokenSchema)
