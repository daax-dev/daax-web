/**
 * daax service worker (issue #156) — deliberately minimal.
 *
 * Its ONLY jobs are (1) satisfy PWA installability, (2) serve an offline
 * fallback page for failed navigations, and (3) display notifications
 * (foreground `showNotification` today; Web Push when a VAPID backend lands).
 *
 * What it intentionally does NOT do:
 *   - It does NOT precache or serve the app shell (HTML/JS/CSS). Caching the
 *     Next.js bundle here would serve stale assets after a deploy and is a
 *     cache-poisoning footgun; the network is always the source of truth.
 *   - It does NOT touch the terminal WebSocket. A `wss?://.../…:4201` upgrade
 *     never passes through `fetch` events, and this handler additionally
 *     ignores any non-GET / non-navigation request, so terminal I/O is never
 *     intercepted, buffered, or rewritten.
 *
 * Bump CACHE_VERSION whenever offline.html changes so the activate handler
 * evicts the old cache.
 */
const CACHE_VERSION = "daax-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.add(OFFLINE_URL)),
  );
  // Take over as soon as installed so the offline fallback is available on the
  // first load after registration.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop any cache from a previous version (evicts a stale offline page).
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only ever intervene for top-level navigations. Everything else (scripts,
  // styles, data fetches, XHR, the WS upgrade) goes straight to the network,
  // untouched — no stale-asset risk.
  if (request.mode !== "navigate" || request.method !== "GET") {
    return;
  }

  event.respondWith(
    // Network-first: real content when online, offline page only on failure.
    fetch(request).catch(async () => {
      const cache = await caches.open(CACHE_VERSION);
      const cached = await cache.match(OFFLINE_URL);
      return (
        cached ||
        new Response("Offline", {
          status: 503,
          headers: { "Content-Type": "text/plain" },
        })
      );
    }),
  );
});

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

/**
 * Web Push entry point. A full push backend (VAPID keypair + a subscribe
 * endpoint that stores subscriptions and a server that pushes on the watchtower
 * "waiting" event) is DEFERRED (see the #156 report). Until then no push is
 * sent, but the handler is wired so the day a payload arrives it surfaces
 * correctly. Payload shape: { title, body, url }.
 */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data && event.data.text ? event.data.text() : "" };
  }
  const title = data.title || "Agent waiting for input";
  const options = {
    body: data.body || "Open daax to approve or deny.",
    tag: data.tag || "daax-waiting",
    renotify: true,
    data: { url: data.url || "/m" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// One-tap path from the lock screen to the mobile surface. Prefer an EXISTING
// tab already on the target path and just focus it (never navigate it). Only if
// none exists do we open a new window — deliberately NOT commandeering an
// arbitrary open workbench/terminal tab by navigating it away.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = (event.notification.data && event.notification.data.url) || "/m";

  // The payload URL is untrusted. Resolve it against OUR origin and reject
  // anything that resolves cross-origin, falling back to the mobile surface.
  // This both prevents openWindow() from navigating to an attacker-controlled
  // origin and makes the "focus an existing tab" match work for absolute-URL or
  // hash-bearing payloads — we compare normalized pathnames, not raw strings.
  let target = "/m";
  try {
    const url = new URL(raw, self.location.origin);
    if (url.origin === self.location.origin) {
      target = url.pathname + url.search + url.hash;
    }
  } catch {
    /* unparseable payload — keep the safe /m default */
  }
  const targetPath = new URL(target, self.location.origin).pathname;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // 1) A tab already on the target path → just focus it.
        for (const client of clientList) {
          try {
            if (
              new URL(client.url).pathname === targetPath &&
              "focus" in client
            ) {
              return client.focus();
            }
          } catch {
            /* client.url unparseable — skip */
          }
        }
        // 2) Otherwise open a fresh same-origin window; never hijack an
        // unrelated tab, and never open the untrusted payload verbatim.
        return self.clients.openWindow(target);
      }),
  );
});
