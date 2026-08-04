import mongoose, { Schema, type InferSchemaType } from 'mongoose'
import { tenantScopePlugin } from '../../tenancy/plugin.js'

const questionSchema = new Schema(
  {
    /** Multi-tenant scope (default tenant backfilled on boot). */
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    displayName: { type: String, required: true },
    email: { type: String, required: true },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
    status: { type: String, enum: ['unread', 'read', 'answered'], default: 'unread' },
    answer: { type: String, default: null, maxlength: 2000 },
    answeredAt: { type: Date, default: null },
    answeredByName: { type: String, default: null },
    answerSeen: { type: Boolean, default: false },
  },
  { timestamps: true },
)

questionSchema.plugin(tenantScopePlugin)

export type IQuestion = InferSchemaType<typeof questionSchema> & { _id: mongoose.Types.ObjectId }

export const Question = mongoose.model('Question', questionSchema)

export function questionToUserPublic(q: IQuestion) {
  return {
    id: q._id.toString(),
    message: q.message,
    status: q.status,
    answer: q.answer,
    answeredAt: q.answeredAt,
    answeredByName: q.answeredByName,
    answerSeen: q.answerSeen,
    createdAt: q.createdAt,
  }
}

export function questionToAdminPublic(q: IQuestion) {
  return {
    id: q._id.toString(),
    displayName: q.displayName,
    email: q.email,
    message: q.message,
    status: q.status,
    answer: q.answer,
    answeredAt: q.answeredAt,
    answeredByName: q.answeredByName,
    createdAt: q.createdAt,
  }
}
