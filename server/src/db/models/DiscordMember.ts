import mongoose, { Schema, type InferSchemaType } from 'mongoose'

const libraryBookSchema = new Schema(
	{
		bookId: { type: String, required: true },
		title: { type: String, required: true, trim: true },
		author: { type: String, default: '', trim: true },
		coverUrl: { type: String, default: null },
		status: {
			type: String,
			enum: ['want', 'reading', 'finished'],
			default: 'want',
		},
		page: { type: Number, default: 0 },
		rating: { type: Number, default: null },
		review: { type: String, default: null },
	},
	{ _id: false },
)

const discordMemberSchema = new Schema(
	{
		discordUserId: { type: String, required: true, unique: true },
		username: { type: String, required: true, trim: true },
		email: { type: String, default: null, lowercase: true, trim: true },
		teamId: { type: String, default: null },
		teamName: { type: String, default: null },
		siteUserId: { type: String, default: null },
		nametag: { type: String, default: null },
		color: { type: String, default: null },
		backgroundUrl: { type: String, default: null },
		avatarUrl: { type: String, default: null },
		genres: { type: String, default: null },
		authors: { type: String, default: null },
		bio: { type: String, default: null },
		notifySprints: { type: Boolean, default: false },
		totalPages: { type: Number, default: 0 },
		totalMinutes: { type: Number, default: 0 },
		sprintsJoined: { type: Number, default: 0 },
		sprintsCompleted: { type: Number, default: 0 },
		lastSprintPages: { type: Number, default: null },
		lastSprintMinutes: { type: Number, default: null },
		lastSprintBook: { type: String, default: null },
		library: { type: [libraryBookSchema], default: [] },
	},
	{ timestamps: true },
)

export type IDiscordMember = InferSchemaType<typeof discordMemberSchema> & {
	_id: mongoose.Types.ObjectId
}

export const DiscordMember = mongoose.model('DiscordMember', discordMemberSchema)
