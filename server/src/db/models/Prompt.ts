import mongoose, { Schema, type InferSchemaType } from 'mongoose'

const promptSchema = new Schema(
  {
    promptId: { type: String, required: true, unique: true, trim: true },
    kind: { type: String, enum: ['positive', 'negative', 'team_bonus'], required: true },
    teamId: { type: String, default: null },
    gameName: { type: String, default: '', trim: true },
    label: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    points: { type: Number, required: true },
    link: { type: String, default: null },
    isActive: { type: Boolean, default: true },
    goesLiveAt: { type: Date, default: null },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
)

export type IPrompt = InferSchemaType<typeof promptSchema> & { _id: mongoose.Types.ObjectId }

export const Prompt = mongoose.model('Prompt', promptSchema)
