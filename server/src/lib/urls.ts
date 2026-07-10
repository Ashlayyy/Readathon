/** Public API origin (no trailing slash). Used for magic links and OAuth callbacks. */
export function getApiPublicOrigin(): string {
  const raw =
    process.env.API_URL?.trim() ||
    process.env.FRONTEND_URL?.trim() ||
    'http://localhost:3001'
  return raw.replace(/\/$/, '')
}

/** Build a full public API URL, e.g. /auth/verify → https://api.example.com/api/auth/verify */
export function apiPublicUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  const apiPath = normalized.startsWith('/api') ? normalized : `/api${normalized}`
  return `${getApiPublicOrigin()}${apiPath}`
}
