import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import mongoose from 'mongoose'
import {
	questionToAdminPublic,
	questionToUserPublic,
	type IQuestion,
} from './Question.js'

function question(partial: Partial<IQuestion> = {}): IQuestion {
	const id = new mongoose.Types.ObjectId()
	const now = new Date('2026-07-20T12:00:00Z')
	return {
		_id: id,
		userId: new mongoose.Types.ObjectId(),
		displayName: 'Ash',
		email: 'ash@example.com',
		message: 'How do bonuses work?',
		status: 'answered',
		answer: 'Check the rules page.',
		answeredAt: now,
		answeredByName: 'Admin',
		answerSeen: false,
		createdAt: now,
		updatedAt: now,
		...partial,
	} as IQuestion
}

describe('Question public mappers', () => {
	it('questionToUserPublic omits admin-only fields', () => {
		const q = question()
		const pub = questionToUserPublic(q)

		assert.equal(pub.id, q._id.toString())
		assert.equal(pub.message, q.message)
		assert.equal(pub.status, q.status)
		assert.equal(pub.answer, q.answer)
		assert.equal(pub.answeredAt, q.answeredAt)
		assert.equal(pub.answeredByName, q.answeredByName)
		assert.equal(pub.answerSeen, q.answerSeen)
		assert.equal(pub.createdAt, q.createdAt)
		assert.equal('email' in pub, false)
		assert.equal('displayName' in pub, false)
	})

	it('questionToAdminPublic includes reader identity', () => {
		const q = question({ status: 'unread', answer: null, answeredAt: null })
		const pub = questionToAdminPublic(q)

		assert.equal(pub.id, q._id.toString())
		assert.equal(pub.displayName, 'Ash')
		assert.equal(pub.email, 'ash@example.com')
		assert.equal(pub.message, q.message)
		assert.equal(pub.status, 'unread')
		assert.equal(pub.answer, null)
		assert.equal('answerSeen' in pub, false)
	})
})
