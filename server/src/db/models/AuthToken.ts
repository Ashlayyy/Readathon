import mongoose, { Schema, type InferSchemaType } from 'mongoose'

const authTokenSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true, index: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true },
)

export type IAuthToken = InferSchemaType<typeof authTokenSchema> & { _id: mongoose.Types.ObjectId }

export const AuthToken = mongoose.model('AuthToken', authTokenSchema)
