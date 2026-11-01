// Datalyst service worker.
//
// The native apps are Capacitor shells pointing at this origin, so anything this
// worker gets wrong freezes the phone app too. Two rules keep that from happening:
//
//   1. Only same-origin GET navigations are intercepted. API calls, hashed
//      /_next/static chunks and cross-origin auth traffic go straight to the
//      network, so a failure surfaces as a failure instead of an HTML body
//      served with a 200 status.
//   2. Navigations are network-first. Nothing caches the app shell, because a
//      cached shell pins its build-hashed script URLs and those 404 on the next
//      deploy — the page paints but never hydrates.
//
// Bump CACHE_NAME whenever this file changes: activate deletes every cache that
// does not match, which is what repairs devices still holding the old v1 cache.
const CACHE_NAME = 'datalyst-v2';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.add(OFFLINE_URL))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((names) => Promise.all(
                names
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;

    if (request.method !== 'GET' || request.mode !== 'navigate') return;
    if (new URL(request.url).origin !== self.location.origin) return;

    event.respondWith(
        fetch(request).catch(async () => {
            const offline = await caches.match(OFFLINE_URL);
            // Response.error() rather than undefined: passing undefined to
            // respondWith throws and turns a missed cache into a broken request.
            return offline ?? Response.error();
        })
    );
});
