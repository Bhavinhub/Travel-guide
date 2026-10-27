import maplibregl, { type Map as MLMap, type Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import { DESTINATIONS, searchDestinations } from '../data/catalog';
import { localImages, srcOf } from '../lib/localMedia';
import { geocode, nearbySpots, placeHref, SACRED_OR_SCENIC, SCENIC_STOP, type NearbySpot } from '../lib/places';
import { href, navigate } from '../lib/router';
import { prefetchArrival, prefetchCorridor, saveTripOffline } from '../lib/offlineMap';
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

interface Route {
  pts: [number, number][]; cum: number[]; mode: 'road' | 'air'; km: number; hours?: number;
  /** Where the road ends and a footpath continues (index into pts), e.g. the Kedarnath trek. */
  walkFrom?: number; walkKm?: number; walkHours?: number;
}

function buildRoute(pts: [number, number][], mode: Route['mode'], km?: number, hours?: number): Route {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + kmBetween(pts[i - 1], pts[i]));
  return { pts, cum, mode, km: km ?? cum[cum.length - 1], hours };
}

/**
 * Travel progress → distance progress. With a walking leg the journey gives the footpath a larger
 * share of the time than its length, so the walker visibly moves slower than the car did.
 */
function travelToDistance(r: Route, t: number) {
  if (r.walkFrom === undefined) return clamp(t);
  const total = r.cum[r.cum.length - 1], driveFrac = r.cum[r.walkFrom] / total;
  const tDrive = 0.7; // first 70% of the travel time drives the road; the last 30% walks the path
  return t <= tDrive ? (t / tDrive) * driveFrac : driveFrac + ((t - tDrive) / (1 - tDrive)) * (1 - driveFrac);
}
const isWalking = (r: Route, distFrac: number) => r.walkFrom !== undefined && distFrac * r.cum[r.cum.length - 1] >= r.cum[r.walkFrom] - 1e-6;

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

async function fetchRoute(from: MapOrigin, to: [number, number], signal: AbortSignal): Promise<Route> {
  const a: [number, number] = [from.lat, from.lon];
  const crow = kmBetween(a, to);
  // Drive only for trips where a car is realistic; islands and long hauls are flown.
  if (crow < 800) {
    try {
      const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to[1]},${to[0]}?overview=full&geometries=geojson`, { signal });
      const j = await r.json();
      const g = j.routes?.[0];
      if (g?.geometry?.coordinates?.length > 1 && g.distance / 1000 < crow * 2.2 + 40) {
        const all: [number, number][] = g.geometry.coordinates.map(([lo, la]: [number, number]) => [la, lo]);
        const step = Math.max(1, Math.ceil(all.length / 700)); // keep winding mountain roads, cap the point count
        const pts = all.filter((_, i) => i % step === 0 || i === all.length - 1);
        // The road stops short of the place (a trek, a pilgrim path, a pedestrian old town)? Walk the rest.
        const end = pts[pts.length - 1], gap = kmBetween(end, to);
        if (gap > 0.6 && gap < 40) {
          try {
            const w = await fetch(`https://routing.openstreetmap.de/routed-foot/route/v1/driving/${end[1]},${end[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`, { signal }).then((x) => x.json());
            const wr = w.routes?.[0];
            const walk: [number, number][] = wr?.geometry?.coordinates?.length > 1 ? wr.geometry.coordinates.map(([lo, la]: [number, number]) => [la, lo]) : [end, to];
            const route = buildRoute([...pts, ...walk.slice(1)], 'road', g.distance / 1000 + (wr ? wr.distance / 1000 : gap), g.duration / 3600);
            return { ...route, walkFrom: pts.length - 1, walkKm: wr ? wr.distance / 1000 : gap, walkHours: wr ? wr.duration / 3600 : gap / 4 };
          } catch { /* no footpath data: draw the road only */ }
        }
        return buildRoute(pts, 'road', g.distance / 1000, g.duration / 3600);
      }
    } catch { /* fall back to a straight arc */ }
  }
  return buildRoute(arc(a, to), 'air', crow);
}

export interface RouteStop extends NearbySpot { frac: number; kmFromStart: number }

/** Beautiful places along the way: sample the route and pick the most scenic photographed spot near each sample. */
async function scenicStops(r: Route, from: MapOrigin, to: [number, number], signal: AbortSignal): Promise<RouteStop[]> {
  const total = r.cum[r.cum.length - 1];
  const samples = (r.mode === 'air' ? [] : [0.1, 0.19, 0.28, 0.37, 0.46, 0.55, 0.64, 0.73, 0.82, 0.91]).map((f) => along(r, f).p);
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
  const [free, setFree] = useState(false);
  const freeRef = useRef(false);
  freeRef.current = free;
  const [playing, setPlaying] = useState(false);
  const playRef = useRef(false);
  const { reduced } = useMotion();
  const fromKey = from ? `${from.name}|${from.lat},${from.lon}` : '';
  const kick = useRef<() => void>(() => undefined);
  const terrainOn = useRef(false);
  const restingRef = useRef(false);
  const nearStop = useRef(false);
  const held = useRef<number | null>(null);
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
      zoom: reduced ? zoomTo : 0.9,
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
          dem: { type: 'raster-dem', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], encoding: 'terrarium', tileSize: 256, maxzoom: 11, attribution: 'Elevation: AWS Terrain Tiles' },
          route: { type: 'geojson', lineMetrics: true, data: { type: 'FeatureCollection', features: [] } },
          walk: { type: 'geojson', lineMetrics: true, data: { type: 'FeatureCollection', features: [] } },
        },
        layers: [
          { id: 'base', type: 'raster', source: 'base' }, // coarse imagery under the sharp layer: no holes while tiles stream in
          { id: 'satellite', type: 'raster', source: 'satellite' },
          { id: 'street', type: 'raster', source: 'street', layout: { visibility: 'none' } },
          { id: 'labels', type: 'raster', source: 'labels' },
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
    // A tile that fails now and then (network hiccup) just retries on the next view — don't log it as an error.
    m.on('error', (e) => { const msg = String((e as { error?: Error }).error?.message ?? ''); if (!/fetch|tile|AJAX|aborted/i.test(msg)) console.warn('Map:', msg); });
    map.current = m;
    prefetchArrival(lat, lon); // the close-up at the destination is ready before the camera gets there
    if (import.meta.env.DEV) (window as unknown as { __map: maplibregl.Map }).__map = m;
    return () => { clearTimeout(fallback); ro.disconnect(); ready.current = false; terrainOn.current = false; m.remove(); map.current = null; routeRef.current = null; mover.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [near, lat, lon, name]);

  // Satellite / street map.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const apply = () => {
      m.setLayoutProperty('satellite', 'visibility', mode === 'satellite' ? 'visible' : 'none');
      m.setLayoutProperty('labels', 'visibility', mode === 'satellite' ? 'visible' : 'none');
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
    fetchRoute(from, [lat, lon], ctl.signal).then((r) => {
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
        m.cancelPendingTileRequestsWhileZooming = r.mode === 'air';
        prefetchCorridor(r.pts);
        routeRef.current = { r, fit: { center: c ? [c.lng, c.lat] : [(lon + from.lon) / 2, (lat + from.lat) / 2], zoom: Math.min(zoomTo - 2, cam?.zoom ?? 5) }, mc: mercatorCum(r.pts) };
        const o = document.createElement('div');
        o.className = 'map-origin';
        o.innerHTML = `<span></span><b>${esc(from.name)}</b>`;
        markers.push(new maplibregl.Marker({ element: o }).setLngLat([from.lon, from.lat]).addTo(m));
        const mv = document.createElement('div');
        mv.className = 'map-mover';
        mv.textContent = r.mode === 'air' ? '✈️' : '🚗';
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
  }, [fromKey, lat, lon, near]);

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
      center = [lon, lat]; zoom = lerp(0.9, zoomTo, e); pitch = lerp(0, 55, smooth(clamp((p - 0.45) / 0.55)));
      bearing = lerp(0, -25, e);
    } else {
      const follow = Math.max(rr.fit.zoom, Math.min(rr.fit.zoom + 1.6, 11, zoomTo - 1));
      if (p < 0.18) {
        // Whole Earth → the route region, spinning the globe towards it.
        const e = smooth(p / 0.18);
        center = [lerp(rr.fit.center[0] - 40, rr.fit.center[0], e), lerp(rr.fit.center[1] - 10, rr.fit.center[1], e)];
        zoom = lerp(0.9, rr.fit.zoom, e); pitch = lerp(0, 20, e);
        setDone('start'); mover.current?.setLngLat([rr.r.pts[0][1], rr.r.pts[0][0]]);
        if (cardRef.current !== -1) { cardRef.current = -1; setCard(-1); }
      } else if (p < 0.85) {
        // Follow the road / flight over 3D terrain, looking ahead along the route.
        const t = (p - 0.18) / 0.67, e = smooth(clamp(t * 5));
        const f = travelToDistance(rr.r, smooth(t)); // the walking stretch takes longer than its length
        const walking = isWalking(rr.r, f);
        const mv = mover.current?.getElement();
        if (mv && mv.dataset.mode !== (walking ? 'walk' : 'drive')) { mv.dataset.mode = walking ? 'walk' : 'drive'; mv.textContent = walking ? '🚶' : rr.r.mode === 'air' ? '✈️' : '🚗'; }
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
        center = [lon, lat]; zoom = lerp(follow, zoomTo, e); pitch = lerp(52, 50, e); bearing = lerp(0, -20, e);
        setDone('end'); mover.current?.setLngLat([lon, lat]);
        mover.current?.getElement().classList.toggle('is-arrived', e > 0.6);
        if (cardRef.current !== -1) { cardRef.current = -1; setCard(-1); }
      }
    }
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

  const zoomBy = (d: number) => map.current?.easeTo({ zoom: map.current.getZoom() + d, duration: 400 });

  const hm = (h = 0) => `${Math.floor(h)} h ${Math.round((h % 1) * 60)} min`;
  const routeLabel = route && from
    ? `${route.mode === 'air' ? '✈️ Flight' : '🚗 Road'} from ${from.name} · ${Math.round(route.km - (route.walkKm ?? 0)).toLocaleString('en-IN')} km${route.hours ? ` · ${hm(route.hours)}` : ''}${route.walkKm ? `  ·  🥾 Trek ${route.walkKm.toFixed(1)} km · ${hm(route.walkHours)}` : ''}`
    : null;

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
        <div className="mapfly-ui glass">
          <div className="seg" role="group" aria-label="Map type">
            <button aria-pressed={mode === 'satellite'} onClick={() => setMode('satellite')}>Satellite</button>
            <button aria-pressed={mode === 'street'} onClick={() => setMode('street')}>Map</button>
          </div>
          <button className="btn btn-sm btn-primary" onClick={playing ? stop : play}>{playing ? '■ Stop' : '▶ Play journey'}</button>
          <button className="btn btn-sm" onClick={toggleFree}>{free ? 'Back to journey' : 'Explore map'}</button>
          <button className="btn btn-sm" onClick={toggleFull} aria-pressed={full}>{full ? '✕ Exit full screen' : '⛶ Full screen'}</button>
          <button className="btn btn-sm" onClick={saveOffline} disabled={saving !== null || !online} title="Download this journey's map so it works without internet">{saving !== null ? `Saving… ${Math.round(saving * 100)}%` : '↓ Save offline'}</button>
          <a className="btn btn-sm" href={from ? `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lon}&destination=${lat},${lon}` : `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`} target="_blank" rel="noreferrer">Directions ↗</a>
        </div>
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
