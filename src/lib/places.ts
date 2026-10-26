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

/** Wikipedia titles (people, landmarks, anything) for the query. */
export async function wikiSearch(q: string, signal?: AbortSignal): Promise<PlaceHit[]> {
  const j = await getJSON<{ pages: { title: string; description?: string }[] }>(
    `${WIKI}/w/rest.php/v1/search/title?q=${encodeURIComponent(q)}&limit=5`, signal);
  return (j.pages ?? []).map((p) => ({ kind: 'topic' as const, name: p.title, title: p.title, detail: p.description }));
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
      `${WIKI}/w/api.php?action=query&format=json&origin=*&generator=geosearch&ggscoord=${lat}|${lon}&ggsradius=10000&ggslimit=40&prop=coordinates|pageimages|description&piprop=thumbnail&pithumbsize=960`, signal);
    const pages = Object.values(j.query?.pages ?? {});
    return pages
      .filter((p) => p.coordinates?.[0])
      .map((p) => ({ title: p.title, description: p.description, lat: p.coordinates![0].lat, lon: p.coordinates![0].lon, image: p.thumbnail?.source, page: `${WIKI}/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}`, dist: kmBetween({ lat, lon }, p.coordinates![0]) }))
      // Prefer spots that have a photo and are not administrative entries.
      .filter((p) => !/^(List of|.* \(Vidhan Sabha constituency\)|.* \(Lok Sabha constituency\))/.test(p.title) && !/constituency|railway station|district$/i.test(p.description ?? ''))
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
