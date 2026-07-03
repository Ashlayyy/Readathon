# Readathon 2026 — The Crucible

Vue frontend + Hono API + MongoDB for the Readathon 2026 community readathon.

Event name, copy, teams, and prompts live in `data/realmathon.json` — the site reads the title from there at runtime.

## Structure

```
Readathon/
├── data/realmathon.json   # Event content (teams, prompts, FAQ, branding)
├── ecosystem.config.cjs   # PM2 process config
├── frontend/              # Vue 3 + Vite + TypeScript
├── server/                # Hono + Mongoose + MongoDB
└── package.json
```

## Requirements

- Node.js **22.18+** or **24.12+** (see `.nvmrc`)
- **MongoDB Atlas** (or any MongoDB URI)

## Setup

```bash
npm install
npm install --prefix frontend
npm install --prefix server
cp server/.env.example server/.env
```

Edit `server/.env` — at minimum:

```env
MONGODB_URI=mongodb+srv://...
SESSION_SECRET=long-random-secret
FRONTEND_URL=https://your-domain.com
ADMIN_EMAILS=you@email.com
RESEND_API_KEY=...
EMAIL_FROM=Readathon <you@yourdomain.com>
```

## Development

```bash
npm run dev
```

- Frontend: http://localhost:5173 (proxies `/api` to the server)
- API: http://localhost:3001

Or with PM2 (two processes, hot reload):

```bash
npm run pm2:start:dev
```

## Production (Linux server)

Production builds the frontend and runs **one** PM2 process. The API serves both `/api` and the built `frontend/dist` on the same port — no nginx required.

```bash
npm run pm2:start
```

What `pm2:start` does:

1. `npm run build --prefix frontend` — outputs to `frontend/dist`
2. Starts the API with `NODE_ENV=production`
3. Hono serves static files from `frontend/dist` and falls back to `index.html` for client routes

Set `FRONTEND_URL` to the URL users actually visit, e.g. `https://your-domain.com` or `http://your-server-ip:3001`.

| Variable | Production value |
|----------|------------------|
| `NODE_ENV` | `production` (set automatically by `npm run start` in server) |
| `PORT` | `3001` (or your choice) |
| `FRONTEND_URL` | Same origin users use in the browser |
| `MONGODB_URI` | Atlas connection string |
| `SESSION_SECRET` | Strong random string (server **exits** if missing/default in production) |

After code changes:

```bash
npm run build --prefix frontend && npm run pm2:restart
```

Keep PM2 running after reboot:

```bash
pm2 startup systemd -u $USER --hp $HOME
pm2 save
```

Logs: `logs/` in the project root.

## Auth

- **Email signup:** name + email → pending pool (instant session)
- **Email login:** magic link via Resend (15 min, single-use)
- **Google:** optional OAuth
- **Admins:** `ADMIN_EMAILS` in `.env`

Without `RESEND_API_KEY`, sign-in links print to the server console (dev only).

## User flow

1. Sign up
2. Wait in the unassigned pool (2 teams: Sun & Moon)
3. Admin assigns teams
4. Submit books
5. View reads on **Profile**
6. Admin publishes standings

## Tests

```bash
npm test
```

Basic scoring tests live in `server/src/services/scoring.test.ts`.

## MongoDB Atlas backups

Atlas **M0 free tier** includes daily snapshots (limited retention). Paid tiers get continuous backup and point-in-time restore. Enable **Cloud Backup** in your Atlas cluster settings — worth doing before real participant data accumulates.
