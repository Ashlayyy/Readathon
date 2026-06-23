import mongoose, { Schema, type InferSchemaType } from 'mongoose'

const userSchema = new Schema(
  {
    displayName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    googleId: { type: String, sparse: true },
    teamId: { type: String, default: null },
    isAdmin: { type: Boolean, default: false },
    status: { type: String, enum: ['pending', 'assigned'], default: 'pending' },
    notifyStandings: { type: Boolean, default: true },
    notifyAnswers: { type: Boolean, default: true },
  },
  { timestamps: true },
)

export type IUser = InferSchemaType<typeof userSchema> & { _id: mongoose.Types.ObjectId }

export const User = mongoose.model('User', userSchema)
