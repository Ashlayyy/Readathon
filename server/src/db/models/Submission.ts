import mongoose, { Schema, type InferSchemaType } from 'mongoose'
import { tenantScopePlugin } from '../../tenancy/plugin.js'

const submissionSchema = new Schema(
  {
    /** Multi-tenant scope (default tenant backfilled on boot). */
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    bookTitle: { type: String, required: true, trim: true },
    bookAuthor: { type: String, required: true, trim: true },
    pageCount: { type: Number, required: true },
    format: { type: String, required: true },
    /** Open Library URL or /api/covers/files/... */
    coverUrl: { type: String, default: null, trim: true },
    startedAt: { type: String, default: null },
    finishedAt: { type: String, default: null },
    submissionType: { type: String, enum: ['add', 'sabotage'], required: true },
    targetTeamId: { type: String, default: null },
    promptIds: { type: [String], required: true },
    bonusCompetition: { type: Boolean, default: false },
    bonusTeamPromptIds: { type: [String], default: [] },
    pageBonus: { type: Number, default: 0 },
    promptPoints: { type: Number, default: 0 },
    bonusPoints: { type: Number, default: 0 },
    totalImpact: { type: Number, default: 0 },
    deletedAt: { type: Date, default: null, index: true },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
)

submissionSchema.plugin(tenantScopePlugin)

export type ISubmission = InferSchemaType<typeof submissionSchema> & { _id: mongoose.Types.ObjectId }

export const Submission = mongoose.model('Submission', submissionSchema)
