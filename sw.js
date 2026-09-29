'use strict';

// Offline cache for the app shell. Bump VERSION when shipping changes so clients refresh.
const VERSION = 'v7';
const CACHE = `onedaydayone-${VERSION}`;
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/store.js',
  './js/audio.js',
  './js/fx.js',
  './js/haptics.js',
  './js/anim.js',
  './js/prefs.js',
  './js/loot.js',
  './js/sky.js',
  './js/lock.js',
  './js/desktop.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  ...['C3', 'Fs3', 'C4', 'Fs4', 'C5', 'Fs5', 'C6'].map((n) => `./samples/piano/${n}.mp3`),
  ...['As3', 'D4', 'Fs4', 'As4', 'D5', 'Fs5', 'A5'].map((n) => `./samples/sax/${n}.mp3`),
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('onedaydayone-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Network first so updates show up immediately; fall back to the cache when offline.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(CACHE).then((cache) =>
      fetch(req)
        .then((res) => { if (res.ok) cache.put(req, res.clone()); return res; })
        .catch(async () => (await cache.match(req, { ignoreSearch: true })) || (await cache.match('./index.html')))),
  );
});
