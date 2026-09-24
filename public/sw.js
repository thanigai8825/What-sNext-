// What's Next service worker: notifications only. No offline caching of the app.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if ('focus' in c) return c.focus()
      return self.clients.openWindow('/')
    }),
  )
})

// Morning nudge while the app is closed (Chromium, installed app, periodic sync granted).
self.addEventListener('periodicsync', (event) => {
  if (event.tag !== 'morning') return
  event.waitUntil(
    (async () => {
      const cache = await caches.open('wn-morning')
      const res = await cache.match('/__morning')
      if (!res) return
      const p = await res.json()
      if (!p.enabled) return
      const now = new Date()
      const today = now.toDateString()
      const [h, m] = String(p.time || '08:30').split(':').map(Number)
      const mins = now.getHours() * 60 + now.getMinutes()
      if (mins < h * 60 + m || now.getHours() >= 12 || p.sentOn === today) return
      await self.registration.showNotification(p.title, { body: p.body, tag: 'morning', icon: '/icon.svg' })
      await cache.put('/__morning', new Response(JSON.stringify({ ...p, sentOn: today })))
    })(),
  )
})
