# Product site (`product/`)

Separate app for **product.com**: marketing landing + host panel.

Player events stay in `frontend/` (Book Baddies / `/e/{slug}`).

## Local

```bash
# from repo root
npm run dev
```

| App | URL |
|-----|-----|
| Product / hosts | http://localhost:5174 |
| Players | http://localhost:5173 |
| API | http://localhost:3001 |

## Host flow

1. Sign in at `/signin`
2. Create event at `/host/new`
3. Event home `/host/e/:slug` — checklist, links, rename, archive, co-hosts
4. Open Admin (player app) for teams, prompts, Discord channels

## Env

See `.env.example` and `.env.production.example`.

Server needs:

```bash
PRODUCT_URL=http://localhost:5174
FRONTEND_URL=http://localhost:5173
```

Magic-link sign-in for hosts redirects to `PRODUCT_URL/host`.
