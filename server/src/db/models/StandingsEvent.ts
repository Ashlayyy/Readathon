import mongoose, { Schema, type InferSchemaType } from 'mongoose'
import { tenantScopePlugin } from '../../tenancy/plugin.js'

const standingsEventSchema = new Schema(
  {
    /** Multi-tenant scope (default tenant backfilled on boot). */
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
    action: { type: String, enum: ['published', 'unpublished'], required: true },
    weekKey: { type: String, required: true },
    weekLabel: { type: String, required: true },
    standingsJson: { type: String, required: true },
    svgData: { type: String, required: true },
    breakdownJson: { type: String, default: '' },
    breakdownSvgData: { type: String, default: '' },
    adminName: { type: String, required: true },
    adminEmail: { type: String, required: true },
    publicationId: { type: Schema.Types.ObjectId, ref: 'PublishedStandings', default: null },
  },
  { timestamps: true },
)

standingsEventSchema.plugin(tenantScopePlugin)

export type IStandingsEvent = InferSchemaType<typeof standingsEventSchema> & {
  _id: mongoose.Types.ObjectId
}

export const StandingsEvent = mongoose.model('StandingsEvent', standingsEventSchema)
