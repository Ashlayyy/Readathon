/**
 * API base URL (no trailing slash).
 * Dev: `/api` (Vite proxy). Production: `VITE_API_URL` e.g. `https://api.bookbaddies.net`.
 */
function getApiBase(): string {
	const origin = import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, '');
	if (!origin) return '/api';
	return origin;
}

/** Resolve a path like `/auth/me` to a fetchable API URL (never produces `//` in the path). */
export function apiUrl(path: string): string {
	const base = getApiBase();
	const pathPart = path.replace(/^\/+/, '');

	if (/^https?:\/\//i.test(base)) {
		return new URL(pathPart, `${base}/`).href;
	}

	const basePart = base.replace(/^\/+|\/+$/g, '');
	return `/${basePart}/${pathPart}`;
}

export function googleLoginUrl(): string {
	return apiUrl('/auth/google');
}
