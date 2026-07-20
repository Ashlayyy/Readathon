// Minimal offline-ish shell cache for The Crucible - keeps rules/FAQ reachable without a network.
const CACHE_NAME = 'crucible-shell-v1'
const SHELL_URLS = ['/', '/faq', '/how-it-works', '/manifest.webmanifest', '/favicon.svg']

const OFFLINE_FALLBACK_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Offline - The Crucible</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { font-family: system-ui, sans-serif; background: #08070b; color: #f4efe8; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 2rem; text-align: center; }
  .box { max-width: 28rem; }
  h1 { color: #d4634a; margin-bottom: 0.75rem; }
  p { color: #9a9188; line-height: 1.6; }
</style>
</head>
<body>
  <div class="box">
    <h1>You're offline</h1>
    <p>The Crucible can't reach the server right now. Check your connection and try again - Rules and FAQ may still load from cache.</p>
  </div>
</body>
</html>`

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        SHELL_URLS.map((url) =>
          fetch(url)
            .then((res) => (res && res.ok ? cache.put(url, res) : null))
            .catch(() => null),
        ),
      ),
    ),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      ),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  if (new URL(request.url).pathname.startsWith('/api')) return
  if (request.mode !== 'navigate') return

  event.respondWith(
    fetch(request)
      .then((res) => {
        const copy = res.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
        return res
      })
      .catch(async () => {
        const cached = await caches.match(request)
        if (cached) return cached

        const shell = await caches.match('/')
        if (shell) return shell

        return new Response(OFFLINE_FALLBACK_HTML, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        })
      }),
  )
})
