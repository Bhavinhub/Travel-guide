/**
 * "Save offline" for the 3D map: downloads the imagery and label tiles along a route and around
 * the destination, so the service worker (public/sw.js) can show the whole journey without a
 * connection. Tiles are fetched a few at a time and the service worker stores them.
 */
export const TILE_URLS = {
  satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  labels: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
  street: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  dem: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
};

const tileOf = (lat: number, lon: number, z: number): [number, number] => {
  const n = 2 ** z, r = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
  return [Math.floor(((lon + 180) / 360) * n), Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n)];
};
const url = (t: string, z: number, x: number, y: number) => t.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));

/** Tiles for a trip, most important first: the arrival close-up, then the route corridor, then the globe. */
export function tilesForTrip(pts: [number, number][], dest: [number, number]) {
  const keys = new Set<string>();
  const add = (z: number, x: number, y: number) => keys.add(`${z}/${x}/${y}`);
  // 1. The arrival: close-up detail around the destination (what you look at most).
  for (let z = 12; z <= 16; z++) {
    const [x, y] = tileOf(dest[0], dest[1], z), r = z === 14 || z === 15 ? 2 : 1;
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) add(z, x + dx, y + dy);
  }
  // 2. Along the route: a corridor one tile either side, sampled along the road / flight.
  const line = pts.length ? pts : [dest];
  for (let z = 11; z >= 4; z--) {
    const step = Math.max(1, Math.floor(line.length / (z < 8 ? 50 : 250)));
    for (let i = 0; i < line.length; i += step) {
      const [x, y] = tileOf(line[i][0], line[i][1], z);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) add(z, x + dx, y + dy);
    }
  }
  // 3. The whole Earth at globe zoom levels (few tiles).
  for (let z = 0; z <= 3; z++) for (let x = 0; x < 2 ** z; x++) for (let y = 0; y < 2 ** z; y++) add(z, x, y);
  return [...keys].map((k) => k.split('/').map(Number) as [number, number, number]);
}

/** Download tiles for a trip; reports progress 0…1. Resolves with how many were saved. */
export async function saveTripOffline(pts: [number, number][], dest: [number, number], onProgress: (p: number) => void, street = false) {
  const tiles = tilesForTrip(pts, dest);
  const jobs: string[] = [];
  for (const [z, x, y] of tiles) {
    jobs.push(url(TILE_URLS.satellite, z, x, y));
    if (z >= 5) jobs.push(url(TILE_URLS.labels, z, x, y)); // place names only matter once zoomed in
    if (street) jobs.push(url(TILE_URLS.street, z, x, y));
    if (z >= 8 && z <= 11) jobs.push(url(TILE_URLS.dem, z, x, y));
  }
  let done = 0, ok = 0, next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const u = jobs[next++];
      try { const r = await fetch(u, { mode: 'cors' }); if (r.ok) { ok++; await r.arrayBuffer(); } } catch { /* skip a tile that fails */ }
      done++;
      if (done % 6 === 0 || done === jobs.length) onProgress(done / jobs.length);
    }
  };
  await Promise.all(Array.from({ length: 16 }, worker));
  return ok;
}

/**
 * Warm the browser cache with the destination's close-up tiles, quietly and in the background,
 * so the arrival is sharp at once instead of waiting behind every tile requested along the way.
 */
const warmed = new Set<string>();
export function prefetchArrival(lat: number, lon: number) {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  if (warmed.has(key) || !navigator.onLine) return;
  warmed.add(key);
  const jobs: string[] = [];
  for (let z = 9; z <= 16; z++) {
    const [x, y] = tileOf(lat, lon, z), r = z >= 14 ? 2 : 1;
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
      jobs.push(url(TILE_URLS.satellite, z, x + dx, y + dy), url(TILE_URLS.labels, z, x + dx, y + dy));
      if (z <= 11) jobs.push(url(TILE_URLS.dem, z, x + dx, y + dy));
    }
  }
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const u = jobs[next++];
      try { await fetch(u, { mode: 'cors', priority: 'low' } as RequestInit); } catch { /* best effort */ }
    }
  };
  for (let i = 0; i < 4; i++) worker();
}

/**
 * Warm the cache with coarse imagery (zoom 2–8) along a whole route: the map's base layer then
 * always has something sharp-enough under the camera, however fast it flies.
 */
export function prefetchCorridor(pts: [number, number][]) {
  if (!pts.length || !navigator.onLine) return;
  const keys = new Set<string>();
  for (let z = 2; z <= 8; z++) {
    const step = Math.max(1, Math.floor(pts.length / (z <= 5 ? 40 : 160))), r = z <= 6 ? 1 : 0;
    for (let i = 0; i < pts.length; i += step) {
      const [x, y] = tileOf(pts[i][0], pts[i][1], z);
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) keys.add(`${z}/${x + dx}/${y + dy}`);
    }
  }
  const jobs = [...keys].map((k) => { const [z, x, y] = k.split('/').map(Number); return url(TILE_URLS.satellite, z, x, y); });
  let next = 0;
  const worker = async () => { while (next < jobs.length) { const u = jobs[next++]; try { await fetch(u, { mode: 'cors' }); } catch { /* best effort */ } } };
  for (let i = 0; i < 6; i++) worker();
}

/** Register the service worker (production builds only — the dev server stays uncached). */
export function registerOffline() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  addEventListener('load', () => { navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined); });
}
