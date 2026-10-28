import maplibregl, { type Map as MLMap, type Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import { DESTINATIONS, searchDestinations } from '../data/catalog';
import { localImages, srcOf } from '../lib/localMedia';
import { geocode, nearbySpots, placeHref, SACRED_OR_SCENIC, SCENIC_STOP, type NearbySpot } from '../lib/places';
import { href, navigate } from '../lib/router';
import { prefetchArrival, prefetchCorridor, saveTripOffline } from '../lib/offlineMap';
import { nearestAirport, type Airport } from '../data/airports';
import { useMotion } from '../lib/store';

/**
 * Scroll-controlled 3D Earth journey.
 * The scene opens on the whole planet (a real globe with atmosphere). Scrolling down dollies the
 * camera in: the route from the starting city is drawn, the camera tilts and follows the road
 * (or flight arc) over 3D terrain, scenic stops pop up as postcards, and it lands on the place.
 * Scrolling up dollies back out to the globe. Tap the pin or "Play journey" to watch it on its own;
 * "Explore map" frees the camera (drag, zoom, rotate, tilt).
 * Imagery: Esri World Imagery · Street map: OpenStreetMap · Elevation: AWS Terrain Tiles · Routes: OSRM.
 */
export interface MapSpot { name: string; lat: number; lon: number; href?: string }
export interface MapOrigin { name: string; lat: number; lon: number }

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const esc = (s: string) => s.replace(/[<>&"]/g, '');

function kmBetween(a: [number, number], b: [number, number]) {
  const r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
}

/** Great-circle arc for flights. */
function arc(a: [number, number], b: [number, number], n = 96): [number, number][] {
  const r = Math.PI / 180;
  const [p1, l1, p2, l2] = [a[0] * r, a[1] * r, b[0] * r, b[1] * r];
  const d = 2 * Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2));
  if (d === 0) return [a, b];
  return Array.from({ length: n + 1 }, (_, i) => {
    const f = i / n, A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
    const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
    const z = A * Math.sin(p1) + B * Math.sin(p2);
    return [Math.atan2(z, Math.hypot(x, y)) / r, Math.atan2(y, x) / r] as [number, number];
  });
}

/* MapLibre checks whether each marker is hidden behind 3D terrain by reading GPU depth pixels
   (10 times a second per marker). With dozens of photo markers that stalls the GPU, floods the console
   with readback warnings and makes the flight stutter. Markers here only need hiding on the far side
   of the globe, which is cheap to test. */
type MarkerInternals = { _map: MLMap; _lngLat: maplibregl.LngLat; _element: HTMLElement; _opacity: string; _opacityWhenCovered: string };
(maplibregl.Marker.prototype as unknown as { _updateOpacity: () => void })._updateOpacity = function (this: MarkerInternals) {
  if (!this._map) return;
  const covered = this._map.transform.isLocationOccluded(this._lngLat);
  const target = covered ? this._opacityWhenCovered : this._opacity;
  if (this._element.style.opacity !== target) { this._element.style.opacity = target; this._element.classList.toggle('maplibregl-marker-covered', covered); }
};

/** Wikimedia photos at a size that suits where they're shown (markers are tiny; 1280px ones took ~8 s). */
const thumbAt = (url: string | undefined, w: 250 | 500) => (url ?? '').replace(/\/\d+px-/, `/${w}px-`);
/** A marker photo that fails to load shows a pin instead of an empty ring. */
const markerImg = (url: string | undefined) => `<img src="${esc(thumbAt(url, 250))}" alt="" referrerpolicy="no-referrer">`;
const guardImg = (d: HTMLElement) => {
  const img = d.querySelector('img');
  const fail = () => img?.replaceWith(Object.assign(document.createElement('i'), { className: 'map-noimg', textContent: '📍' }));
  if (!img || !img.getAttribute('src')) fail(); else img.addEventListener('error', fail, { once: true });
};

/** The device's position, named by its town (OpenStreetMap Nominatim reverse geocoding). */
async function currentPlace(): Promise<MapOrigin> {
  const pos = await new Promise<GeolocationPosition>((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 }));
  const { latitude: lat, longitude: lon } = pos.coords;
  let name = 'My location';
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=10&accept-language=en`);
    const a = (await r.json())?.address ?? {};
    name = a.city || a.town || a.village || a.municipality || a.county || a.state_district || a.state || name;
  } catch { /* keep the generic name */ }
  return { name, lat, lon };
}

/** How the visitor travels: the route, the time and the icon moving on the map follow it. */
export type Travel = 'auto' | 'car' | 'bike' | 'train' | 'flight' | 'walk';
const VEHICLE: Record<Exclude<Travel, 'auto'>, { icon: string; label: string }> = {
  car: { icon: '🚗', label: 'Car' }, bike: { icon: '🚲', label: 'Bike' }, train: { icon: '🚆', label: 'Train' },
  flight: { icon: '✈️', label: 'Flight' }, walk: { icon: '🚶', label: 'On foot' },
};

/** One stretch of a journey travelled one way (e.g. fly Delhi → Dehradun, then drive to Rishikesh). */
interface Leg { travel: Exclude<Travel, 'auto'>; from: number; to: number; km: number; hours: number; title?: string }

interface Route {
  pts: [number, number][]; cum: number[]; mode: 'road' | 'air'; km: number; hours?: number;
  /** What actually travels this route (the moving icon and the label). */
  travel?: Exclude<Travel, 'auto'>;
  /** Shown when the chosen way of travel isn't possible and another was used, or the line is approximate. */
  note?: string;
  /** Where the road ends and a footpath continues (index into pts), e.g. the Kedarnath trek. */
  walkFrom?: number; walkKm?: number; walkHours?: number;
  /** The journey's stretches in order; a single-mode trip has one (plus a walk when the road stops short). */
  legs?: Leg[];
}

function buildRoute(pts: [number, number][], mode: Route['mode'], km?: number, hours?: number): Route {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + kmBetween(pts[i - 1], pts[i]));
  return { pts, cum, mode, km: km ?? cum[cum.length - 1], hours };
}

/** The legs of a route (older single-mode routes get them derived). */
function legsOf(r: Route): Leg[] {
  if (r.legs?.length) return r.legs;
  const last = r.pts.length - 1, t = r.travel ?? (r.mode === 'air' ? 'flight' : 'car');
  if (r.walkFrom === undefined) return [{ travel: t, from: 0, to: last, km: r.km, hours: r.hours ?? 0 }];
  return [{ travel: t, from: 0, to: r.walkFrom, km: r.km - (r.walkKm ?? 0), hours: r.hours ?? 0 }, { travel: 'walk', from: r.walkFrom, to: last, km: r.walkKm ?? 0, hours: r.walkHours ?? 0 }];
}

/**
 * Travel progress → distance progress, leg by leg: every leg gets a fair share of the playback (a long flight
 * doesn't swallow the drive after it), walking gets extra time so the walker visibly moves slower, flights less.
 */
function travelToDistance(r: Route, t: number) {
  const legs = legsOf(r), total = r.cum[r.cum.length - 1] || 1;
  const pace = { walk: 2.2, bike: 1.3, car: 1, train: 1, flight: 0.55 } as const;
  const raw = legs.map((l) => Math.sqrt(Math.max(0.5, r.cum[l.to] - r.cum[l.from])) * pace[l.travel]);
  const sum = raw.reduce((x, y) => x + y, 0) || 1;
  let w = raw.map((x) => Math.max(0.12, x / sum));
  const s2 = w.reduce((x, y) => x + y, 0); w = w.map((x) => x / s2);
  let acc = 0;
  for (let k = 0; k < legs.length; k++) {
    if (t <= acc + w[k] || k === legs.length - 1) {
      const local = clamp((t - acc) / (w[k] || 1)), l = legs[k];
      return (r.cum[l.from] + (r.cum[l.to] - r.cum[l.from]) * local) / total;
    }
    acc += w[k];
  }
  return clamp(t);
}
/** The leg being travelled at a distance fraction. */
function legAt(r: Route, distFrac: number): Leg {
  const legs = legsOf(r), d = distFrac * (r.cum[r.cum.length - 1] || 1);
  return legs.find((l) => d <= r.cum[l.to] + 1e-6) ?? legs[legs.length - 1];
}
const isWalking = (r: Route, distFrac: number) => legAt(r, distFrac).travel === 'walk';

/** Point and index at fraction t of the route length (binary search: routes have thousands of points). */
function along(r: Route, t: number): { p: [number, number]; i: number; f: number } {
  const total = r.cum[r.cum.length - 1], want = clamp(t) * total;
  let lo = 1, hi = r.cum.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (r.cum[mid] < want) lo = mid + 1; else hi = mid; }
  const i = lo, seg = r.cum[i] - r.cum[i - 1] || 1, f = clamp((want - r.cum[i - 1]) / seg);
  return { p: [lerp(r.pts[i - 1][0], r.pts[i][0], f), lerp(r.pts[i - 1][1], r.pts[i][1], f)], i, f };
}

/** Cumulative length in Web-Mercator units — the same measure MapLibre's `line-progress` uses. */
function mercatorCum(pts: [number, number][]) {
  const mx = (lon: number) => lon / 360, my = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (clamp(lat / 85, -1, 1) * 85 * Math.PI) / 360)) / (2 * Math.PI);
  const out = [0];
  for (let k = 1; k < pts.length; k++) out.push(out[k - 1] + Math.hypot(mx(pts[k][1]) - mx(pts[k - 1][1]), my(pts[k][0]) - my(pts[k - 1][0])));
  return out;
}
/** The gold "travelled" line: the whole route drawn once, revealed up to `t` by a gradient (no re-upload). */
const doneGradient = (t: number) => ['step', ['line-progress'], t <= 0 ? 'rgba(244,184,96,0)' : '#f4b860', clamp(t, 0.0001, 0.9999), t >= 1 ? '#f4b860' : 'rgba(244,184,96,0)'];

const toPts = (coords: [number, number][]) => coords.map(([lo, la]) => [la, lo] as [number, number]);
const thin = (all: [number, number][]) => { const step = Math.max(1, Math.ceil(all.length / 700)); return all.filter((_, i) => i % step === 0 || i === all.length - 1); };
async function osrm(profile: 'car' | 'bike' | 'foot', a: [number, number], b: [number, number], signal: AbortSignal) {
  const url = profile === 'car'
    ? `https://router.project-osrm.org/route/v1/driving/${a[1]},${a[0]};${b[1]},${b[0]}?overview=full&geometries=geojson`
    : `https://routing.openstreetmap.de/routed-${profile}/route/v1/driving/${a[1]},${a[0]};${b[1]},${b[0]}?overview=full&geometries=geojson`;
  const j = await fetch(url, { signal }).then((x) => x.json());
  const g = j.routes?.[0];
  return g?.geometry?.coordinates?.length > 1 ? { pts: thin(toPts(g.geometry.coordinates)), km: g.distance / 1000, hours: g.duration / 3600 } : null;
}

const hmText = (h = 0) => { const H = Math.floor(h), M = Math.round((h % 1) * 60); return H ? `${H} h${M ? ` ${M} min` : ''}` : `${M} min`; };

/** Road / bike / foot / train route, with a walk at the end when the road stops short of the place. */
async function groundRoute(want: 'car' | 'bike' | 'walk' | 'train', a: [number, number], to: [number, number], signal: AbortSignal, note?: string): Promise<Route | null> {
  const crow = kmBetween(a, to);
  const profile = want === 'walk' ? 'foot' : want === 'bike' ? 'bike' : 'car';
  const g = await osrm(profile, a, to, signal).catch(() => null);
  if (!g || g.km > crow * 2.2 + 40) return null;
  // Trains: no open rail routing exists — follow the main road corridor and use typical train timing.
  const hours = want === 'train' ? g.km / 55 + 0.5 : g.hours;
  if (want === 'train') note = note ?? 'Approximate line along the main corridor';
  const end = g.pts[g.pts.length - 1], gap = kmBetween(end, to);
  if (want !== 'walk' && gap > 0.6 && gap < 40) {
    const w = await osrm('foot', end, to, signal).catch(() => null);
    const walk = w?.pts ?? [end, to];
    const route = buildRoute([...g.pts, ...walk.slice(1)], 'road', g.km + (w ? w.km : gap), hours);
    return { ...route, travel: want, note, walkFrom: g.pts.length - 1, walkKm: w ? w.km : gap, walkHours: w ? w.hours : gap / 4 };
  }
  return { ...buildRoute(g.pts, 'road', g.km, hours), travel: want, note };
}

/** Fly between the airports nearest each end, with the drive to the airport and onwards from it. */
async function flyRoute(a: [number, number], to: [number, number], A: Airport & { km: number }, B: Airport & { km: number }, signal: AbortSignal, note?: string, names: { from?: string; to?: string } = {}): Promise<Route> {
  const legs: Leg[] = [];
  const Ap: [number, number] = [A.lat, A.lon], Bp: [number, number] = [B.lat, B.lon];
  let pts: [number, number][] = [a];
  if (A.km >= 20) {
    const g = await osrm('car', a, Ap, signal).catch(() => null);
    pts = g?.pts ?? [a, Ap];
    legs.push({ travel: 'car', from: 0, to: pts.length - 1, km: g?.km ?? A.km, hours: g?.hours ?? A.km / 40, title: `${names.from ?? 'Start'} → ${A.code} airport` });
  }
  const f0 = pts.length - 1, fkm = kmBetween(Ap, Bp);
  pts = [...pts, ...arc(pts[f0], Bp).slice(1)];
  legs.push({ travel: 'flight', from: f0, to: pts.length - 1, km: fkm, hours: fkm / 700 + 0.6, title: `Flight ${A.code} → ${B.code}` });
  let walkFrom: number | undefined, walkKm: number | undefined, walkHours: number | undefined;
  if (kmBetween(Bp, to) > 2) {
    const g = await osrm('car', Bp, to, signal).catch(() => null);
    const p = g?.pts ?? [Bp, to], s0 = pts.length - 1;
    pts = [...pts, ...p.slice(1)];
    legs.push({ travel: 'car', from: s0, to: pts.length - 1, km: g?.km ?? B.km, hours: g?.hours ?? B.km / 40, title: `${B.code} airport → ${names.to ?? 'destination'}` });
    const end = pts[pts.length - 1], gap = kmBetween(end, to);
    if (gap > 0.6 && gap < 40) {
      const w = await osrm('foot', end, to, signal).catch(() => null);
      const wp = w?.pts ?? [end, to], s1 = pts.length - 1;
      pts = [...pts, ...wp.slice(1)];
      walkFrom = s1; walkKm = w?.km ?? gap; walkHours = w?.hours ?? gap / 4;
      legs.push({ travel: 'walk', from: s1, to: pts.length - 1, km: walkKm, hours: walkHours });
    }
  }
  const km = legs.reduce((x, l) => x + l.km, 0), hours = legs.reduce((x, l) => x + l.hours, 0) + 1.25; // + check-in & boarding
  return { ...buildRoute(pts, 'road', km, hours), travel: 'flight', note, legs, walkFrom, walkKm, walkHours };
}

/**
 * The journey for a way of travel. "Auto" compares door-to-door times and picks the best: e.g. Delhi → Rishikesh
 * flies Delhi → Dehradun (Jolly Grant) and drives the last stretch, while Bengaluru → Coorg simply drives.
 */
async function fetchRoute(from: MapOrigin, to: [number, number], signal: AbortSignal, travel: Travel = 'auto', toName?: string): Promise<Route> {
  const a: [number, number] = [from.lat, from.lon];
  const crow = kmBetween(a, to);
  const arcOnly = (note?: string): Route => ({ ...buildRoute(arc(a, to), 'air', crow, crow / 750 + 1.5), travel: 'flight', note });
  const A = nearestAirport(a, 120), B = nearestAirport(to, 160);
  const canFly = !!(A && B && A.code !== B.code && kmBetween([A.lat, A.lon], [B.lat, B.lon]) >= 150);
  if (travel === 'flight') return canFly ? flyRoute(a, to, A!, B!, signal, undefined, { from: from.name, to: toName }) : arcOnly(crow < 150 ? 'Too short for a flight — shown as a direct line' : undefined);
  if (travel === 'auto') {
    const road = crow < 1800 ? await groundRoute('car', a, to, signal) : null;
    if (canFly) {
      const fkm = kmBetween([A!.lat, A!.lon], [B!.lat, B!.lon]);
      const flyHours = A!.km / 40 + 1.25 + fkm / 700 + 0.6 + B!.km / 40;
      const roadHours = road?.hours ?? Infinity;
      if (!road || roadHours > flyHours * 1.15) {
        // The straight-line estimate can't see mountain roads: compare the real door-to-door times, treks included.
        const fly = await flyRoute(a, to, A!, B!, signal, undefined, { from: from.name, to: toName });
        const roadTotal = roadHours + (road?.walkHours ?? 0), flyTotal = fly.hours ?? Infinity;
        if (!road || roadTotal > flyTotal * 1.15) return { ...fly, note: road ? `Best way · by road it takes about ${hmText(roadTotal)}` : undefined };
      }
    }
    if (road) return road;
    return arcOnly();
  }
  // Walking or cycling a very long way isn't realistic — use the road instead and say so.
  let want: 'car' | 'bike' | 'walk' | 'train' = travel;
  let note: string | undefined;
  if (want === 'walk' && crow > 150) { want = 'car'; note = 'Too far to walk — shown by road'; }
  if (want === 'bike' && crow > 600) { want = 'car'; note = 'Too far to cycle — shown by road'; }
  if (want !== 'train' && crow > 2500) return canFly ? flyRoute(a, to, A!, B!, signal, 'Too far overland — shown as a flight', { from: from.name, to: toName }) : arcOnly('Too far overland — shown as a flight');
  const g = await groundRoute(want, a, to, signal, note);
  if (g) return g;
  return canFly ? flyRoute(a, to, A!, B!, signal, 'No route found — shown as a flight', { from: from.name, to: toName }) : arcOnly('No route found — shown as a flight');
}

export interface RouteStop extends NearbySpot { frac: number; kmFromStart: number }

/** Beautiful places along the way: sample the route and pick the most scenic photographed spot near each sample. */
async function scenicStops(r: Route, from: MapOrigin, to: [number, number], signal: AbortSignal): Promise<RouteStop[]> {
  const total = r.cum[r.cum.length - 1];
  const samples = (r.mode === 'air' ? [] : [0.1, 0.19, 0.28, 0.37, 0.46, 0.55, 0.64, 0.73, 0.82, 0.91].filter((f) => legAt(r, f).travel !== 'flight')).map((f) => along(r, f).p);
  const found = await Promise.all(samples.map((p) => nearbySpots(p[0], p[1], signal).catch(() => [] as NearbySpot[])));
  const out: RouteStop[] = [];
  found.forEach((list) => {
    // Only real sights with a photo: temples, lakes, rivers, falls, forts, viewpoints…
    const pick = list.find((s) => s.image && SCENIC_STOP.test(`${s.title} ${s.description ?? ''}`));
    if (!pick || out.some((o) => o.title === pick.title)) return;
    if (kmBetween([pick.lat, pick.lon], [from.lat, from.lon]) < 20 || kmBetween([pick.lat, pick.lon], to) < 4) return;
    // Where on the route this stop sits.
    let best = 0, bd = Infinity;
    r.pts.forEach((q, i) => { const d = kmBetween(q, [pick.lat, pick.lon]); if (d < bd) { bd = d; best = i; } });
    out.push({ ...pick, frac: r.cum[best] / total, kmFromStart: Math.round(r.cum[best]) });
  });
  return out.sort((a, b) => a.frac - b.frac);
}

/** Place picker for the map's From / To boxes: curated destinations first, then any place on Earth. */
function PlaceInput({ label, value, onPick }: { label: string; value: string; onPick: (p: MapOrigin) => void }) {
  const [q, setQ] = useState(value);
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<(MapOrigin & { sub?: string })[]>([]);
  useEffect(() => setQ(value), [value]);
  useEffect(() => {
    const term = q.trim();
    if (!open || term.length < 2 || term === value) { setList([]); return; }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      const curated = searchDestinations(term).slice(0, 3).map((d) => ({ name: d.name, lat: d.lat, lon: d.lon, sub: d.state ?? d.country }));
      setList(curated);
      geocode(term, ctl.signal).then((g) => !ctl.signal.aborted && setList([...curated, ...g.filter((x) => !curated.some((c) => c.name === x.name)).slice(0, 5).map((x) => ({ name: x.name, lat: x.lat!, lon: x.lon!, sub: [x.region, x.country].filter(Boolean).join(', ') }))])).catch(() => undefined);
    }, 180);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q, open, value]);
  const items = list;
  const pick = (p: MapOrigin & { sub?: string }) => { setQ(p.name); setOpen(false); onPick({ name: p.name, lat: p.lat, lon: p.lon }); };
  return (
    <label className="mf-field" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) { setOpen(false); setQ(value); } }}>
      <span className="tiny muted">{label}</span>
      <input className="input" aria-label={label} value={q} placeholder="Any city or place" onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={(e) => { e.currentTarget.select(); setOpen(true); }}
        onKeyDown={(e) => { if (e.key === 'Enter' && items[0]) { e.preventDefault(); pick(items[0]); } if (e.key === 'Escape') setOpen(false); }} />
      {open && items.length > 0 && (
        <span className="mf-list" role="listbox" onMouseDown={(e) => e.preventDefault()}>
          {items.map((p, i) => <button type="button" key={`${p.name}-${i}`} role="option" aria-selected={false} aria-label={`${p.name}${p.sub ? `, ${p.sub}` : ''}`} onClick={() => pick(p)}><b>{p.name}</b>{p.sub && <span className="tiny muted"> {p.sub}</span>}</button>)}
        </span>
      )}
    </label>
  );
}

export function MapFlyIn({ lat: pLat, lon: pLon, name: pName, zoomTo = 16, from: pFrom }: { lat: number; lon: number; name: string; spots?: MapSpot[]; zoomTo?: number; from?: MapOrigin }) {
  // Visitors can pick their own From / To; otherwise the page's place and nearest city are used.
  const [custom, setCustom] = useState<{ from?: MapOrigin; to?: MapOrigin }>({});
  useEffect(() => setCustom({}), [pLat, pLon]);
  const lat = custom.to?.lat ?? pLat, lon = custom.to?.lon ?? pLon, name = custom.to?.name ?? pName;
  const from = custom.from ?? pFrom;
  const autoplay = useRef(false);
  // Only build the 3D Earth when the visitor gets close to it (keeps pages fast), then fade it in once drawn.
  const [near, setNear] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [tour, setTour] = useState<NearbySpot[]>([]);
  const sec = useRef<HTMLElement>(null);
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const ready = useRef(false);
  const mover = useRef<Marker | null>(null);
  const spotMarkers = useRef<Marker[]>([]);
  const routeRef = useRef<{ r: Route; fit: { center: [number, number]; zoom: number }; mc: number[] } | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [stops, setStops] = useState<RouteStop[]>([]);
  const stopsRef = useRef<RouteStop[]>([]);
  const [card, setCard] = useState(-1);
  const cardRef = useRef(-1);
  const [mode, setMode] = useState<'satellite' | 'street'>('satellite');
  const [travel, setTravel] = useState<Travel>('auto');
  const [free, setFree] = useState(false);
  const freeRef = useRef(false);
  freeRef.current = free;
  const [playing, setPlaying] = useState(false);
  const arriveZoom = Math.min(zoomTo - 1, 14.4); // the landed view: the place with its town around it
  const playRef = useRef(false);
  const { reduced } = useMotion();
  const fromKey = from ? `${from.name}|${from.lat},${from.lon}` : '';
  const kick = useRef<() => void>(() => undefined);
  const terrainOn = useRef(false);
  const restingRef = useRef(false);
  const nearStop = useRef(false);
  const held = useRef<number | null>(null);
  const padRef = useRef<() => void>(() => undefined);
  const perf = useRef({ last: 0, sum: 0, n: 0, ratio: Math.min(window.devicePixelRatio || 1, 1.25) });
  const restTimer = useRef(0);
  /** Turn 3D terrain on after the camera has rested close to the ground for a moment. */
  const settle = (atGround: boolean) => {
    clearTimeout(restTimer.current);
    restingRef.current = false;
    if (!atGround) return;
    restTimer.current = window.setTimeout(() => {
      const m = map.current;
      if (!m || !ready.current) return;
      restingRef.current = true;
      if (!terrainOn.current) { terrainOn.current = true; m.setTerrain({ source: 'dem', exaggeration: 1.3 }); }
    }, 450);
  };
  const doneState = useRef({ n: -1, t: 0 });

  // While the map fills the screen, the page's animated photo backdrop and cursor dust pause, so all
  // of the device's power goes to the map.
  useEffect(() => {
    const st = stickyRef.current;
    if (!st) return;
    const io = new IntersectionObserver(([e]) => {
      document.documentElement.classList.toggle('map-in-view', e.intersectionRatio > 0.55);
      if (e.intersectionRatio <= 0.55) window.dispatchEvent(new Event('scroll'));
    }, { threshold: [0, 0.55, 1] });
    io.observe(st);
    return () => { io.disconnect(); document.documentElement.classList.remove('map-in-view'); };
  }, []);

  useEffect(() => {
    const s = sec.current;
    if (!s) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setNear(true); io.disconnect(); } }, { rootMargin: '900px 0px' });
    io.observe(s);
    return () => io.disconnect();
  }, []);

  // ── Create the globe ──
  useEffect(() => {
    if (!near) return;
    setLoaded(false);
    const m = new maplibregl.Map({
      container: el.current!,
      center: [lon, lat],
      zoom: reduced ? arriveZoom : globeZoom(),
      pitch: 0,
      maxPitch: 80,
      pixelRatio: Math.min(window.devicePixelRatio || 1, 1.25),
      fadeDuration: 0,
      // The flight changes zoom every frame: never cancel tile requests mid-zoom (that left dark,
      // unloaded patches), and keep more tiles cached so earlier views stay sharp behind the camera.
      cancelPendingTileRequestsWhileZooming: false,
      maxTileCacheZoomLevels: 8,
      attributionControl: { compact: true },
      interactive: true,
      style: {
        version: 8,
        projection: { type: 'globe' },
        sources: {
          base: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 7 },
          satellite: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 18, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' },
          labels: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 18 },
          street: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19, attribution: '© OpenStreetMap contributors' },
          // Names on the ground — cafés, restaurants, sights, streets, neighbourhoods (OpenStreetMap via OpenFreeMap).
          names: { type: 'vector', url: 'https://tiles.openfreemap.org/planet', attribution: '© OpenStreetMap contributors' },
          dem: { type: 'raster-dem', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], encoding: 'terrarium', tileSize: 256, maxzoom: 11, attribution: 'Elevation: AWS Terrain Tiles' },
          route: { type: 'geojson', lineMetrics: true, data: { type: 'FeatureCollection', features: [] } },
          walk: { type: 'geojson', lineMetrics: true, data: { type: 'FeatureCollection', features: [] } },
        },
        glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
        layers: [
          { id: 'base', type: 'raster', source: 'base' }, // coarse imagery under the sharp layer: no holes while tiles stream in
          { id: 'satellite', type: 'raster', source: 'satellite' },
          { id: 'street', type: 'raster', source: 'street', layout: { visibility: 'none' } },
          { id: 'labels', type: 'raster', source: 'labels' },
          { id: 'area-names', type: 'symbol', source: 'names', 'source-layer': 'place', minzoom: 11.5,
            filter: ['in', ['get', 'class'], ['literal', ['suburb', 'neighbourhood', 'quarter', 'village', 'hamlet', 'locality']]],
            layout: { 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name_en'], ['get', 'name']] as maplibregl.ExpressionSpecification, 'text-font': ['Noto Sans Bold'], 'text-size': 12.5, 'text-letter-spacing': 0.04, 'text-max-width': 9 },
            paint: { 'text-color': '#fdf6e3', 'text-halo-color': 'rgba(0,0,0,.85)', 'text-halo-width': 1.6 } },
          { id: 'street-names', type: 'symbol', source: 'names', 'source-layer': 'transportation_name', minzoom: 14,
            layout: { 'symbol-placement': 'line', 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name_en'], ['get', 'name']] as maplibregl.ExpressionSpecification, 'text-font': ['Noto Sans Regular'], 'text-size': 11 },
            paint: { 'text-color': '#f1efe6', 'text-halo-color': 'rgba(0,0,0,.8)', 'text-halo-width': 1.3 } },
          { id: 'poi-dots', type: 'circle', source: 'names', 'source-layer': 'poi', minzoom: 13.5, filter: ['has', 'name'],
            paint: { 'circle-radius': 3.2, 'circle-stroke-width': 1.2, 'circle-stroke-color': '#fff',
              'circle-color': ['match', ['get', 'class'], ['cafe', 'restaurant', 'fast_food', 'bar', 'beer', 'ice_cream'], '#f59e42', ['lodging'], '#5aa7ff', ['place_of_worship', 'attraction', 'museum', 'monument', 'castle'], '#f4c84a', ['park', 'garden'], '#5fd18b', '#e7e7e7'] } },
          { id: 'poi-names', type: 'symbol', source: 'names', 'source-layer': 'poi', minzoom: 13.5, filter: ['has', 'name'],
            layout: { 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name_en'], ['get', 'name']] as maplibregl.ExpressionSpecification, 'text-font': ['Noto Sans Regular'], 'text-size': 11.5,
              'text-anchor': 'top', 'text-offset': [0, 0.55], 'text-max-width': 8, 'symbol-sort-key': ['get', 'rank'] },
            paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,.85)', 'text-halo-width': 1.4 } },
          { id: 'route-glow', type: 'line', source: 'route', paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.25, 'line-blur': 4 } },
          { id: 'route', type: 'line', source: 'route', paint: { 'line-color': '#ffffff', 'line-width': 2.5, 'line-opacity': 0.85 } },
          { id: 'walk-glow', type: 'line', source: 'walk', paint: { 'line-color': '#7be0a8', 'line-width': 7, 'line-opacity': 0.3, 'line-blur': 3 } },
          { id: 'walk', type: 'line', source: 'walk', layout: { 'line-cap': 'round' }, paint: { 'line-color': '#b8f5cf', 'line-width': 3, 'line-dasharray': [1.2, 1.6] } },
          { id: 'done', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-gradient': doneGradient(0) as maplibregl.ExpressionSpecification, 'line-width': 5 } },
          { id: 'walk-done', type: 'line', source: 'walk', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-gradient': doneGradient(0) as maplibregl.ExpressionSpecification, 'line-width': 4 } },
        ],
        sky: { 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 8, 0] },
      },
    });
    // The camera is driven by scroll until the visitor chooses "Explore map".
    [m.scrollZoom, m.dragPan, m.dragRotate, m.doubleClickZoom, m.touchZoomRotate, m.keyboard, m.boxZoom, m.touchPitch].forEach((h) => h.disable());
    const pin = document.createElement('div');
    pin.className = 'map-pin';
    pin.innerHTML = `<span class="pulse"></span><span class="dot"></span><b>${esc(name)}</b>`;
    pin.title = `Play the journey to ${name}`;
    pin.addEventListener('click', () => playFn.current());
    new maplibregl.Marker({ element: pin }).setLngLat([lon, lat]).addTo(m);
    // All Travel Guide destinations as round photo markers — click one to open its guide.
    DESTINATIONS.forEach((d) => {
      const im = localImages(d.id)[0];
      if (!im || (Math.abs(d.lat - lat) < 0.05 && Math.abs(d.lon - lon) < 0.05)) return;
      const e = document.createElement('div');
      e.className = 'map-dest';
      e.title = `${d.name} — open guide`;
      e.innerHTML = `<img src="${srcOf(im, 'card')}" alt=""><b>${esc(d.name)}</b>`;
      e.addEventListener('click', () => navigate(`/destination/${d.id}`));
      new maplibregl.Marker({ element: e }).setLngLat([d.lon, d.lat]).addTo(m);
    });
    m.on('load', () => {
      ready.current = true; kick.current();
      m.once('idle', () => setLoaded(true)); // first full frame drawn: reveal (no black flash)
    });
    const fallback = window.setTimeout(() => setLoaded(true), 6000);
    // Keep the canvas matched to its frame (sticky layouts change size as the page settles).
    // Resizing with 3D terrain on leaves MapLibre's terrain textures at the old size (a blank map), so
    // terrain steps out for the resize and comes back once the map has redrawn.
    let lastSize = '';
    const ro = new ResizeObserver(() => {
      const size = `${el.current?.clientWidth}x${el.current?.clientHeight}`;
      if (size === lastSize) return;
      lastSize = size;
      const had = terrainOn.current;
      if (had) { terrainOn.current = false; m.setTerrain(null); }
      m.resize();
      if (had) m.once('idle', () => { if (restingRef.current && !terrainOn.current && map.current === m) { terrainOn.current = true; m.setTerrain({ source: 'dem', exaggeration: 1.3 }); } });
    });
    ro.observe(el.current!);
    // The From/To panel, route summary and options button cover parts of the map: centre everything
    // (the globe, the journey, the arrival) in the space that is actually visible.
    const fitPadding = () => {
      const host = el.current?.closest('.mapfly-sticky') as HTMLElement | null;
      if (!host) return;
      const hb = host.getBoundingClientRect();
      const bottomOf = (sel: string) => { const n = host.querySelector(sel) as HTMLElement | null; return n && n.offsetParent ? n.getBoundingClientRect().bottom - hb.top : 0; };
      const top = Math.max(bottomOf('.mapfly-route-form'), bottomOf('.mapfly-route'));
      const ui = host.querySelector('.mapfly-ui') as HTMLElement | null;
      const bottom = ui ? hb.bottom - ui.getBoundingClientRect().top : 0;
      const clamp2 = (v: number) => Math.max(0, Math.min(hb.height * 0.35, v));
      m.setPadding({ top: clamp2(top + 8), bottom: clamp2(bottom + 8), left: 0, right: 0 });
    };
    m.on('load', fitPadding);
    padRef.current = fitPadding;
    const ro2 = new ResizeObserver(fitPadding);
    ro2.observe(el.current!);
    // Imagery credit: required by the providers, so it stays — but folded into the small ⓘ (tap to read it).
    let creditOpened = false;
    const foldCredit = () => {
      const a = el.current?.querySelector('.maplibregl-ctrl-attrib');
      if (a && !creditOpened) a.classList.remove('maplibregl-compact-show');
    };
    m.on('load', () => {
      foldCredit();
      el.current?.querySelector('.maplibregl-ctrl-attrib-button')?.addEventListener('click', () => { creditOpened = !creditOpened; });
    });
    m.on('resize', () => requestAnimationFrame(foldCredit));
    // A tile that fails now and then (network hiccup) just retries on the next view — don't log it as an error.
    m.on('error', (e) => { const msg = String((e as { error?: Error }).error?.message ?? ''); if (!/fetch|tile|AJAX|aborted/i.test(msg)) console.warn('Map:', msg); });
    map.current = m;
    prefetchArrival(lat, lon); // the close-up at the destination is ready before the camera gets there
    if (import.meta.env.DEV) (window as unknown as { __map: maplibregl.Map }).__map = m;
    return () => { clearTimeout(fallback); ro.disconnect(); ro2.disconnect(); ready.current = false; terrainOn.current = false; m.remove(); map.current = null; routeRef.current = null; mover.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [near, lat, lon, name]);

  // Satellite / street map.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const apply = () => {
      m.setLayoutProperty('satellite', 'visibility', mode === 'satellite' ? 'visible' : 'none');
      m.setLayoutProperty('labels', 'visibility', mode === 'satellite' ? 'visible' : 'none');
      ['area-names', 'street-names', 'poi-dots', 'poi-names'].forEach((id) => m.getLayer(id) && m.setLayoutProperty(id, 'visibility', mode === 'satellite' ? 'visible' : 'none'));
      m.setLayoutProperty('street', 'visibility', mode === 'street' ? 'visible' : 'none');
    };
    if (m.isStyleLoaded()) apply(); else m.once('load', apply);
  }, [mode]);

  // Best tourist places around the destination, shown on the map with their photos.
  useEffect(() => {
    const ctl = new AbortController();
    setTour([]);
    nearbySpots(lat, lon, ctl.signal).then((x) => !ctl.signal.aborted && setTour(x.filter((p) => p.dist > 0.4 && p.title.toLowerCase() !== name.toLowerCase() && p.image && (SACRED_OR_SCENIC.test(`${p.title} ${p.description ?? ''}`) || SCENIC_STOP.test(`${p.title} ${p.description ?? ''}`))).slice(0, 10)));
    return () => ctl.abort();
  }, [lat, lon]);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    spotMarkers.current.forEach((k) => k.remove());
    spotMarkers.current = tour.map((s) => {
      const d = document.createElement('div');
      d.className = 'map-photo map-tour';
      d.title = `${s.title} — open guide`;
      d.innerHTML = `${markerImg(s.image)}<b>${esc(s.title)}</b>`;
      guardImg(d);
      const to = placeHref({ kind: 'place', name: s.title, title: s.title, lat: s.lat, lon: s.lon });
      d.addEventListener('click', () => navigate(to));
      return new maplibregl.Marker({ element: d }).setLngLat([s.lon, s.lat]).addTo(m);
    });
  }, [tour, near, lat, lon]);

  // ── Route from the starting city, and scenic stops along it ──
  useEffect(() => {
    if (!from) return;
    const ctl = new AbortController();
    const markers: Marker[] = [];
    fetchRoute(from, [lat, lon], ctl.signal, travel, name).then((r) => {
      const m = map.current;
      if (ctl.signal.aborted || !m) return;
      const draw = () => {
        const roadPts = r.walkFrom !== undefined ? r.pts.slice(0, r.walkFrom + 1) : r.pts;
        (m.getSource('route') as maplibregl.GeoJSONSource).setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: roadPts.map(([a, b]) => [b, a]) } });
        (m.getSource('walk') as maplibregl.GeoJSONSource).setData(r.walkFrom !== undefined
          ? { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: r.pts.slice(r.walkFrom).map(([a, b]) => [b, a]) } }
          : { type: 'FeatureCollection', features: [] });
        if (r.mode === 'air') m.setPaintProperty('route', 'line-dasharray', [2, 2]);
        const lngs = r.pts.map((p) => p[1]), lats = r.pts.map((p) => p[0]);
        const cam = m.cameraForBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 70 });
        const c = cam?.center as maplibregl.LngLat | undefined;
        // Flights sweep across continents: drop stale tile requests so the visible area loads first.
        // Road trips move slowly enough to keep every request (no half-loaded patches).
        m.cancelPendingTileRequestsWhileZooming = legsOf(r).some((l) => l.travel === 'flight');
        prefetchCorridor(r.pts);
        routeRef.current = { r, fit: { center: c ? [c.lng, c.lat] : [(lon + from.lon) / 2, (lat + from.lat) / 2], zoom: Math.min(zoomTo - 2, cam?.zoom ?? 5) }, mc: mercatorCum(r.pts) };
        const o = document.createElement('div');
        o.className = 'map-origin';
        o.innerHTML = `<span></span><b>${esc(from.name)}</b>`;
        markers.push(new maplibregl.Marker({ element: o }).setLngLat([from.lon, from.lat]).addTo(m));
        const mv = document.createElement('div');
        mv.className = 'map-mover';
        mv.textContent = VEHICLE[legsOf(r)[0].travel].icon;
        mover.current = new maplibregl.Marker({ element: mv }).setLngLat([from.lon, from.lat]).addTo(m);
        markers.push(mover.current);
        doneState.current = { n: -1, t: -1 };
        m.setPaintProperty('done', 'line-gradient', doneGradient(0) as maplibregl.ExpressionSpecification);
        m.setPaintProperty('walk-done', 'line-gradient', doneGradient(0) as maplibregl.ExpressionSpecification);
        setRoute(r);
        kick.current();
        if (autoplay.current) {
          autoplay.current = false;
          // Bring the whole map on screen before the new journey plays (it may be half scrolled away).
          const st = stickyRef.current?.getBoundingClientRect();
          if (st && !fullRef.current && (st.top < -2 || st.bottom > innerHeight + 2)) sec.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          setTimeout(() => playFn.current(), 500);
        }
      };
      if (ready.current) draw(); else m.once('load', draw);
      scenicStops(r, from, [lat, lon], ctl.signal).then((st) => {
        if (ctl.signal.aborted || !map.current) return;
        stopsRef.current = st; setStops(st);
        st.forEach((s, i) => {
          const d = document.createElement('div');
          d.className = 'map-photo';
          d.innerHTML = `${markerImg(s.image)}<b>${esc(s.title)}</b>`;
          guardImg(d);
          d.addEventListener('click', () => { cardRef.current = i; setCard(i); });
          markers.push(new maplibregl.Marker({ element: d }).setLngLat([s.lon, s.lat]).addTo(map.current!));
        });
      });
    });
    return () => {
      ctl.abort();
      markers.forEach((k) => k.remove());
      routeRef.current = null; mover.current = null;
      setRoute(null); stopsRef.current = []; setStops([]); cardRef.current = -1; setCard(-1);
      const m = map.current;
      if (m?.getSource('route')) (m.getSource('route') as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features: [] });
      if (m?.getSource('walk')) (m.getSource('walk') as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features: [] });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromKey, lat, lon, near, travel]);

  /** Whole-Earth zoom: the globe fills more of a wide laptop frame, and fits a phone. */
  const globeZoom = () => ((el.current?.clientWidth ?? 400) > 900 ? 1.5 : 0.9);
  /** The 3D camera for journey progress p (0 = whole Earth, 1 = landed at the place). */
  const applyCamera = (p: number) => {
    const m = map.current;
    if (!m || !ready.current) return;
    const rr = routeRef.current;
    // The travelled line is revealed by updating a gradient stop — no geometry is re-uploaded per frame.
    const setDone = (at: { i: number; f: number } | 'start' | 'end') => {
      if (!rr) return;
      const mc = rr.mc, last = mc.length - 1, wf = rr.r.walkFrom;
      const m0 = at === 'start' ? 0 : at === 'end' ? mc[last] : mc[at.i - 1] + (mc[at.i] - mc[at.i - 1]) * at.f;
      const roadEnd = wf !== undefined ? mc[wf] : mc[last];
      const road = clamp(m0 / (roadEnd || 1)), walk = wf !== undefined ? clamp((m0 - roadEnd) / ((mc[last] - roadEnd) || 1)) : 0;
      const prev = doneState.current;
      if (Math.abs(road - prev.n) < 0.0015 && Math.abs(walk - prev.t) < 0.0015 && at !== 'end' && at !== 'start') return;
      doneState.current = { n: road, t: walk };
      m.setPaintProperty('done', 'line-gradient', doneGradient(road) as maplibregl.ExpressionSpecification);
      if (wf !== undefined) m.setPaintProperty('walk-done', 'line-gradient', doneGradient(walk) as maplibregl.ExpressionSpecification);
    };
    let center: [number, number], zoom: number, pitch: number, bearing = 0;
    if (!rr) {
      const e = smooth(p);
      center = [lon, lat]; zoom = lerp(globeZoom(), arriveZoom, e); pitch = lerp(0, 55, smooth(clamp((p - 0.45) / 0.55)));
      bearing = lerp(0, -25, e);
    } else {
      const follow = Math.max(rr.fit.zoom, Math.min(rr.fit.zoom + 1.6, 11, zoomTo - 1));
      if (p < 0.18) {
        // Whole Earth → the route region, spinning the globe towards it.
        const e = smooth(p / 0.18);
        center = [lerp(rr.fit.center[0] - 12, rr.fit.center[0], e), lerp(rr.fit.center[1] - 4, rr.fit.center[1], e)];
        zoom = lerp(globeZoom(), rr.fit.zoom, e); pitch = lerp(0, 20, e);
        setDone('start'); mover.current?.setLngLat([rr.r.pts[0][1], rr.r.pts[0][0]]);
        if (cardRef.current !== -1) { cardRef.current = -1; setCard(-1); }
      } else if (p < 0.85) {
        // Follow the road / flight over 3D terrain, looking ahead along the route.
        const t = (p - 0.18) / 0.67, e = smooth(clamp(t * 5));
        const f = travelToDistance(rr.r, smooth(t)); // the walking stretch takes longer than its length
        const walking = isWalking(rr.r, f);
        const mv = mover.current?.getElement();
        const leg = legAt(rr.r, f);
        if (mv && mv.dataset.mode !== leg.travel) { mv.dataset.mode = leg.travel; mv.textContent = VEHICLE[leg.travel].icon; }
        const at = along(rr.r, f), pt = at.p;
        const ahead = along(rr.r, Math.min(1, f + 0.04)).p;
        center = [lerp(rr.fit.center[0], pt[1], e), lerp(rr.fit.center[1], pt[0], e)];
        zoom = lerp(rr.fit.zoom, follow, e); pitch = lerp(20, 52, e);
        if (walking && rr.r.walkFrom !== undefined) {
          // On foot the camera comes down close, so the walker's pace and the path are visible.
          const total = rr.r.cum[rr.r.cum.length - 1], w0 = rr.r.cum[rr.r.walkFrom] / total;
          const k = smooth(clamp((f - w0) / Math.max(0.0001, (1 - w0) * 0.25)));
          zoom = lerp(follow, Math.min(zoomTo - 1.5, 14.5), k);
        }
        bearing = e * (Math.atan2(ahead[1] - pt[1], ahead[0] - pt[0]) * 180 / Math.PI) * 0.5;
        setDone(at); mover.current?.setLngLat([pt[1], pt[0]]);
        const near = stopsRef.current.findIndex((st) => Math.abs(st.frac - f) < 0.065);
        if (near !== cardRef.current) { cardRef.current = near; setCard(near); }
        // Visit tourist spots on the way: as the journey passes one, the camera swings over and dips
        // down to look at it, then rejoins the route.
        const visit = stopsRef.current.reduce((best, st) => { const k = 1 - Math.abs(st.frac - f) / 0.045; return k > best.k ? { k, st } : best; }, { k: 0, st: null as RouteStop | null });
        if (visit.st && visit.k > 0) {
          const k = smooth(clamp(visit.k));
          center = [lerp(center[0], visit.st.lon, k * 0.9), lerp(center[1], visit.st.lat, k * 0.9)];
          zoom = lerp(zoom, Math.max(zoom, Math.min(zoomTo - 1.5, 14)), k * 0.85);
          pitch = lerp(pitch, 58, k);
        }
        nearStop.current = visit.k > 0.25;
      } else {
        // Arrive: dolly in and orbit down onto the place.
        const e = smooth((p - 0.85) / 0.15);
        // Close enough to see the place itself, high enough to see the town around it (not one street).
        center = [lon, lat]; zoom = lerp(follow, Math.max(follow, arriveZoom), e); pitch = lerp(52, 44, e); bearing = lerp(0, -20, e);
        setDone('end'); mover.current?.setLngLat([lon, lat]);
        if (cardRef.current !== -1) { cardRef.current = -1; setCard(-1); }
      }
    }
    // Once landed, the vehicle steps aside so the destination pin and its name are what you see.
    mover.current?.getElement().classList.toggle('is-parked', !!rr && p > 0.93);
    m.jumpTo({ center, zoom, pitch, bearing });
    // Keep the flight fluid on any device: if frames run long, render the map at a lower resolution.
    const now = performance.now(), gap = now - perf.current.last;
    perf.current.last = now;
    if (gap > 4 && gap < 120) {
      const pf = perf.current;
      pf.sum += gap; pf.n++;
      if (pf.n >= 45) {
        const avg = pf.sum / pf.n;
        pf.sum = 0; pf.n = 0;
        if (avg > 23 && pf.ratio > 0.8) { pf.ratio = pf.ratio > 1 ? 1 : 0.8; m.setPixelRatio(pf.ratio); }
      }
    }
    // 3D terrain costs a lot of CPU per frame, so it is off while the camera flies (smooth motion)
    // and rises in once the camera rests near the ground (see setTerrainWhenResting).
    if (terrainOn.current && (p < 0.9 || (!restingRef.current && p < 0.97))) { terrainOn.current = false; m.setTerrain(null); }
    el.current?.classList.toggle('is-close', zoom > 8.5);
    el.current?.classList.toggle('is-globe', zoom < 3.2);
  };
  const camRef = useRef(applyCamera);
  camRef.current = applyCamera;

  // ── Scroll-controlled dolly: scroll sets a target, the camera glides to it (in and out). ──
  useEffect(() => {
    if (reduced) return;
    let raf = 0, cur = -1, target = 0, last = 0;
    const read = () => {
      const s = sec.current;
      if (!s) return;
      const rect = s.getBoundingClientRect();
      target = clamp(-rect.top / Math.max(1, rect.height - innerHeight));
    };
    const frame = (now: number) => {
      raf = 0;
      if (freeRef.current || playRef.current || fullRef.current) { cur = -1; return; }
      // After "Play journey" the camera stays at the destination until the visitor clearly scrolls,
      // then glides from there (never snaps back to the globe).
      if (held.current !== null) { if (Math.abs(target - held.current) < 0.06) return; held.current = null; cur = 1; }
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
      last = now;
      cur = cur < 0 ? target : cur + (target - cur) * (1 - Math.exp(-dt * 3)); // slow, soft glide
      if (Math.abs(target - cur) < 0.0004) cur = target;
      camRef.current(cur);
      if (cur !== target) { raf = requestAnimationFrame(frame); restingRef.current = false; } else { last = 0; settle(cur > 0.97 || !routeRef.current && cur > 0.9); }
    };
    const on = () => { read(); if (!raf) raf = requestAnimationFrame(frame); };
    kick.current = () => { cur = -1; on(); };
    on();
    addEventListener('scroll', on, { passive: true });
    addEventListener('resize', on);
    return () => { removeEventListener('scroll', on); removeEventListener('resize', on); cancelAnimationFrame(raf); };
  }, [lat, lon, zoomTo, reduced]);

  const setInteractive = (on: boolean) => {
    const m = map.current;
    if (!m) return;
    [m.scrollZoom, m.dragPan, m.dragRotate, m.doubleClickZoom, m.touchZoomRotate, m.keyboard, m.boxZoom, m.touchPitch].forEach((h) => (on ? h.enable() : h.disable()));
    // Touch screens inside the page: one finger keeps scrolling the page, two fingers move the map
    // (otherwise a full-screen map traps the finger). In full screen one finger moves the map.
    const coarse = matchMedia('(pointer: coarse)').matches;
    if (on && coarse && !fullRef.current) m.cooperativeGestures.enable(); else m.cooperativeGestures.disable();
  };
  useEffect(() => { if (reduced) setInteractive(true); }, [reduced, lat, lon]);

  /** Tap the pin (or "Play journey"): the camera flies the whole journey on its own, from the Earth down. */
  const play = () => {
    if (playRef.current || !map.current) return;
    if (free) { setFree(false); setInteractive(false); }
    setPlaying(true); playRef.current = true;
    const dur = routeRef.current ? 20000 : 8000;
    let p = 0, last = performance.now();
    const step = (now: number) => {
      if (!playRef.current) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      p = clamp(p + (dt * 1000 / dur) * (nearStop.current ? 0.22 : 1)); // linger at tourist spots on the way
      camRef.current(p);
      if (p < 1) requestAnimationFrame(step);
      else { playRef.current = false; setPlaying(false); settle(true); const r = sec.current?.getBoundingClientRect(); held.current = r ? clamp(-r.top / Math.max(1, r.height - innerHeight)) : 0; }
    };
    requestAnimationFrame(step);
  };
  const playFn = useRef(play);
  playFn.current = play;
  const stop = () => { held.current = null; playRef.current = false; setPlaying(false); kick.current(); };

  const toggleFree = () => {
    const m = map.current;
    if (!m) return;
    const next = !free;
    setFree(next);
    setInteractive(next);
    if (next) { m.easeTo({ center: [lon, lat], zoom: Math.max(m.getZoom(), zoomTo - 1), pitch: 60, duration: 1600 }); settle(true); }
    else kick.current();
  };
  // ── Full screen: the browser's own full screen where it exists, otherwise the map fills the window. ──
  const stickyRef = useRef<HTMLDivElement>(null);
  const fullRef = useRef(false);
  const [full, setFull] = useState(false);
  useEffect(() => {
    const on = () => { if (!document.fullscreenElement) setFull(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setFull(false); };
    document.addEventListener('fullscreenchange', on); addEventListener('keydown', esc);
    return () => { document.removeEventListener('fullscreenchange', on); removeEventListener('keydown', esc); };
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle('map-full', full);
    // There is no page to scroll in full screen: drag, pinch and zoom work there; on exit the map goes
    // back to exactly how it was (scroll journey or explore), and the page stays where it was.
    fullRef.current = full;
    if (full) setInteractive(true);
    else if (!freeRef.current) { setInteractive(false); kick.current(); }
    else setInteractive(true); // back in the page while exploring: two-finger map on touch screens again
    // (the map's ResizeObserver redraws it at the new size)
    return () => document.documentElement.classList.remove('map-full');
  }, [full]); // eslint-disable-line react-hooks/exhaustive-deps
  const savedY = useRef(0);
  useEffect(() => { if (!full && savedY.current) { const y = savedY.current; requestAnimationFrame(() => scrollTo(0, y)); } }, [full]);
  const toggleFull = () => {
    const s = stickyRef.current;
    if (!full) {
      savedY.current = scrollY;
      setFull(true);
      s?.requestFullscreen?.().catch(() => undefined); // iPhone Safari has no element full screen: the CSS fallback covers it
    } else {
      setFull(false);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    }
  };

  // ── Offline: works with or without a connection; "Save offline" stores this journey's map tiles. ──
  const [online, setOnline] = useState(() => navigator.onLine);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: Event) => { if (!(e.target as Element)?.closest?.('.mapfly-ui')) setMenuOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    addEventListener('pointerdown', close); addEventListener('keydown', esc);
    return () => { removeEventListener('pointerdown', close); removeEventListener('keydown', esc); };
  }, [menuOpen]);
  const [saving, setSaving] = useState<number | null>(null);
  const [savedMsg, setSavedMsg] = useState('');
  useEffect(() => {
    const up = () => setOnline(true), down = () => setOnline(false);
    addEventListener('online', up); addEventListener('offline', down);
    return () => { removeEventListener('online', up); removeEventListener('offline', down); };
  }, []);
  const saveOffline = async () => {
    if (saving !== null) return;
    setSaving(0); setSavedMsg('');
    const n = await saveTripOffline(routeRef.current?.r.pts ?? [], [lat, lon], setSaving, mode === 'street');
    setSaving(null);
    setSavedMsg(n ? `Saved ${n.toLocaleString('en-IN')} map tiles — this journey now works offline.` : 'Could not save right now — try again when online.');
  };

  // ── Current location as the starting point: a button, and automatic once the visitor has allowed it. ──
  const [locating, setLocating] = useState(false);
  const [locMsg, setLocMsg] = useState('');
  const locate = async (fromButton: boolean) => {
    if (!('geolocation' in navigator)) { if (fromButton) setLocMsg('Location is not available on this device.'); return; }
    setLocating(true); setLocMsg('');
    try {
      const here = await currentPlace();
      autoplay.current = fromButton;
      setCustom((c) => ({ ...c, from: here }));
    } catch (e) {
      if (fromButton) setLocMsg((e as GeolocationPositionError)?.code === 1 ? 'Location permission was declined — type your city in From instead.' : 'Could not find your location — type your city in From instead.');
    } finally { setLocating(false); }
  };
  useEffect(() => {
    // Already allowed (from an earlier visit)? Start from where the visitor is, without asking again.
    navigator.permissions?.query({ name: 'geolocation' as PermissionName }).then((st) => { if (st.state === 'granted') locate(false); }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pLat, pLon]);

  const zoomBy = (d: number) => map.current?.easeTo({ zoom: map.current.getZoom() + d, duration: 400 });

  const hm = hmText;
  const routeLabel = route && from
    ? (route.legs && route.legs.length > 1
      ? `${route.legs.map((l) => `${VEHICLE[l.travel].icon} ${l.title ?? VEHICLE[l.travel].label} · ${Math.round(l.km).toLocaleString('en-IN')} km · ${hm(l.hours)}`).join('  →  ')}  ·  total about ${hm(route.hours)}${route.note ? `  ·  ${route.note}` : ''}`
      : `${VEHICLE[route.travel ?? (route.mode === 'air' ? 'flight' : 'car')].icon} ${VEHICLE[route.travel ?? (route.mode === 'air' ? 'flight' : 'car')].label} from ${from.name} · ${Math.round(route.km - (route.walkKm ?? 0)).toLocaleString('en-IN')} km${route.hours ? ` · ${hm(route.hours)}` : ''}${route.walkKm ? `  ·  🥾 Trek ${route.walkKm.toFixed(1)} km · ${hm(route.walkHours)}` : ''}${route.note ? `  ·  ${route.note}` : ''}`)
    : null;

  useEffect(() => { requestAnimationFrame(() => padRef.current()); }, [routeLabel]);

  return (
    <>
    <section ref={sec} className={`mapfly${from ? ' has-route' : ''}${reduced ? ' is-static' : ''}${free ? ' is-free' : ''}`} aria-label={`3D map journey to ${name}`}>
      <div ref={stickyRef} className={`mapfly-sticky${full ? ' is-full' : ''}`}>
        <div className="mapfly-stage"><SpaceSky /><div ref={el} className={`mapfly-map${loaded ? ' is-ready' : ''}`} /></div>
        {!loaded && (
          <div className="mapfly-loading" aria-live="polite">
            <span className="mf-earth" aria-hidden />
            <span className="small">{near ? 'Loading the 3D Earth…' : '3D Earth journey'}</span>
          </div>
        )}
        <form className="mapfly-route-form glass" onSubmit={(e) => e.preventDefault()} aria-label="Plan a route on the map">
          <PlaceInput label="From" value={from?.name ?? ''} onPick={(p) => { autoplay.current = true; setCustom((c) => ({ ...c, from: p })); }} />
          <button type="button" className="btn btn-sm mf-locate" onClick={() => locate(true)} disabled={locating} aria-label="Start from my current location" title="Start from my current location">{locating ? '…' : '◎'} <span>My location</span></button>
          <PlaceInput label="To" value={name} onPick={(p) => { autoplay.current = true; setCustom((c) => ({ ...c, to: p })); }} />
          {(custom.from || custom.to) && <button type="button" className="btn btn-sm" onClick={() => setCustom({})} title="Back to this page's place" aria-label="Reset route">↺</button>}
        </form>
        {routeLabel && <p className="mapfly-route small">{routeLabel}</p>}
        {stops.map((s, i) => (
          <div key={s.title} className={`mapfly-card glass${card === i ? ' is-on' : ''}`} aria-hidden={card !== i}>
            {s.image && <img src={thumbAt(s.image, 500)} alt={s.title} referrerPolicy="no-referrer" />}
            <div><span className="tiny muted">On the way · {s.kmFromStart} km from {from?.name}</span><b>{s.title}</b>{s.description && <span className="tiny muted">{s.description}</span>}
              <button type="button" className="btn btn-sm mf-visit" tabIndex={card === i ? 0 : -1} onClick={() => navigate(placeHref({ kind: 'place', name: s.title, title: s.title, lat: s.lat, lon: s.lon }))}>Open guide →</button></div>
          </div>
        ))}
        {/* Every map action in one place: a single "Map options" button opening a small menu. */}
        <div className="mapfly-ui">
          <button type="button" className="btn btn-sm mf-options-btn" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
            {playing ? '■ Playing' : '☰ Map options'}
          </button>
          {menuOpen && (
            <div className="mf-options" role="menu" aria-label="Map options">
              <div className="mf-travel" role="group" aria-label="How you travel">
                {(['auto', 'car', 'bike', 'train', 'flight', 'walk'] as const).map((t) => {
                  const on = travel === t;
                  const icon = t === 'auto' ? '✨' : VEHICLE[t].icon, text = t === 'auto' ? 'Best' : t === 'walk' ? 'Walk' : VEHICLE[t].label;
                  return <button key={t} role="menuitemradio" aria-checked={on} className={`mf-travel-btn${on ? ' is-on' : ''}`} title={t === 'auto' ? 'Best way (auto)' : VEHICLE[t].label} onClick={() => { autoplay.current = true; setTravel(t); setMenuOpen(false); }}><span aria-hidden>{icon}</span><small>{text}</small></button>;
                })}
              </div>
              <button role="menuitem" className="mf-opt is-primary" onClick={() => { setMenuOpen(false); (playing ? stop : play)(); }}>{playing ? '■ Stop journey' : '▶ Play journey'}</button>
              <div className="mf-opt-row" role="group" aria-label="Map type">
                <button role="menuitemradio" aria-checked={mode === 'satellite'} className={`mf-opt-half${mode === 'satellite' ? ' is-on' : ''}`} onClick={() => setMode('satellite')}>Satellite</button>
                <button role="menuitemradio" aria-checked={mode === 'street'} className={`mf-opt-half${mode === 'street' ? ' is-on' : ''}`} onClick={() => setMode('street')}>Map</button>
              </div>
              <button role="menuitem" className="mf-opt" onClick={() => { setMenuOpen(false); toggleFree(); }}>{free ? '↺ Back to journey' : '✋ Explore map'}</button>
              <button role="menuitem" className="mf-opt" onClick={() => { setMenuOpen(false); toggleFull(); }}>{full ? '✕ Exit full screen' : '⛶ Full screen'}</button>
              <button role="menuitem" className="mf-opt" onClick={saveOffline} disabled={saving !== null || !online}>{saving !== null ? `Saving… ${Math.round(saving * 100)}%` : '↓ Save offline'}</button>
              <a role="menuitem" className="mf-opt" onClick={() => setMenuOpen(false)} href={from ? `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lon}&destination=${lat},${lon}` : `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`} target="_blank" rel="noreferrer">↗ Directions in Google Maps</a>
            </div>
          )}
        </div>
        {locMsg && <p className="mapfly-offline small" role="status" onClick={() => setLocMsg('')}>{locMsg}</p>}
        {!online && <p className="mapfly-offline small" role="status">Offline — showing the map saved on this device</p>}
        {savedMsg && <p className="mapfly-offline small is-ok" role="status" onClick={() => setSavedMsg('')}>{savedMsg}</p>}
        {(free || reduced) && (
          <div className="mapfly-zoom glass" role="group" aria-label="Zoom">
            <button onClick={() => zoomBy(1)} aria-label="Zoom in">+</button>
            <button onClick={() => zoomBy(-1)} aria-label="Zoom out">−</button>
          </div>
        )}
        {!free && !reduced && <p className="mapfly-hint small">{playing ? `Travelling${from ? ` from ${from.name}` : ''} to ${name}…` : `Scroll to fly from the Earth${from ? ` via ${from.name}` : ''} to ${name} — or tap the pin`}</p>}
      </div>
    </section>
    {stops.length > 0 && (
      <div className="route-views">
        <h3 style={{ margin: '0 0 .3rem' }}>Beautiful views along the way</h3>
        <p className="small muted" style={{ margin: '0 0 .8rem' }}>Photographed places near the route from {from?.name} — tap one to open its guide. Round photo markers show each on the map.</p>
        <div className="route-strip">
          {stops.map((s) => {
            const to = placeHref({ kind: 'place', name: s.title, title: s.title, lat: s.lat, lon: s.lon });
            return (
              <a key={s.title} className="spot-card glass" href={href(to)} onClick={(e) => { e.preventDefault(); navigate(to); }}>
                {s.image && <img src={thumbAt(s.image, 500)} alt={s.title} loading="lazy" referrerPolicy="no-referrer" />}
                <span className="spot-body"><b>{s.title}</b><span className="tiny muted">{s.kmFromStart} km into the journey{s.description ? ` · ${s.description}` : ''}</span></span>
              </a>
            );
          })}
        </div>
      </div>
    )}
    </>
  );
}

/** Deep space behind the globe: a real photograph of the Milky Way (ESO/S. Brunier, CC BY 4.0). */
function SpaceSky() {
  return <div className="mf-space-clip" aria-hidden><img className="mf-space" src={`${import.meta.env.BASE_URL}media/space/milky-way.jpg`} alt="" decoding="async" /></div>;
}
