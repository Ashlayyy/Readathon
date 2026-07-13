/**
 * Public API base URL (no trailing slash). Used for magic links and OAuth callbacks.
 *
 * IMPORTANT: This should match your *public* routing.
 * - If your API is served at `https://api.bookbaddies.net/` (no `/api` prefix), set `API_URL` to that.
 * - If your API is served at `https://api.bookbaddies.net/api`, set `API_URL` to that.
 */
export function getApiPublicBase(): string {
  const raw = process.env.API_URL?.trim() || 'http://localhost:3001/api'
  return raw.replace(/\/$/, '')
}

/** Build a full public API URL, e.g. /auth/verify → https://api.example.com/auth/verify */
export function apiPublicUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${getApiPublicBase()}${normalized}`
}
