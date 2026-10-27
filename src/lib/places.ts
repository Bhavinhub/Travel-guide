import { DEPARTURE_CITIES, DESTINATIONS } from '../data/catalog';
import type { Destination } from '../data/types';
import { storage } from './store';

/**
 * Open-world search: any city, town, village, state, country, landmark or person.
 * Places come from Open-Meteo's geocoder (GeoNames data); people and topics from Wikipedia.
 * Everything is fetched live — nothing is invented.
 */

export interface PlaceHit {
  kind: 'place' | 'topic';
  name: string;
  region?: string;
  country?: string;
  lat?: number;
  lon?: number;
  /** Wikipedia article title for topics. */
  title?: string;
  detail?: string;
  thumb?: string;
  /** Came from a spelling suggestion (\"did you mean\"). */
  suggested?: boolean;
}

export interface WikiSummary {
  title: string;
  description?: string;
  extract: string;
  image?: string;
  imageW?: number;
  imageH?: number;
  page: string;
  lat?: number;
  lon?: number;
}

export interface NearbySpot { title: string; description?: string; lat: number; lon: number; dist: number; image?: string; page: string }

const WIKI = 'https://en.wikipedia.org';

export function placeHref(h: PlaceHit) {
  const q = new URLSearchParams();
  q.set('name', h.name);
  if (h.title) q.set('title', h.title);
  if (h.region) q.set('region', h.region);
  if (h.country) q.set('country', h.country);
  if (h.lat != null && h.lon != null) { q.set('lat', h.lat.toFixed(4)); q.set('lon', h.lon.toFixed(4)); }
  return `/place?${q.toString()}`;
}

export function kmBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export function nearestCurated(lat: number, lon: number, n = 3): { d: Destination; km: number }[] {
  return DESTINATIONS.map((d) => ({ d, km: kmBetween({ lat, lon }, d) })).sort((a, b) => a.km - b.km).slice(0, n);
}

async function getJSON<T>(url: string, signal?: AbortSignal): Promise<T> {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(String(r.status));
  return r.json() as Promise<T>;
}

/** Places (towns, cities, regions, countries) from the Open-Meteo geocoder. */
export async function geocode(q: string, signal?: AbortSignal): Promise<PlaceHit[]> {
  const j = await getJSON<{ results?: { name: string; latitude: number; longitude: number; country?: string; admin1?: string; feature_code?: string; population?: number }[] }>(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=en&format=json`, signal);
  const want = q.trim().toLowerCase();
  // Exact name matches first, then places in India (the site's home market), then by size.
  const rank = (r: { name: string; country?: string; population?: number; feature_code?: string }) =>
    (r.name.toLowerCase() === want ? 4 : 0) + (r.country === 'India' ? 2 : 0) + (r.feature_code?.startsWith('PCL') || r.feature_code?.startsWith('ADM1') ? 1 : 0) + Math.min(1, Math.log10((r.population ?? 0) + 1) / 8);
  return [...(j.results ?? [])].sort((a, b) => rank(b) - rank(a)).map((r) => ({
    kind: 'place' as const, name: r.name, region: r.admin1 !== r.name ? r.admin1 : undefined, country: r.country, lat: r.latitude, lon: r.longitude,
    detail: r.feature_code?.startsWith('PCL') ? 'Country' : r.feature_code?.startsWith('ADM1') ? 'State / region' : r.population ? `Population ${r.population.toLocaleString('en-IN')}` : 'Place',
  }));
}

interface GenPage { title: string; description?: string; index?: number; coordinates?: { lat: number; lon: number }[]; thumbnail?: { source: string } }

/** Wikipedia full-text search (people, temples, ashrams, landmarks…) with typo correction. */
export async function wikiSearch(q: string, signal?: AbortSignal): Promise<PlaceHit[]> {
  const run = async (term: string) => getJSON<{ query?: { pages?: Record<string, GenPage>; searchinfo?: { suggestion?: string } } }>(
    `${WIKI}/w/api.php?action=query&format=json&origin=*&list=search&srsearch=${encodeURIComponent(term)}&srinfo=suggestion&srlimit=1` +
    `&generator=search&gsrsearch=${encodeURIComponent(term)}&gsrlimit=6&prop=description|coordinates|pageimages&piprop=thumbnail&pithumbsize=160`, signal);
  const toHits = (pages: Record<string, GenPage> = {}) => Object.values(pages)
    .sort((x, y) => (x.index ?? 0) - (y.index ?? 0))
    .filter((p) => !/disambiguation/i.test(p.description ?? ''))
    .map((p): PlaceHit => ({
      kind: p.coordinates?.[0] ? 'place' : 'topic', name: p.title, title: p.title, detail: p.description, thumb: p.thumbnail?.source,
      lat: p.coordinates?.[0]?.lat, lon: p.coordinates?.[0]?.lon,
    }));
  // Exact and fuzzy ("Kanchi~ Dham~" also finds "Kainchi Dham") searches run together.
  const fuzzy = q.trim().split(/\s+/).filter((w) => w.length > 2).map((w) => `${w.replace(/[~"]/g, '')}~`).join(' ');
  const [j, f] = await Promise.all([run(q), fuzzy ? run(fuzzy).catch(() => null) : Promise.resolve(null)]);
  const all = [...toHits(j.query?.pages), ...toHits(f?.query?.pages)].filter((h, i, arr) => arr.findIndex((x) => x.title === h.title) === i);
  let hits = all
    .map((h, i) => ({ h, score: similarity(q, h.name) + (i < 3 ? 0.05 : 0) }))
    .sort((x, y) => y.score - x.score)
    .map(({ h }) => h);
  const best = hits[0];
  if (best && best.name.toLowerCase() !== q.trim().toLowerCase() && similarity(q, best.name) > 0.75) hits[0] = { ...best, suggested: true };
  const suggestion = j.query?.searchinfo?.suggestion;
  // Wikipedia's own "did you mean" when it has one.
  if (suggestion && suggestion.toLowerCase() !== q.trim().toLowerCase() && !hits.some((h) => h.name.toLowerCase() === suggestion.toLowerCase())) {
    const k = await run(suggestion).catch(() => null);
    const extra = toHits(k?.query?.pages).map((h) => ({ ...h, suggested: true }));
    hits = [...extra.slice(0, 2), ...hits.filter((h) => !extra.some((e) => e.title === h.title))];
  }
  return hits.slice(0, 8);
}

/** 0…1 closeness of two names (Levenshtein on lower-case letters), tolerant of small typos. */
function similarity(a: string, b: string) {
  const x = a.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim(), y = b.toLowerCase().replace(/\s*\(.*\)/, '').replace(/[^a-z0-9 ]/g, '').trim();
  if (!x || !y) return 0;
  if (x === y) return 1;
  const d: number[] = Array.from({ length: y.length + 1 }, (_, k) => k);
  for (let i = 1; i <= x.length; i++) {
    let prev = d[0]; d[0] = i;
    for (let k = 1; k <= y.length; k++) {
      const t = d[k];
      d[k] = Math.min(d[k] + 1, d[k - 1] + 1, prev + (x[i - 1] === y[k - 1] ? 0 : 1));
      prev = t;
    }
  }
  return 1 - d[y.length] / Math.max(x.length, y.length);
}

/** Wikipedia entries that are not places a traveller visits. */
const NOT_TOURISTY = /country in|state in|state of|union territory|district of|district in|newspaper|magazine|province|legislat|parliament|rajya sabha|lok sabha|ministry|government|court|college|school|university|institute|company|bank|hospital|office|constituency|railway|station|political party|district$|tehsil|census town|television|radio|cricket|stadium|police|cantonment|headquarters|embassy|airport|metro/i;
const SACRED_OR_SCENIC = /temple|ashram|mandir|shrine|math\b|monastery|gompa|mosque|dargah|gurudwara|church|cathedral|ghat|peak|lake|falls|fort|palace|hill|valley|national park|sanctuary|beach|town|city|village|pilgrim/i;

/** Places linked from an article that have coordinates — e.g. the ashrams and temples connected with a person —
 *  ranked by how often the article mentions them, preferring sacred and scenic places. */
export async function connectedPlaces(title: string, signal?: AbortSignal): Promise<NearbySpot[]> {
  try {
    const [links, text] = await Promise.all([
      getJSON<{ query?: { pages?: Record<string, GenPage> } }>(
        `${WIKI}/w/api.php?action=query&format=json&origin=*&generator=links&titles=${encodeURIComponent(title)}&gplnamespace=0&gpllimit=300&prop=coordinates|pageimages|description&piprop=thumbnail&pithumbsize=1280&colimit=300`, signal),
      getJSON<{ query?: { pages?: Record<string, { extract?: string }> } }>(
        `${WIKI}/w/api.php?action=query&format=json&origin=*&prop=extracts&explaintext=1&titles=${encodeURIComponent(title)}`, signal)
        .then((j) => Object.values(j.query?.pages ?? {})[0]?.extract ?? '').catch(() => ''),
    ]);
    const body = text.toLowerCase();
    const mentions = (t: string) => {
      const key = t.split(/[,(]/)[0].trim().toLowerCase();
      if (key.length < 3) return 0;
      let n = 0, i = body.indexOf(key);
      while (i !== -1 && n < 20) { n++; i = body.indexOf(key, i + key.length); }
      return n;
    };
    return Object.values(links.query?.pages ?? {})
      .filter((p) => p.coordinates?.[0] && !NOT_TOURISTY.test(`${p.title} ${p.description ?? ''}`))
      .map((p) => ({ p, score: mentions(p.title) * 2 + (SACRED_OR_SCENIC.test(`${p.title} ${p.description ?? ''}`) ? 3 : 0) + (p.thumbnail ? 1 : 0) }))
      .filter((x) => x.score >= 3)
      .sort((a, b) => b.score - a.score)
      .slice(0, 9)
      .map(({ p }) => ({ title: p.title, description: p.description, lat: p.coordinates![0].lat, lon: p.coordinates![0].lon, image: p.thumbnail?.source, page: `${WIKI}/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}`, dist: 0 }));
  } catch {
    return [];
  }
}

/** Combined live search; tolerant of one source failing. */
export async function searchAnywhere(q: string, signal?: AbortSignal): Promise<PlaceHit[]> {
  const [places, topics] = await Promise.allSettled([geocode(q, signal), wikiSearch(q, signal)]);
  const seen = new Set<string>();
  const p = (places.status === 'fulfilled' ? places.value : []).filter((x) => {
    const k = `${x.name}|${x.region}|${x.country}`.toLowerCase();
    return !seen.has(k) && seen.add(k);
  }).slice(0, 5);
  const t = topics.status === 'fulfilled' ? topics.value : [];
  // Drop topics that duplicate a place already listed.
  const names = new Set(p.map((x) => x.name.toLowerCase()));
  return [...p, ...t.filter((x) => !names.has(x.name.toLowerCase().split(',')[0]))].slice(0, 8);
}

export async function wikiSummary(title: string, signal?: AbortSignal): Promise<WikiSummary | null> {
  try {
    const j = await getJSON<{ type: string; title: string; description?: string; extract: string; originalimage?: { source: string; width: number; height: number }; thumbnail?: { source: string }; content_urls?: { desktop: { page: string } }; coordinates?: { lat: number; lon: number } }>(
      `${WIKI}/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`, signal);
    if (j.type === 'disambiguation' || !j.extract) return null;
    // Use a large (up to 3840px) rendition of the lead image rather than the original file.
    const orig = j.originalimage;
    let image = orig?.source;
    if (orig && orig.width > 2400 && /\/commons\//.test(orig.source) && !/\.svg$/i.test(orig.source)) {
      const m = orig.source.match(/\/commons\/(.\/..)\/([^/]+)$/);
      if (m) image = `https://upload.wikimedia.org/wikipedia/commons/thumb/${m[1]}/${m[2]}/${orig.width >= 3840 ? 3840 : 1920}px-${m[2]}`;
    }
    return {
      title: j.title, description: j.description, extract: j.extract, image, imageW: orig?.width, imageH: orig?.height,
      page: j.content_urls?.desktop.page ?? `${WIKI}/wiki/${encodeURIComponent(j.title)}`, lat: j.coordinates?.lat, lon: j.coordinates?.lon,
    };
  } catch {
    return null;
  }
}

/** The Wikipedia article for a geocoded place: try "Name", then "Name, Region", then "Name, Country". */
export async function placeSummary(h: PlaceHit, signal?: AbortSignal): Promise<WikiSummary | null> {
  if (h.title) return wikiSummary(h.title, signal);
  const tries = [h.name, h.region && `${h.name}, ${h.region}`, h.country && `${h.name}, ${h.country}`, h.region && `${h.name} district`].filter(Boolean) as string[];
  for (const t of tries) {
    const s = await wikiSummary(t, signal);
    if (!s) continue;
    if (h.lat == null || s.lat == null || kmBetween({ lat: h.lat, lon: h.lon! }, { lat: s.lat, lon: s.lon! }) < 120) return s;
  }
  return null;
}

/** Notable spots near a point, with photos, from Wikipedia's geosearch. */
export async function nearbySpots(lat: number, lon: number, signal?: AbortSignal): Promise<NearbySpot[]> {
  try {
    const j = await getJSON<{ query?: { pages: Record<string, { title: string; description?: string; coordinates?: { lat: number; lon: number }[]; thumbnail?: { source: string }; index: number }> } }>(
      `${WIKI}/w/api.php?action=query&format=json&origin=*&generator=geosearch&ggscoord=${lat}|${lon}&ggsradius=10000&ggslimit=40&prop=coordinates|pageimages|description&piprop=thumbnail&pithumbsize=1280`, signal);
    const pages = Object.values(j.query?.pages ?? {});
    return pages
      .filter((p) => p.coordinates?.[0])
      .map((p) => ({ title: p.title, description: p.description, lat: p.coordinates![0].lat, lon: p.coordinates![0].lon, image: p.thumbnail?.source, page: `${WIKI}/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}`, dist: kmBetween({ lat, lon }, p.coordinates![0]) }))
      // Prefer spots that have a photo and are not administrative entries.
      .filter((p) => !/^List of/.test(p.title) && !NOT_TOURISTY.test(`${p.title} ${p.description ?? ''}`))
      .sort((a, b) => Number(!!b.image) - Number(!!a.image) || a.dist - b.dist)
      .slice(0, 12);
  } catch {
    return [];
  }
}

/* ───────── Search history (this device only) ───────── */

export interface RecentSearch { label: string; sub?: string; to: string; at: number }
const KEY = 'tg.recentSearches';
export const recentSearches = () => storage.get<RecentSearch[]>(KEY, []);
export function rememberSearch(r: Omit<RecentSearch, 'at'>) {
  const list = recentSearches().filter((x) => x.to !== r.to);
  storage.set(KEY, [{ ...r, at: Date.now() }, ...list].slice(0, 8));
}
export const clearSearches = () => storage.set(KEY, []);

/** Nearest major departure city (Indian cities for places in India). */
export function nearestCity(lat: number, lon: number, country?: string) {
  const pool = DEPARTURE_CITIES.filter((c) => (country === 'India' ? c.country === 'India' : true) && kmBetween(c, { lat, lon }) > 25);
  return pool.reduce((b, c) => (kmBetween(c, { lat, lon }) < kmBetween(b, { lat, lon }) ? c : b), pool[0]);
}
