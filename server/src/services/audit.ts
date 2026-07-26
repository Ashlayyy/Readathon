import { Types, type HydratedDocument } from 'mongoose'
import { AuditLog } from '../db/models/AuditLog.js'
import { type IUser } from '../db/models/User.js'

/** Real user actors carry `_id`; the scheduler passes a lightweight system actor instead. */
export type AuditActor =
  | HydratedDocument<IUser>
  | IUser
  | { _id?: unknown; displayName: string; email?: string }
  | null
  | undefined

export type LogAuditInput = {
  actor: AuditActor
  action: string
  entityType?: string | null
  entityId?: string | null
  detail?: unknown
}

/** @internal Exported for unit tests of actor id normalization. */
export function actorObjectId(actor: AuditActor): Types.ObjectId | null {
  const raw = actor?._id
  if (raw == null) return null
  if (raw instanceof Types.ObjectId) return raw
  if (typeof raw === 'string' && Types.ObjectId.isValid(raw)) {
    return new Types.ObjectId(raw)
  }
  return null
}

/** Best-effort audit trail write - never throws, so a logging failure can't break the admin action it describes. */
export async function logAudit(input: LogAuditInput): Promise<void> {
  try {
    await AuditLog.create({
      actorId: actorObjectId(input.actor),
      actorName: input.actor?.displayName ?? 'Unknown',
      action: input.action,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      detail: input.detail ?? null,
    })
  } catch (e) {
    console.error('[audit] Failed to write audit log:', e)
  }
}

export async function listAuditLog(opts: { limit?: number; offset?: number } = {}) {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200)
  const offset = Math.max(opts.offset ?? 0, 0)

  const [rows, total] = await Promise.all([
    AuditLog.find().sort({ createdAt: -1 }).skip(offset).limit(limit),
    AuditLog.countDocuments(),
  ])

  return {
    total,
    limit,
    offset,
    logs: rows.map((row) => ({
      id: row._id.toString(),
      actorId: row.actorId?.toString() ?? null,
      actorName: row.actorName,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      detail: row.detail,
      createdAt: row.createdAt,
    })),
  }
}
