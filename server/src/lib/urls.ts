/**
 * Public API base URL (no trailing slash). Used for magic links and OAuth callbacks.
 *
 * Set `API_URL` to the API subdomain root, e.g. `https://api.bookbaddies.net`.
 * Public paths are `/auth/verify`, `/config`, etc. - nginx proxies them to the
 * Hono app's internal `/api/*` routes.
 */
export function getApiPublicBase(): string {
	const raw = process.env.API_URL?.trim() || 'http://localhost:3001/api';
	return raw.replace(/\/$/, '');
}

/** Build a full public API URL, e.g. /auth/verify → https://api.example.com/auth/verify */
export function apiPublicUrl(path: string): string {
	const normalized = path.startsWith('/') ? path : `/${path}`;
	return `${getApiPublicBase()}${normalized}`;
}
