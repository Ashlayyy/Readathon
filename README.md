# Readathon 2026 - The Crucible

A team-based reading competition for the Book Baddies community. Readers join realms, submit finished books, stack prompts and bonuses for points, sabotage rival teams, and climb weekly standings.

Built with **Vue 3 + Vite** (frontend), **Hono + MongoDB** (API), and a single config file that drives almost all site copy, teams, prompts, FAQ, branding, and admin UI text.

---

## Features

- **Sign up & magic-link login** (email via Resend, optional Google OAuth)
- **Team assignment** — admins sort readers into realms (Riders, Wielders, Explorers)
- **Book submission wizard** — prompts, bonuses, add points or sabotage; optional Discord realm chat with cover
- **Standings** — published weekly snapshot with leaderboard, reading vibes, score breakdown, optional 4-week wrap
- **Hall of Fame** — season leaders (books, pages, sabotage)
- **Shelf** — recent finished books across realms
- **Monthly themes** — scheduled look/multipliers/featured prompts, Reader of the Month, Discord templates
- **Season archive** — one-click close from Admin → Settings (optional downtime)
- **FAQ inbox** — readers ask questions; admins reply by email
- **Admin panel** — Inbox, Teams, Standings, Users, Submissions, Stats, Prompts, Audit, Themes, Settings
- **Discord** — webhook or bot delivery, role pings, scheduled publish, wrap + Reader of the Month announces
- **PWA** — installable (`manifest.webmanifest` + service worker)
- **Config-driven UI** — event name, copy, colors, and admin labels live in `data/realmathon.json`

---

## Project structure

```
Readathon/
├── data/
│   └── realmathon.json      # Event content, copy, teams, prompts, FAQ, branding, admin UI
├── frontend/                # Player SPA (Book Baddies + /e/:slug)
├── product/                 # Marketing + host panel (product.com)
├── server/                  # Hono API + Mongoose + MongoDB
├── deploy/                  # nginx examples for multi-tenant prod
├── ecosystem.config.cjs     # PM2 process config
├── package.json             # Root scripts (dev, pm2, test)
└── .nvmrc                   # Node 22.18+
```

---

## Requirements

- **Node.js 22.18+** or **24.12+** (`nvm use`)
- **MongoDB** (Atlas recommended)
- **Resend** API key for production email (magic links)
- Optional: **Google OAuth** credentials, **Discord** webhook for standings posts

---

## Quick start (development)

```bash
nvm use
npm install
npm install --prefix frontend
npm install --prefix product
npm install --prefix server

cp server/.env.example server/.env
# Edit server/.env - at minimum MONGODB_URI, SESSION_SECRET,
# FRONTEND_URL=http://localhost:5173, PRODUCT_URL=http://localhost:5174

npm run dev
```

| Service              | URL                     |
| -------------------- | ----------------------- |
| Players (`frontend`) | http://localhost:5173   |
| Host panel (`product`) | http://localhost:5174 |
| API                  | http://localhost:3001   |

The Vite apps proxy `/api` to the backend. Leave `VITE_API_URL` unset locally.

Without `RESEND_API_KEY`, sign-in links print to the server console instead of emailing.

Multi-tenant / host panel docs: [`MULTI_TENANT.md`](./MULTI_TENANT.md), [`HOST_PANEL_PLAN.md`](./HOST_PANEL_PLAN.md).

---

## Configuration (`data/realmathon.json`)

This file is the **single source of truth** for static event content. The server loads it at startup and exposes it via `GET /api/config`. The frontend applies branding colors dynamically from `branding.theme`.

### What's in the file

| Section            | Purpose                                                                |
| ------------------ | ---------------------------------------------------------------------- |
| `event`            | Name, subtitle, tagline, lore, schedule month                          |
| `copy`             | All user-facing UI strings (login, nav, submit wizard, profile, pages) |
| `copy.admin`       | **All admin panel labels, buttons, messages, and confirm dialogs**     |
| `copy.nav`         | Main navigation labels                                                 |
| `schedule`         | Readathon start/end dates (used in FAQ copy)                           |
| `branding.theme`   | CSS theme colors applied at runtime                                    |
| `teams`            | Realm definitions, colors, bonus prompts                               |
| `prompts`          | Global positive/negative prompts (fallback if DB empty)                |
| `globalBonuses`    | Competition/trials bonus (+10 points)                                  |
| `pageCountBonuses` | Page-count point tiers                                                 |
| `howItWorks`       | Step-by-step guide                                                     |
| `faq`              | Questions and answers                                                  |
| `scoringRules`     | Game rules (max prompts, averaging, etc.)                              |

### Editing copy

Most strings support `{placeholders}` like `{teamCount}`, `{maxPrompts}`, `{eventName}`. Admin messages use `{count}`, `{weekLabel}`, `{title}`, etc.

After editing the JSON on a **running production server**, reload config:

- Admin → call reload endpoint, or
- Restart PM2: `npm run pm2:restart`

### Prompts: JSON vs database

- **JSON** - default prompts, team shells, FAQ, all copy
- **Database** - admins can import JSON prompts and edit them live (Admin → Prompts → Import from config file)
- If the DB has prompts, those take precedence over JSON for the public site

---

## Environment variables

### Server (`server/.env`)

```env
MONGODB_URI=mongodb+srv://...
SESSION_SECRET=long-random-secret
FRONTEND_URL=https://your-domain.com
API_URL=https://api.your-domain.com
ADMIN_EMAILS=you@email.com
RESEND_API_KEY=re_...
EMAIL_FROM=Readathon <you@yourdomain.com>

# Optional
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://api.your-domain.com/auth/google/callback
PORT=3001
```

### Frontend production (`frontend/.env.production`)

```env
VITE_API_URL=https://api.your-domain.com
VITE_PRODUCT_URL=https://product.com
VITE_PRODUCT_APEX=product.com
VITE_PRODUCT_NAME=Product
```

### Product production (`product/.env.production`)

```env
VITE_PLAYER_ORIGIN=https://product.com
VITE_PRODUCT_APEX=product.com
VITE_PRODUCT_NAME=Product
# VITE_API_URL=https://api.your-domain.com
```

---

## Production deployment

Recommended hosts:

| Host | Serves |
|------|--------|
| `product.com` / `www` | Host panel + marketing (`product/dist`) |
| `bookbaddies.net` | Default Crucible players (`frontend/dist`) |
| `*.product.com` or `product.com/e/:slug` | Tenant player sites (`frontend/dist`) |
| `api…` (optional) | Hono API |

```bash
cp frontend/.env.production.example frontend/.env.production
cp product/.env.production.example product/.env.production
# Set server/.env: FRONTEND_URL, PRODUCT_URL, PRODUCT_APEX,
# COOKIE_DOMAIN=.product.com (when sharing sessions on that apex),
# PLATFORM_DISCORD_BOT_TOKEN, RESEND_*, SESSION_SECRET

npm run pm2:start
```

`pm2:start` builds **both** SPAs and starts the API (`NODE_ENV=production`). In production the API can serve the correct `dist` from the `Host` header (see `server/src/index.ts`).

Full nginx samples: [`deploy/nginx.product.example.conf`](./deploy/nginx.product.example.conf).

`FRONTEND_URL` and `PRODUCT_URL` must match browser origins for CORS. Subdomains of `PRODUCT_APEX` are allowed automatically.

After code or config changes:

```bash
npm run build && npm run pm2:restart
```

Keep PM2 alive across reboots:

```bash
pm2 startup systemd -u $USER --hp $HOME
pm2 save
```

---

## User flow

1. Reader signs up → waits in the unassigned pool
2. Admin assigns teams (random or manual)
3. Reader submits books via the wizard
4. Admin publishes weekly standings
5. Readers track submissions on **Profile**

---

## Admin panel

Access via **Admin** in the nav (users listed in `ADMIN_EMAILS`).

| Tab             | What it does                                           |
| --------------- | ------------------------------------------------------ |
| **Inbox**       | FAQ questions from readers - reply, mark read, dismiss |
| **Teams**       | Random assign, roster visibility toggle, quick stats   |
| **Standings**   | Publish/unpublish weeks, Discord webhook, download SVG |
| **Users**       | View participants, assign teams, add users manually    |
| **Submissions** | Edit or delete reader submissions                      |
| **Prompts**     | Manage live/scheduled/draft prompts, import from JSON  |

All admin UI text is in `data/realmathon.json` under `copy.admin`.

---

## Auth

- **Signup** - name + email → magic link emailed (15 min, single-use)
- **Login** - same magic-link flow
- **Google** - optional OAuth (requires server env vars)
- **Admins** - emails in `ADMIN_EMAILS`

---

## Tests

```bash
npm test
```

Scoring logic tests live in `server/src/services/scoring.test.ts`.

---

## MongoDB backups

Enable **Cloud Backup** in Atlas before real participant data accumulates. M0 free tier includes limited daily snapshots; paid tiers offer point-in-time restore.

---

## License

Private community project for Book Baddies.
