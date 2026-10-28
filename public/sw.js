/* Travel Guide service worker — the site and the 3D map keep working offline.
 * - Pages: network first, falling back to the cached app shell.
 * - Built assets and local photos: cache first (their names change when they change).
 * - Map imagery, labels, street tiles and elevation: cache first, so any area already viewed
 *   (or saved with "Save offline") still shows without a connection.
 * - Live data (Wikipedia, weather, routes): network first, last good answer when offline.
 */
const VERSION = 'tg-v2';
const SHELL = `${VERSION}-shell`;
const STATIC = `${VERSION}-static`;
const TILES = `${VERSION}-tiles`;
const DATA = `${VERSION}-data`;
const MAX_TILES = 6000;

const TILE_HOSTS = ['server.arcgisonline.com', 'tile.openstreetmap.org', 's3.amazonaws.com', 'tiles.openfreemap.org'];
const DATA_HOSTS = ['en.wikipedia.org', 'commons.wikimedia.org', 'api.open-meteo.com', 'geocoding-api.open-meteo.com', 'router.project-osrm.org', 'routing.openstreetmap.de', 'api.frankfurter.dev'];
const IMAGE_HOSTS = ['upload.wikimedia.org', 'thumb.wikimedia.org'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['./', './index.html', './favicon.svg', './media/space/milky-way.jpg'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

let trimming = false;
async function trimTiles() {
  if (trimming) return;
  trimming = true;
  try {
    const c = await caches.open(TILES);
    const keys = await c.keys();
    for (let i = 0; i < keys.length - MAX_TILES; i++) await c.delete(keys[i]);
  } finally { trimming = false; }
}

async function cacheFirst(req, cacheName, trim) {
  const c = await caches.open(cacheName);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) { c.put(req, res.clone()); if (trim) trimTiles(); }
  return res;
}

async function networkFirst(req, cacheName) {
  const c = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) c.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await c.match(req);
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/api/')) return;
    if (req.mode === 'navigate') {
      e.respondWith(networkFirst(req, SHELL).catch(() => caches.match('./index.html')));
      return;
    }
    if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/media/') || url.pathname.startsWith('/audio/')) {
      if (req.headers.has('range')) return; // audio streaming asks for byte ranges — leave those to the network
      e.respondWith(cacheFirst(req, STATIC));
    }
    return;
  }
  // The label index (which dated tile set is current) must stay fresh; the tiles themselves never change.
  if (url.host === 'tiles.openfreemap.org' && !/\.pbf$/.test(url.pathname)) { e.respondWith(networkFirst(req, DATA)); return; }
  if (TILE_HOSTS.includes(url.host)) { e.respondWith(cacheFirst(req, TILES, true)); return; }
  if (IMAGE_HOSTS.includes(url.host)) { e.respondWith(cacheFirst(req, STATIC)); return; }
  if (DATA_HOSTS.includes(url.host)) { e.respondWith(networkFirst(req, DATA)); }
});
