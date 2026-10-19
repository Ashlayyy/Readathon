import mongoose, { Schema, type InferSchemaType } from 'mongoose'

const participantSchema = new Schema(
	{
		userId: { type: String, required: true },
		username: { type: String, required: true },
		bookTitle: { type: String, default: '' },
		status: { type: String, enum: ['reading', 'paused', 'left'], default: 'reading' },
		confirmed: { type: Boolean, default: false },
		joinedAt: { type: Date, required: true },
		startPage: { type: Number, default: 0 },
		currentPage: { type: Number, default: 0 },
		bankedPages: { type: Number, default: 0 },
		pausedMs: { type: Number, default: 0 },
		pausedAt: { type: Date, default: null },
	},
	{ _id: false },
)

const readingSprintSchema = new Schema(
	{
		guildId: { type: String, required: true },
		channelId: { type: String, required: true },
		messageId: { type: String, default: null },
		hostId: { type: String, required: true },
		hostName: { type: String, required: true },
		status: {
			type: String,
			enum: ['scheduled', 'running', 'grace', 'ended'],
			required: true,
		},
		durationMinutes: { type: Number, required: true },
		startsAt: { type: Date, required: true },
		endsAt: { type: Date, default: null },
		goal: { type: String, default: null },
		title: { type: String, default: null },
		pingRoleId: { type: String, default: null },
		statsApplied: { type: Boolean, default: false },
		resultMessageId: { type: String, default: null },
		participants: { type: [participantSchema], default: [] },
	},
	{ timestamps: true },
)

readingSprintSchema.index({ channelId: 1, status: 1 })

export type IReadingSprint = InferSchemaType<typeof readingSprintSchema> & {
	_id: mongoose.Types.ObjectId
}

export const ReadingSprint = mongoose.model('ReadingSprint', readingSprintSchema)
