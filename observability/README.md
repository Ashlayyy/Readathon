# Prometheus + Grafana for The Crucible / Readathon
#
# Quick start (Docker):
#   1. Make sure the API is running (default http://host.docker.internal:3001)
#   2. From repo root:
#        docker compose -f observability/docker-compose.yml up -d
#   3. Open Grafana http://localhost:3000  (admin / admin)
#   4. Dashboard "Readathon / The Crucible" is auto-provisioned
#
# Already have Prometheus/Grafana?
#   - Point Prometheus at your API /metrics (see prometheus.yml)
#   - Grafana → Dashboards → Import → upload grafana/dashboards/readathon.json
#
# Optional: set METRICS_TOKEN in server/.env and matching bearer in prometheus.yml
#
# ---------------------------------------------------------------------------
# PostHog (product analytics) — optional, env-only
# ---------------------------------------------------------------------------
# Frontend (rebuild after setting):
#   VITE_POSTHOG_KEY=phc_…
#   VITE_POSTHOG_HOST=https://eu.i.posthog.com   # or us.i.posthog.com
#
# Server (events like submission_created, standings_published):
#   POSTHOG_API_KEY=phx_…
#   POSTHOG_HOST=https://eu.i.posthog.com
#
# Leave keys blank → total no-op (safe for local).
#
# ---------------------------------------------------------------------------
# Better Stack (logs + uptime) — optional, env-only
# ---------------------------------------------------------------------------
# Logs (HTTP source token from Better Stack → Logs → Sources):
#   BETTERSTACK_SOURCE_TOKEN=…
#   BETTERSTACK_INGESTING_HOST=in.logs.betterstack.com
#   # or BETTERSTACK_ENDPOINT=https://in.logs.betterstack.com
#
# Heartbeat (cron-style ping every 60s while the API is up):
#   BETTERSTACK_HEARTBEAT_URL=https://uptime.betterstack.com/api/v1/heartbeat/…
#
# HTTP uptime monitor (create in Better Stack UI):
#   GET https://your-api/api/health
#   Expect JSON status: "ok"
#
# /api/health also reports which integrations are enabled under `integrations`.
