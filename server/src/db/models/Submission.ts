import mongoose, { Schema, type InferSchemaType } from 'mongoose'

const submissionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    bookTitle: { type: String, required: true, trim: true },
    bookAuthor: { type: String, required: true, trim: true },
    pageCount: { type: Number, required: true },
    format: { type: String, required: true },
    startedAt: { type: String, required: true },
    finishedAt: { type: String, required: true },
    isReread: { type: Boolean, default: false },
    submissionType: { type: String, enum: ['add', 'sabotage'], required: true },
    targetTeamId: { type: String, default: null },
    promptIds: { type: [String], required: true },
    bonusCompetition: { type: Boolean, default: false },
    bonusTeamPromptIds: { type: [String], default: [] },
    pageBonus: { type: Number, default: 0 },
    promptPoints: { type: Number, default: 0 },
    bonusPoints: { type: Number, default: 0 },
    totalImpact: { type: Number, default: 0 },
  },
  { timestamps: true },
)

export type ISubmission = InferSchemaType<typeof submissionSchema> & { _id: mongoose.Types.ObjectId }

export const Submission = mongoose.model('Submission', submissionSchema)
