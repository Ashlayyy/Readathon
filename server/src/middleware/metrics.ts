import type { MiddlewareHandler } from 'hono'
import {
	httpRequestDuration,
	httpRequestsTotal,
	normalizeRoute,
} from '../services/metrics.js'

/** Record request rate + latency for Prometheus. Skip the scrape endpoint itself. */
export const metricsMiddleware: MiddlewareHandler = async (c, next) => {
	const path = c.req.path
	if (path === '/metrics' || path.startsWith('/metrics?')) {
		return next()
	}

	const start = process.hrtime.bigint()
	await next()
	const seconds = Number(process.hrtime.bigint() - start) / 1e9

	const route = normalizeRoute(path)
	const method = c.req.method
	const status = String(c.res.status || 200)

	httpRequestsTotal.labels(method, route, status).inc()
	httpRequestDuration.labels(method, route, status).observe(seconds)
}
