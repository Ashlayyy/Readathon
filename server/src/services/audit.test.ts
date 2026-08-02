import assert from 'node:assert/strict'
import { describe, it, mock, afterEach } from 'node:test'
import { Types } from 'mongoose'
import { AuditLog } from '../db/models/AuditLog.js'
import { actorObjectId, listAuditLog, logAudit } from './audit.js'

describe('actorObjectId', () => {
	it('returns null for missing actor or _id', () => {
		assert.equal(actorObjectId(null), null)
		assert.equal(actorObjectId(undefined), null)
		assert.equal(actorObjectId({ displayName: 'System' }), null)
	})

	it('returns ObjectId instances unchanged', () => {
		const id = new Types.ObjectId()
		assert.equal(actorObjectId({ _id: id, displayName: 'Ash' }), id)
	})

	it('parses valid string ids', () => {
		const hex = '507f1f77bcf86cd799439011'
		const parsed = actorObjectId({ _id: hex, displayName: 'Ash' })
		assert.ok(parsed instanceof Types.ObjectId)
		assert.equal(parsed!.toString(), hex)
	})

	it('returns null for invalid string ids', () => {
		assert.equal(actorObjectId({ _id: 'not-an-object-id', displayName: 'Ash' }), null)
	})
})

describe('logAudit', () => {
	afterEach(() => {
		mock.restoreAll()
	})

	it('writes actorId and actorName from a user actor', async () => {
		const createMock = mock.method(AuditLog, 'create', async () => ({}))
		const actorId = new Types.ObjectId()

		await logAudit({
			actor: { _id: actorId, displayName: 'Ash' },
			action: 'test.action',
			entityType: 'book',
			entityId: 'abc',
			detail: { ok: true },
		})

		assert.equal(createMock.mock.calls.length, 1)
		const payload = createMock.mock.calls[0]!.arguments[0] as {
			actorId: Types.ObjectId
			actorName: string
			action: string
		}
		assert.equal(payload.actorId.toString(), actorId.toString())
		assert.equal(payload.actorName, 'Ash')
		assert.equal(payload.action, 'test.action')
	})

	it('does not throw when AuditLog.create fails', async () => {
		mock.method(AuditLog, 'create', async () => {
			throw new Error('db down')
		})
		const errorSpy = mock.method(console, 'error', () => {})

		await assert.doesNotReject(async () => {
			await logAudit({
				actor: { displayName: 'Scheduler' },
				action: 'scheduled.task',
			})
		})

		assert.equal(errorSpy.mock.calls.length, 1)
	})
})

describe('listAuditLog', () => {
	afterEach(() => {
		mock.restoreAll()
	})

	it('maps rows and clamps pagination', async () => {
		const row = {
			_id: new Types.ObjectId(),
			actorId: new Types.ObjectId(),
			actorName: 'Ash',
			action: 'admin.update',
			entityType: 'settings',
			entityId: 'site',
			detail: null,
			createdAt: new Date('2026-07-01T00:00:00.000Z'),
		}

		mock.method(AuditLog, 'find', () => ({
			sort: () => ({
				skip: () => ({
					limit: async () => [row],
				}),
			}),
		}))
		mock.method(AuditLog, 'countDocuments', async () => 1)

		const result = await listAuditLog({ limit: 999, offset: -5 })

		assert.equal(result.total, 1)
		assert.equal(result.limit, 200)
		assert.equal(result.offset, 0)
		assert.equal(result.logs.length, 1)
		assert.equal(result.logs[0]!.actorName, 'Ash')
		assert.equal(result.logs[0]!.action, 'admin.update')
	})
})
