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
	const base = apiUrl('/auth/google');
	if (typeof window === 'undefined') return base;

	const host = window.location.hostname.toLowerCase();
	const apex =
		(import.meta.env.VITE_PRODUCT_APEX as string | undefined)
			?.trim()
			.toLowerCase() || 'product.com';
	const isMarketing =
		host === apex ||
		host === `www.${apex}` ||
		((host === 'localhost' || host === '127.0.0.1') &&
			new URLSearchParams(window.location.search).has('marketing'));
	if (isMarketing) return `${base}?platform=1`;

	const pathMatch = window.location.pathname.match(/^\/e\/([a-z0-9-]+)(?:\/|$)/i);
	if (pathMatch?.[1]) {
		return `${base}?tenant=${encodeURIComponent(pathMatch[1].toLowerCase())}`;
	}
	if (host.endsWith(`.${apex}`)) {
		const sub = host.slice(0, -(apex.length + 1));
		if (sub && !sub.includes('.')) {
			return `${base}?tenant=${encodeURIComponent(sub)}`;
		}
	}
	return base;
}
