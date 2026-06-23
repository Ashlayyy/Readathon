# REALMATHON 5.0 — The Crucible

Vue frontend + Hono API + MongoDB for the Realmathon readathon.

## Structure

```
Readathon/
├── data/realmathon.json   # Static content (teams, prompts, FAQ, branding)
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

## VPS deployment

1. Run MongoDB (or use MongoDB Atlas)
2. `cd frontend && npm run build`
3. Serve `frontend/dist` via nginx/caddy
4. Run `cd server && npm start` with pm2
5. Proxy `/api` to the Hono server
6. Set `FRONTEND_URL`, `MONGODB_URI`, `SESSION_SECRET`, `ADMIN_EMAILS`
