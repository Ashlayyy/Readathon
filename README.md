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
API_URL=https://api.your-domain.com
ADMIN_EMAILS=you@email.com
RESEND_API_KEY=...
EMAIL_FROM=Readathon <you@yourdomain.com>
```

For production, copy `frontend/.env.production.example` to `frontend/.env.production` and set the same API host:

```env
VITE_API_URL=https://api.your-domain.com
```

Leave `VITE_API_URL` unset in local dev — the Vite dev server proxies `/api` to the backend.

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

## Production (Linux server + nginx)

The frontend and API are on **separate public URLs**:

- **Frontend:** `https://your-domain.com` — static Vue app
- **API:** `https://api.your-domain.com` — Hono on port `3001` (PM2)

```bash
cp frontend/.env.production.example frontend/.env.production
# edit VITE_API_URL and server/.env (FRONTEND_URL, API_URL)
npm run pm2:start
```

What `pm2:start` does:

1. `npm run build --prefix frontend` — bakes `VITE_API_URL` into the client bundle
2. Starts the API with `NODE_ENV=production` on port `3001`

| Variable | Where | Production value |
|----------|-------|------------------|
| `VITE_API_URL` | `frontend/.env.production` | `https://api.your-domain.com` |
| `FRONTEND_URL` | `server/.env` | `https://your-domain.com` |
| `API_URL` | `server/.env` | `https://api.your-domain.com` |
| `GOOGLE_REDIRECT_URI` | `server/.env` | `https://api.your-domain.com/api/auth/google/callback` |
| `NODE_ENV` | PM2 | `production` |
| `PORT` | `server/.env` / PM2 | `3001` (localhost only) |
| `MONGODB_URI` | `server/.env` | Atlas connection string |
| `SESSION_SECRET` | `server/.env` | Strong random string |

### Example nginx

**Frontend** (`your-domain.com`) — serve `frontend/dist`:

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    root /path/to/Readathon/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

**API** (`api.your-domain.com`) — proxy to PM2:

```nginx
server {
    listen 443 ssl http2;
    server_name api.your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

`FRONTEND_URL` must match the browser origin so CORS and auth cookies work across subdomains.

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

- **Email signup:** name + email → account created in the pending pool → **magic link emailed** (no session until you click it)
- **Email login:** magic link via Resend (15 min, single-use)
- **Google:** optional OAuth
- **Admins:** `ADMIN_EMAILS` in `.env`
- **Admin can add users** manually without sending email (Users tab)

Without `RESEND_API_KEY`, sign-in links print to the server console (dev only).

### Discord standings webhook (optional)

In **Admin → Standings**, set a Discord webhook URL to post the standings SVG (same image as the site) with the week number when standings are published. Leave it blank to disable, or use **Remove** to clear it later.

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
