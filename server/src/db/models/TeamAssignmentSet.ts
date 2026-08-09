import mongoose, { Schema, type InferSchemaType } from 'mongoose'

const assignmentEntrySchema = new Schema(
	{
		userId: { type: String, required: true },
		teamId: { type: String, required: true },
	},
	{ _id: false },
)

/** Up to 3 saved team-shuffle proposals (slots 1–3). */
const teamAssignmentSetSchema = new Schema(
	{
		slot: { type: Number, required: true, unique: true, min: 1, max: 3 },
		label: { type: String, default: '', trim: true },
		includeAdmins: { type: Boolean, default: false },
		assignments: { type: [assignmentEntrySchema], default: [] },
		savedAt: { type: Date, default: null },
	},
	{ timestamps: true },
)

export type ITeamAssignmentSet = InferSchemaType<typeof teamAssignmentSetSchema> & {
	_id: mongoose.Types.ObjectId
}

export const TeamAssignmentSet = mongoose.model(
	'TeamAssignmentSet',
	teamAssignmentSetSchema,
)
