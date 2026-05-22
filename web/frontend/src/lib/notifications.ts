// Wrappers Notification API. Demande la permission au premier usage,
// no-op si refusee. Pas de service worker push backend (pas d'abonnement
// VAPID dans le scope demo) — juste des notifs locales declenchees par
// les events WS qu'on recoit deja.

let permissionAsked = false

export async function askPermission(): Promise<NotificationPermission> {
  if (typeof Notification === 'undefined') return 'denied'
  if (permissionAsked) return Notification.permission
  permissionAsked = true
  if (Notification.permission === 'default') {
    return Notification.requestPermission()
  }
  return Notification.permission
}

export function notify(title: string, body: string, opts: { tag?: string } = {}): void {
  if (typeof Notification === 'undefined') return
  if (Notification.permission !== 'granted') return
  // tag deduplique les notifs (ex: une seule "robot offline" affichee)
  try {
    new Notification(title, { body, tag: opts.tag, icon: '/pwa-192x192.png' })
  } catch {
    /* ignore (navigateur peut bloquer si pas de geste utilisateur recent) */
  }
}
