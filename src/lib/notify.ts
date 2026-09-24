/** Local notifications. Uses the service worker when available so clicks focus the app. */
export async function notify(title: string, body: string, tag = 'whats-next') {
  if (!('Notification' in window) || Notification.permission !== 'granted') return false
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) await reg.showNotification(title, { body, tag, icon: '/icon.svg', badge: '/icon.svg' })
    else new Notification(title, { body, tag, icon: '/icon.svg' })
    return true
  } catch {
    return false
  }
}

export async function requestNotifications(): Promise<boolean> {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  return (await Notification.requestPermission()) === 'granted'
}

/** Hand the service worker what it needs to send the morning nudge while the app is closed. */
export async function stageMorning(payload: { time: string; enabled: boolean; title: string; body: string }) {
  try {
    if (!('caches' in window)) return
    const cache = await caches.open('wn-morning')
    await cache.put('/__morning', new Response(JSON.stringify(payload), { headers: { 'Content-Type': 'application/json' } }))
    const reg = (await navigator.serviceWorker?.getRegistration()) as (ServiceWorkerRegistration & { periodicSync?: { register(tag: string, o: { minInterval: number }): Promise<void> } }) | undefined
    await reg?.periodicSync?.register('morning', { minInterval: 60 * 60 * 1000 })
  } catch {
    /* optional capability */
  }
}
