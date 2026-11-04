/* OVR service worker — hand-written (see docs/decisions.md).
   - App shell: network-first for navigations, falling back to the cached page, then /offline.
   - Static assets (/_next/static, icons, fonts): cache-first (they're content-hashed).
   - Supabase/API calls: never cached here (the app caches data itself + queues taps).
   - Web Push: show notification, focus/open the app on click. */
// Registered as /sw.js?v=<build id>, so every deploy installs a fresh worker,
// precaches that build's pages + chunks, and drops the previous build's cache.
const VERSION = "ovr-" + (new URL(self.location.href).searchParams.get("v") || "dev");
const SHELL = [
  "/today", "/ovr", "/stats", "/league", "/profile", "/settings", "/habits", "/habits/new",
  "/quit", "/journal", "/how-ovr-works", "/login", "/onboarding", "/offline",
];
const STATIC = ["/manifest.webmanifest", "/icons/icon-192.png", "/icons/badge-72.png"];

async function precache() {
  const c = await caches.open(VERSION);
  await Promise.allSettled(STATIC.map((u) => c.add(new Request(u, { cache: "reload" }))));
  await Promise.allSettled(
    SHELL.map(async (u) => {
      const res = await fetch(u, { cache: "reload" });
      if (!res.ok) return;
      await c.put(u, res.clone());
      // cache the JS/CSS each page needs, so it can hydrate offline
      const html = await res.text();
      const assets = new Set([...html.matchAll(/\/_next\/static\/[^"'\s)\\]+/g)].map((m) => m[0]));
      await Promise.allSettled([...assets].map((a) => caches.match(a).then((hit) => hit || c.add(a))));
    }),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(req, { ignoreSearch: true })) || caches.match("/offline")),
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || /\.(woff2?|png|svg|ico)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // RSC payloads and other same-origin GETs: network, fall back to cache
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && url.searchParams.has("_rsc")) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req)),
  );
});

self.addEventListener("push", (event) => {
  let data = { title: "OVR", body: "", url: "/today" };
  try {
    data = { ...data, ...event.data.json() };
  } catch (e) {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-72.png",
      data: { url: data.url },
      tag: data.url,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/today";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
