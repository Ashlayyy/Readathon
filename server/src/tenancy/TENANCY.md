# Multi-tenant architecture

Working product apex: **`product.com`** (`PRODUCT_APEX` / `VITE_PRODUCT_APEX`).  
Product display name: **`PRODUCT_NAME`** / `VITE_PRODUCT_NAME` (default `Product`).

## Zero-disruption default

| Host | Behavior |
|------|----------|
| `bookbaddies.net`, `www.bookbaddies.net`, `localhost` | Default tenant `crucible` |
| `www.product.com`, `product.com` | Marketing + host console |
| `{slug}.product.com` | Tenant by subdomain |
| `…/e/{slug}/…` + `X-Tenant-Slug` | Tenant by path / API header |

## Phases (shipped)

### 0 — Invisible tenancy
Tenant / PlatformAccount / Membership models; ALS middleware; User bridge; SiteSettings.tenantId.

### 1 — Scoped data
`tenantId` on domain models; mongoose `tenantScopePlugin`; compound uniques (`tenantId+email`, `tenantId+promptId`, `tenantId+slot`); boot backfill; per-tenant settings/prompts caches.

### 2 — Marketing + host console
`/api/platform/*` — account, memberships, create event.  
Frontend: `/` on product.com → marketing; `/host`, `/host/new`; `/e/:slug/*` player routes.

### 3 — Platform Discord bot
`PLATFORM_DISCORD_BOT_TOKEN` (or `DISCORD_BOT_TOKEN`) shared; hosts copy invite from host console / admin. Per-tenant encrypted token remains optional override.

### 4 — Account-first auth
Session carries `accountId` (+ `userId` in a tenant). Same email can join multiple tenants via Membership; User stays the per-tenant player row (admin/scoring APIs unchanged).

## Key env

```
PRODUCT_APEX=product.com
PRODUCT_NAME=Product
LEGACY_PLAYER_HOSTS=bookbaddies.net,www.bookbaddies.net
PLATFORM_DISCORD_BOT_TOKEN=
```

Frontend: `VITE_PRODUCT_APEX`, `VITE_PRODUCT_NAME`.

Operator runbook: see repo-root [`MULTI_TENANT.md`](../../../MULTI_TENANT.md).

**Product.com app:** separate Vite app in [`product/`](../../../product/) (marketing + host panel on port 5174).
