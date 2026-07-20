import mongoose, { Schema, type InferSchemaType } from 'mongoose'

const userSchema = new Schema(
  {
    displayName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    googleId: { type: String, sparse: true },
    teamId: { type: String, default: null },
    isAdmin: { type: Boolean, default: false },
    status: { type: String, enum: ['pending', 'assigned'], default: 'pending' },
    notifyStandings: { type: Boolean, default: false },
    notifyAnswers: { type: Boolean, default: false },
    /** Optional, not scored — what they're currently reading. */
    currentlyReadingTitle: { type: String, default: null, trim: true },
    currentlyReadingAuthor: { type: String, default: null, trim: true },
    currentlyReadingCoverUrl: { type: String, default: null, trim: true },
    currentlyReadingUpdatedAt: { type: Date, default: null },
  },
  { timestamps: true },
)

export type IUser = InferSchemaType<typeof userSchema> & { _id: mongoose.Types.ObjectId }

export const User = mongoose.model('User', userSchema)
