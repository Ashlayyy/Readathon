import type { Schema, Query } from 'mongoose'
import { getTenantIdString } from './context.js'

type TenantQueryOptions = { skipTenant?: boolean }

/**
 * Auto-scope find/update/delete by ALS tenantId, and stamp tenantId on save.
 * Pass `{ skipTenant: true }` in query options to bypass (migrations, platform admin).
 */
export function tenantScopePlugin(schema: Schema): void {
  if (!schema.path('tenantId')) return

  function injectTenant(this: Query<unknown, unknown>) {
    const opts = this.getOptions() as TenantQueryOptions
    if (opts?.skipTenant) return

    const filter = this.getFilter() as Record<string, unknown>
    if (Object.prototype.hasOwnProperty.call(filter, 'tenantId')) return

    const id = getTenantIdString()
    if (!id) return

    this.where({ tenantId: id })
  }

  schema.pre(/^find/, injectTenant)
  schema.pre('countDocuments', injectTenant)
  schema.pre(/^update/, injectTenant)
  schema.pre('deleteOne', injectTenant)
  schema.pre('deleteMany', injectTenant)
  schema.pre('findOneAndDelete', injectTenant)
  schema.pre('findOneAndUpdate', injectTenant)
  schema.pre('findOneAndReplace', injectTenant)

  schema.pre('save', function () {
    const doc = this as {
      tenantId?: unknown
      set: (k: string, v: unknown) => void
    }
    if (!doc.tenantId) {
      const id = getTenantIdString()
      if (id) doc.set('tenantId', id)
    }
  })
}
