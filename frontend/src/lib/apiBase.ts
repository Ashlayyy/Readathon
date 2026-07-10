/** API origin from build-time env, or same-origin `/api` when unset (local dev proxy). */
function getApiBase(): string {
  const origin = import.meta.env.VITE_API_URL?.trim().replace(/\/$/, '')
  if (!origin) return '/api'
  return `${origin}/api`
}

/** Resolve a path like `/auth/me` to a fetchable API URL. */
export function apiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${getApiBase()}${normalized}`
}

export function googleLoginUrl(): string {
  return apiUrl('/auth/google')
}
