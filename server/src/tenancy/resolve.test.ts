import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_TENANT_SLUG,
  getLegacyPlayerHosts,
  getProductApex,
  getProductName,
} from './context.js'
import { resolveTenantFromRequest } from './resolve.js'

describe('tenancy context env', () => {
  it('defaults product apex to product.com', () => {
    assert.equal(getProductApex(), 'product.com')
  })

  it('defaults product name', () => {
    assert.ok(getProductName().length > 0)
  })

  it('includes bookbaddies.net as legacy host', () => {
    assert.ok(getLegacyPlayerHosts().includes('bookbaddies.net'))
  })

  it('exports default slug crucible', () => {
    assert.equal(DEFAULT_TENANT_SLUG, 'crucible')
  })
})

describe('resolveTenantFromRequest (marketing host)', () => {
  it('marks product.com apex as marketing without touching DB', async () => {
    const ctx = await resolveTenantFromRequest({
      host: 'www.product.com',
      pathname: '/',
    })
    assert.equal(ctx.isMarketingHost, true)
    assert.equal(ctx.resolution, 'marketing')
    assert.equal(ctx.tenant, null)
  })

  it('marks bare product.com as marketing', async () => {
    const ctx = await resolveTenantFromRequest({
      host: 'product.com',
      pathname: '/pricing',
    })
    assert.equal(ctx.resolution, 'marketing')
    assert.equal(ctx.isMarketingHost, true)
  })
})
