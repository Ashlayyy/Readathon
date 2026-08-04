import mongoose, { Schema, type InferSchemaType } from 'mongoose'

/**
 * One hosted readathon / community space.
 * Book Baddies (The Crucible) is the default tenant — legacy hosts keep working
 * with no URL change for existing players.
 */
const tenantSchema = new Schema(
  {
    /** URL slug: crucible.product.com or product.com/e/crucible */
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    /** Public event / community name (e.g. "Readathon 2026 - The Crucible") */
    name: { type: String, required: true, trim: true },
    /** When true, unresolved legacy hosts (bookbaddies.net) map here. Exactly one. */
    isDefault: { type: Boolean, default: false, index: true },
    status: {
      type: String,
      enum: ['active', 'archived', 'suspended'],
      default: 'active',
    },
    /**
     * Event config blob (formerly data/realmathon.json for the default tenant).
     * null = fall back to static JSON file (default tenant only during migration).
     */
    config: { type: Schema.Types.Mixed, default: null },
    /** Discord guilds where the platform bot is installed for this tenant */
    discordGuildIds: { type: [String], default: [] },
  },
  { timestamps: true },
)

tenantSchema.index({ isDefault: 1 }, { unique: true, partialFilterExpression: { isDefault: true } })

export type ITenant = InferSchemaType<typeof tenantSchema> & {
  _id: mongoose.Types.ObjectId
}

export const Tenant = mongoose.model('Tenant', tenantSchema)
