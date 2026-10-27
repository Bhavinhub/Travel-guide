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

/** Tiles covering a route (lat, lon points) and its destination, nearest detail first, capped. */
export function tilesForTrip(pts: [number, number][], dest: [number, number], cap = 900) {
  const keys = new Set<string>();
  const add = (z: number, x: number, y: number) => keys.add(`${z}/${x}/${y}`);
  // The globe and the overview: whole-world levels are tiny.
  for (let z = 0; z <= 3; z++) for (let x = 0; x < 2 ** z; x++) for (let y = 0; y < 2 ** z; y++) add(z, x, y);
  // Along the route: a corridor of tiles that widens with zoom.
  const line = pts.length ? pts : [dest];
  for (let z = 4; z <= 12; z++) {
    const step = Math.max(1, Math.floor(line.length / (z < 9 ? 60 : 400)));
    for (let i = 0; i < line.length; i += step) {
      const [x, y] = tileOf(line[i][0], line[i][1], z);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) add(z, x + dx, y + dy);
    }
  }
  // The arrival: close-up detail around the destination.
  for (let z = 13; z <= 17; z++) {
    const [x, y] = tileOf(dest[0], dest[1], z), r = z < 16 ? 2 : 1;
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) add(z, x + dx, y + dy);
  }
  return [...keys].slice(0, cap).map((k) => k.split('/').map(Number) as [number, number, number]);
}

/** Download tiles for a trip; reports progress 0…1. Resolves with how many were saved. */
export async function saveTripOffline(pts: [number, number][], dest: [number, number], onProgress: (p: number) => void, street = false) {
  const tiles = tilesForTrip(pts, dest);
  const jobs: string[] = [];
  for (const [z, x, y] of tiles) {
    jobs.push(url(TILE_URLS.satellite, z, x, y), url(TILE_URLS.labels, z, x, y));
    if (street) jobs.push(url(TILE_URLS.street, z, x, y));
    if (z <= 11) jobs.push(url(TILE_URLS.dem, z, x, y));
  }
  let done = 0, ok = 0, next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const u = jobs[next++];
      try { const r = await fetch(u, { mode: 'cors' }); if (r.ok) ok++; } catch { /* skip a tile that fails */ }
      done++;
      if (done % 8 === 0 || done === jobs.length) onProgress(done / jobs.length);
    }
  };
  await Promise.all(Array.from({ length: 10 }, worker));
  return ok;
}

/** Register the service worker (production builds only — the dev server stays uncached). */
export function registerOffline() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  addEventListener('load', () => { navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined); });
}
