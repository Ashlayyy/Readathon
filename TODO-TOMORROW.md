# Todo — multi-tenant + product.com

## Running locally

```bash
npm run dev
# players  http://localhost:5173
# product  http://localhost:5174
# api      http://localhost:3001
```

Roadmap status: **[HOST_PANEL_PLAN.md](./HOST_PANEL_PLAN.md)**

## Done

- [x] Tenancy + migration + platform APIs
- [x] Product marketing + host panel (create, dashboard, event home, onboarding)
- [x] Discord deep-link + host Admin banner
- [x] CORS / COOKIE_DOMAIN / deploy docs + pm2 builds both SPAs
- [x] Player “Other events” switcher

## Ops (before production traffic)

- [ ] Smoke-test create → play → no cross-tenant leak
- [ ] Set real `PLATFORM_DISCORD_BOT_TOKEN` + Resend
- [ ] Deploy DNS (product.com, bookbaddies.net, optional `*.product.com`)
- [ ] Set `COOKIE_DOMAIN` when sharing sessions on one apex

## Later

- [ ] Custom domains per tenant
- [ ] Membership-only auth (drop User bridge)
