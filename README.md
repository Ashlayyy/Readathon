# REALMATHON 5.0 — The Crucible

Vue frontend + Hono API + MongoDB for the Realmathon readathon.

## Structure

```
Readathon/
├── data/realmathon.json   # Static content (teams, prompts, FAQ, branding)
├── ecosystem.config.cjs   # PM2 — API + frontend (2 processes)
├── frontend/              # Vue 3 + Vite + TypeScript
├── server/                # Hono + Mongoose + MongoDB
└── package.json
```

## Requirements

- Node.js **22.18+** or **24.12+**
- **MongoDB** — local via Docker, or MongoDB Atlas

### Start MongoDB (Docker)

```bash
docker compose up -d
```

## Setup

```bash
npm install
cd frontend && npm install
cd ../server && npm install
cp server/.env.example server/.env
```

Edit `server/.env`:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/realmathon
SESSION_SECRET=your-long-random-secret
ADMIN_EMAILS=you@example.com
```

Optional Google OAuth:

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3001/api/auth/google/callback
```

## Development

```bash
npm run dev
```

- Frontend: http://localhost:5173
- API: http://localhost:3001

## Auth

- **Email signup:** name + email → enters pending pool (instant session)
- **Email login:** magic link sent to your inbox (15 min, single-use) — no password
- **Google:** OAuth, linked by email
- **Admins:** `ADMIN_EMAILS` in `.env` — checked on every admin request

### Magic-link email (production)

Set `RESEND_API_KEY` and `EMAIL_FROM` in `server/.env`.  
Without it, sign-in links are printed to the **server console** during development.

## User flow

1. Sign up (email or Google)
2. Wait in unassigned pool
3. Admin assigns teams randomly
4. Submit books via the wizard
5. View submissions on **My Reads**
6. Admin publishes standings when ready

## PM2 (Linux server)

Runs the API and frontend as two separate PM2 processes on the same machine.

```bash
npm install -g pm2
npm install
npm install --prefix frontend
npm install --prefix server
cp server/.env.example server/.env
# edit server/.env — set FRONTEND_URL to your public URL (e.g. http://your-server:5173)
docker compose up -d   # or use MongoDB Atlas
```

**Production** (builds frontend, then starts API + Vite preview on port 5173):

```bash
npm run pm2:start
```

**Development** on the server (hot reload):

```bash
npm run pm2:start:dev
```

Other commands:

```bash
npm run pm2:logs      # tail both processes
npm run pm2:restart   # after code/config changes
npm run pm2:stop
npm run pm2:delete    # remove from PM2
```

After a frontend change in production, rebuild and restart:

```bash
npm run build --prefix frontend && npm run pm2:restart
```

Keep PM2 running after reboot:

```bash
pm2 startup systemd -u $USER --hp $HOME
pm2 save
```

| Process          | Port | Role                          |
|------------------|------|-------------------------------|
| `realmathon-api` | 3001 | Hono API                      |
| `realmathon-web` | 5173 | Vite dev or preview (proxies `/api`) |

Logs are written to `logs/` in the project root.

## VPS deployment (nginx)

For a public domain with HTTPS, put nginx/caddy in front:

1. Run MongoDB (or use MongoDB Atlas)
2. `npm run pm2:start` (or build + PM2 as above)
3. Proxy `/api` to `http://127.0.0.1:3001` and `/` to `http://127.0.0.1:5173`
4. Set `FRONTEND_URL` to your public HTTPS URL in `server/.env`
