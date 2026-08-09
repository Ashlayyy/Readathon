# Running multiple tenants

Book Baddies / The Crucible stays on **bookbaddies.net** (and localhost) as the default tenant. New hosted events use **product.com** (working apex — replace via env when you pick a real domain).

## Database — you do **not** need to touch Mongo by hand

On every server boot the app runs an **idempotent tenancy migration** that:

1. Seeds the default `crucible` tenant (Book Baddies)
2. Stamps existing rows with `tenantId`
3. Links Users → PlatformAccount + Membership
4. Drops old global unique indexes (`email`, `promptId`, `slot`) and syncs compound indexes

| `TENANCY_MIGRATE` | Behavior |
|-------------------|----------|
| `auto` (default) | Run only when pending work is detected |
| `force` | Always re-run |
| `off` | Skip heavy migrate; only ensure default tenant exists |

**Opt-in if you set `off` or want a one-shot force:**

```bash
cd server && npm run migrate:tenancy
cd server && npm run migrate:tenancy -- --force
```

Or as admin: `GET/POST /api/admin/tenancy/migration` (`{ "force": true }`).

## Env

**Server (`server/.env`)**

```bash
FRONTEND_URL=http://localhost:5173
PRODUCT_URL=http://localhost:5174
PRODUCT_APEX=product.com
PRODUCT_NAME=Product
LEGACY_PLAYER_HOSTS=bookbaddies.net,www.bookbaddies.net
PLATFORM_DISCORD_BOT_TOKEN=   # shared bot; hosts invite it
# COOKIE_DOMAIN=.product.com  # production, when sharing apex sessions
# CORS_ORIGINS=
# TENANCY_MIGRATE=auto
```

**Frontend (`frontend/.env`)**

```bash
VITE_PRODUCT_APEX=product.com
VITE_PRODUCT_NAME=Product
VITE_PRODUCT_URL=http://localhost:5174
# VITE_API_URL=https://api.your-domain.com   # production
```

**Product (`product/.env`)**

```bash
VITE_PLAYER_ORIGIN=http://localhost:5173
VITE_PRODUCT_APEX=product.com
VITE_PRODUCT_NAME=Product
```

## Who goes where

| Audience | URL |
|----------|-----|
| Existing Book Baddies players | `https://bookbaddies.net/...` (unchanged) |
| New event (path) | `https://product.com/e/{slug}/...` |
| New event (subdomain) | `https://{slug}.product.com/...` (needs DNS) |
| Hosts / marketing | `https://www.product.com/` · `/host` · `/host/new` |

API calls for path tenants send `X-Tenant-Slug` so `/api/*` resolves the right event.

## Create a second event

1. Open the product host panel (local: `http://localhost:5174/host` — player `/host` redirects there).
2. Sign in with magic link (email says **Product / Host console**).
3. **Create event** → name + slug → event home checklist.
4. Copy the path URL (works immediately) and optional subdomain URL.
5. Invite Discord bot, then open Admin → Settings (`#discord`) for channels.

## Discord (platform bot)

1. Set `PLATFORM_DISCORD_BOT_TOKEN` (one application for all tenants).
2. Host console → **Copy bot invite link** (or Admin → Settings on an event).
3. Invite into that event’s Discord server.
4. In **that event’s** Admin → Settings, pick guild / channels / roles.

Per-tenant encrypted bot tokens in Admin remain an optional override.

## Local smoke test

```bash
# from repo root (server + players + product host panel)
npm run dev

# or separately:
# cd server && npm run dev
# cd frontend && npm run dev          # :5173 players
# cd product && npm install && npm run dev   # :5174 hosts
```

Checklist:

1. `http://localhost:5173/` → Crucible (default tenant).
2. `http://localhost:5174/` → product marketing; **Start your readathon**.
3. Create `demo-cup` in the host panel; open the player link.
4. `http://localhost:5173/e/demo-cup/login` → banner shows **Signing into** that event.
5. Magic-link for hosts lands on `http://localhost:5174/host`.
6. Log a book on demo-cup; confirm it does **not** appear on `/` (Crucible).

## DNS (when you leave `product.com`)

- Apex + `www` → marketing / host console.
- Wildcard `*.yourdomain.com` → same app (subdomain tenancy).
- Keep `bookbaddies.net` on the legacy allowlist until you intentionally migrate players.

## Login clarity

- Login page always shows **Signing into {event name}** (+ slug / URL mode for path & subdomain).
- Header chip on path/subdomain tenants reminds you which event you’re in.
- Magic links and Google OAuth remember the tenant (or host console) and redirect back there.

## Don’t break

- Do **not** force Book Baddies players onto `/e/crucible`.
- Default / legacy hosts keep existing paths: `/`, `/submit`, `/standings`, …
