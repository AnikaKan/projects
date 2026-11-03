// Offline app shell for Sakhi (formerly Hisaab Saathi) (production builds only; registered in src/main.tsx).
// - install: precache every built file listed in precache-manifest.json (app, styles, fonts for en/hi/te)
// - fetch:   same-origin GETs are network-first with cache fallback, so a new deployment is picked up when
//            online and the last good copy is used when offline. /api/* (speech, AI) is NEVER cached:
//            those features need the network and the app already shows offline notices for them.
// Learner progress lives in localStorage, not in this cache.
const CACHE = 'hisaab-shell-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      try {
        const res = await fetch('./precache-manifest.json', { cache: 'no-store' })
        const { files } = await res.json()
        await cache.addAll(files.map((f) => new URL(f, self.registration.scope).toString()))
      } catch {
        await cache.add(new URL('./', self.registration.scope).toString())
      }
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k)
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE)
      try {
        const res = await fetch(req)
        if (res.ok && res.type === 'basic') cache.put(req, res.clone())
        return res
      } catch {
        const hit = (await cache.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? await cache.match(new URL('./', self.registration.scope).toString()) : undefined)
        return hit || Response.error()
      }
    })(),
  )
})
