import type { Context, Next } from 'hono'

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

function clientKey(c: Context): string {
  const forwarded = c.req.header('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]!.trim()
  return c.req.header('x-real-ip') ?? 'unknown'
}

export function rateLimit(opts: { windowMs: number; max: number; keyPrefix?: string }) {
  const { windowMs, max, keyPrefix = '' } = opts

  return async (c: Context, next: Next) => {
    const key = `${keyPrefix}:${clientKey(c)}:${c.req.path}`
    const now = Date.now()
    let bucket = buckets.get(key)

    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs }
      buckets.set(key, bucket)
    }

    bucket.count++

    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000)
      c.header('Retry-After', String(retryAfter))
      return c.json({ error: 'Too many requests. Please try again later.' }, 429)
    }

    await next()
  }
}

// Prevent unbounded memory growth in long-running processes
setInterval(() => {
  const now = Date.now()
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key)
  }
}, 60_000).unref()
