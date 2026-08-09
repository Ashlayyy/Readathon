# Host panel — status

Working local stack:

| App | URL |
|-----|-----|
| API | http://localhost:3001 |
| Players (`frontend`) | http://localhost:5173 |
| Product / hosts (`product`) | http://localhost:5174 |

**Confidence: ~94%** — product host loop, onboarding, event home, deploy docs, CORS/cookies, and Admin deep-links are implemented. Remaining production gates are ops: real Discord token, DNS, smoke with Resend email.

---

## Shipped

- [x] Marketing + host sign-in + create event
- [x] Event home `/host/e/:slug` with checklist, rename, archive, co-host invite
- [x] Platform APIs: events CRUD-lite, onboarding, cohosts, Discord invite
- [x] Admin `#discord` + `?from=host` banner; login cue when session missing
- [x] Cross-tenant host Admin resolution (membership → isAdmin)
- [x] CORS for `PRODUCT_APEX` subdomains + optional `COOKIE_DOMAIN` / `CORS_ORIGINS`
- [x] Player header **Other events** switcher
- [x] `pm2:start` builds frontend **and** product; nginx example in `deploy/`
- [x] Env examples for local + production

## Ops checklist before go-live

1. Set `PRODUCT_URL`, `FRONTEND_URL`, `PRODUCT_APEX`, `PLATFORM_DISCORD_BOT_TOKEN`, `RESEND_*`
2. Set `COOKIE_DOMAIN=.your-apex` if product + player share that apex
3. `npm run build &&` deploy with PM2; point DNS per `MULTI_TENANT.md`
4. Smoke: create event → checklist → Admin Discord → log a book → confirm isolation from Crucible

## Deferred (not blocking launch)

- Custom domains per tenant
- Drop User↔Platform bridge (Membership-only)
- Full Admin rewrite inside `product/`
