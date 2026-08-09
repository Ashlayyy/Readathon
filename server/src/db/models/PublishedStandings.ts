import mongoose, { Schema, type InferSchemaType } from 'mongoose'
import { tenantScopePlugin } from '../../tenancy/plugin.js'

const publishedStandingsSchema = new Schema(
  {
    /** Multi-tenant scope (default tenant backfilled on boot). */
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
    weekKey: { type: String, required: true },
    weekLabel: { type: String, required: true },
    standingsJson: { type: String, required: true },
    svgData: { type: String, required: true },
    breakdownJson: { type: String, default: '' },
    breakdownSvgData: { type: String, default: '' },
    /** Frozen weekly vibes JSON (PublicStandingsVibes) at publish time */
    vibesJson: { type: String, default: '' },
    vibesSvgData: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    unpublishedAt: { type: Date, default: null },
  },
  { timestamps: true },
)

publishedStandingsSchema.plugin(tenantScopePlugin)

export type IPublishedStandings = InferSchemaType<typeof publishedStandingsSchema> & {
  _id: mongoose.Types.ObjectId
}

export const PublishedStandings = mongoose.model('PublishedStandings', publishedStandingsSchema)
