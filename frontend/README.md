# Readathon Frontend

Vue 3 single-page app for the Readathon 2026 readathon. All event copy, branding, and admin UI labels come from `../data/realmathon.json` via `GET /api/config`.

## Stack

- Vue 3 + TypeScript (`<script setup>`)
- Vue Router 5
- Vite 8
- Plain CSS design system (`src/assets/main.css`) — no UI framework
- Cookie-based session auth (no tokens in localStorage)

## Scripts

```bash
npm run dev        # Dev server on :5173, proxies /api → :3001
npm run build      # Type-check + production bundle → dist/
npm run preview    # Preview production build
npm run lint       # oxlint + eslint
```

Requires **Node 22.18+** (see root `.nvmrc`).

## Environment

| File | When | Purpose |
|------|------|---------|
| `.env.example` | Dev reference | Optional overrides |
| `.env.production` | `npm run build` | `VITE_API_URL` for production API host |

Leave `VITE_API_URL` unset in dev — Vite proxies `/api` to the backend.

## Project layout

```
src/
├── App.vue              # Shell: header, nav, loading/error states, footer
├── assets/
│   ├── main.css         # Design system (buttons, cards, alerts, layout)
│   └── base.css         # Minimal reset
├── components/          # StandingsPanel, TeamCard, PromptCard, AdminPromptsPanel
├── composables/
│   ├── useAuth.ts       # Session user singleton
│   ├── useConfig.ts     # Event config + branding theme
│   ├── useCopy.ts       # {placeholder} substitution
│   └── useAdminCopy.ts  # Admin panel copy helpers
├── lib/
│   ├── api.ts           # Fetch client + types
│   ├── apiBase.ts       # URL resolution
│   ├── branding.ts      # Applies branding.theme to CSS variables
│   └── copy.ts          # Template variable builder
├── router/index.ts      # Routes + auth guards
└── views/               # One view per page
public/
└── favicon.svg
```

## Config-driven copy

The app does not hardcode event strings. Key patterns:

- **Pages** — `config.copy.submitPageTitle`, `config.copy.faqPageTitle`, etc.
- **Admin** — `config.copy.admin` nested object (inbox, teams, standings, users, submissions, prompts, messages, confirm)
- **Branding** — `config.branding.theme` applied to `:root` CSS variables on config load
- **Placeholders** — `useCopy().t('Hello {teamCount} realms', { teamCount: 2 })`

## Routes

| Path | View | Access |
|------|------|--------|
| `/` | Home | Public |
| `/how-it-works` | HowItWorks | Public |
| `/teams` | Teams | Public |
| `/rosters` | TeamRoster | Public when enabled |
| `/prompts` | Prompts | Public |
| `/faq` | FAQ | Public |
| `/standings` | Standings | Public |
| `/login` | Login | Guests only |
| `/submit` | Submit | Assigned readers |
| `/profile` | Profile | Authenticated |
| `/admin` | Admin | Admins only |

## Production build

```bash
# From repo root
cp frontend/.env.production.example frontend/.env.production
# Set VITE_API_URL=https://api.your-domain.com

npm run build --prefix frontend
```

Serve `dist/` as a static SPA (`try_files … /index.html`). The API must set CORS and cookies for the frontend origin.

## Editing admin copy

All admin panel text lives in `data/realmathon.json` under `copy.admin`:

```json
"admin": {
  "title": "Admin Panel",
  "tabs": { "inbox": "Inbox", ... },
  "inbox": { "title": "Question Inbox", ... },
  "messages": { "teamUpdated": "Team updated.", ... },
  "confirm": { "deleteQuestion": "Remove this message?", ... }
}
```

Restart the server or reload config after editing.
