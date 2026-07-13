import mongoose, { Schema, type InferSchemaType } from 'mongoose'

const standingsEventSchema = new Schema(
  {
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

export type IStandingsEvent = InferSchemaType<typeof standingsEventSchema> & {
  _id: mongoose.Types.ObjectId
}

export const StandingsEvent = mongoose.model('StandingsEvent', standingsEventSchema)
