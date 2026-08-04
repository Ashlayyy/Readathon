# Todo — Thursday 6 Aug 2026

Carry-over from multi-tenant work. Goal: make multi-host usable for real hosts without confusing Book Baddies players.

## Must do

- [ ] **Login shows which tenant** — on `/login` (and `/e/:slug/login`) show event name, slug, and URL form (path vs subdomain vs legacy host)
- [ ] **Magic-link email uses active tenant name** — stop using static `realmathon.json` name only; subject/body should say which event the link is for
- [ ] **Add `MULTI_TENANT.md` runbook** in repo root (env, create event, DNS, Discord invite, local smoke test)
- [ ] **Smoke-test two tenants locally** — Book Baddies on `/` + a second event on `/e/{slug}`; confirm data does not leak across tenants (submissions, prompts, settings, standings)

## Should do

- [ ] **Post-login “you’re in X” cue** — subtle header or profile chip with current event name when not on legacy Book Baddies host
- [ ] **Host console polish** — after create-event, copyable path + subdomain URLs; empty-state tips
- [ ] **Verify Discord platform bot path** — `PLATFORM_DISCORD_BOT_TOKEN`, invite from `/host`, guild/channel setup in that tenant’s Admin → Settings
- [ ] **Env examples** — confirm `PRODUCT_APEX`, `PRODUCT_NAME`, `VITE_PRODUCT_*`, `LEGACY_PLAYER_HOSTS` are documented and match deploy

## Nice to have / later

- [ ] Wildcard DNS notes for `*.product.com` (or whatever real apex replaces `product.com`)
- [ ] Custom domains per tenant
- [ ] Membership switcher (“your other events”) for accounts in multiple tenants
- [ ] Drop User bridge entirely (Membership-only APIs) — only after login clarity + smoke tests are green

## Don’t break

- [ ] **bookbaddies.net / localhost** must still open The Crucible with existing paths (`/`, `/submit`, `/standings`, …) — no forced `/e/crucible`
- [ ] Existing sessions / emails for Book Baddies players keep working

## Quick local checklist

```bash
# server
cd server && npm run dev

# frontend
cd frontend && npm run dev
```

- [ ] `http://localhost:5173/` → Crucible
- [ ] `http://localhost:5173/host` → host console
- [ ] Create event → open `/e/{slug}/login` → confirm tenant label (once implemented)
- [ ] Submit a book on tenant A; confirm it does not appear on tenant B
