import mongoose, { Schema, type InferSchemaType } from 'mongoose'
import { tenantScopePlugin } from '../../tenancy/plugin.js'

const auditLogSchema = new Schema(
  {
    /** Multi-tenant scope (default tenant backfilled on boot). */
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    actorName: { type: String, required: true },
    action: { type: String, required: true, index: true },
    entityType: { type: String, default: null, index: true },
    entityId: { type: String, default: null, index: true },
    detail: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

auditLogSchema.plugin(tenantScopePlugin)

export type IAuditLog = InferSchemaType<typeof auditLogSchema> & { _id: mongoose.Types.ObjectId }

export const AuditLog = mongoose.model('AuditLog', auditLogSchema)
