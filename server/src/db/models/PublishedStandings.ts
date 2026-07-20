import mongoose, { Schema, type InferSchemaType } from 'mongoose'

const publishedStandingsSchema = new Schema(
  {
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

export type IPublishedStandings = InferSchemaType<typeof publishedStandingsSchema> & {
  _id: mongoose.Types.ObjectId
}

export const PublishedStandings = mongoose.model('PublishedStandings', publishedStandingsSchema)
