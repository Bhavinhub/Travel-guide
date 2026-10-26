import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import { useMotion } from '../lib/store';

/**
 * Satellite map with a scroll-controlled 3D camera that travels the route.
 * Scrolling down: orbit → whole route in view → the camera follows the path from the
 * starting city (road route from OSRM, or a flight arc for long distances) → it lands and
 * zooms into the place with a 3D tilt. Scrolling up reverses every step.
 * "Explore map" frees the map with zoom buttons, wheel/pinch zoom and dragging.
 * Imagery: Esri World Imagery; street map: OpenStreetMap; road routes: OSRM.
 */
export interface MapSpot { name: string; lat: number; lon: number; href?: string }
export interface MapOrigin { name: string; lat: number; lon: number }

const LAYERS = {
  satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: 'Imagery © Esri, Maxar, Earthstar Geographics', maxZoom: 18 },
  labels: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', attribution: '', maxZoom: 18 },
  street: { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '© OpenStreetMap contributors', maxZoom: 19 },
};

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

interface Route { pts: [number, number][]; cum: number[]; mode: 'road' | 'air'; km: number; hours?: number }

function buildRoute(pts: [number, number][], mode: Route['mode'], km?: number, hours?: number): Route {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + kmBetween(pts[i - 1], pts[i]));
  return { pts, cum, mode, km: km ?? cum[cum.length - 1], hours };
}

/** Point and index at fraction t of the route length. */
function along(r: Route, t: number): { p: [number, number]; i: number } {
  const total = r.cum[r.cum.length - 1], want = clamp(t) * total;
  let i = 1;
  while (i < r.cum.length - 1 && r.cum[i] < want) i++;
  const seg = r.cum[i] - r.cum[i - 1] || 1, f = clamp((want - r.cum[i - 1]) / seg);
  return { p: [lerp(r.pts[i - 1][0], r.pts[i][0], f), lerp(r.pts[i - 1][1], r.pts[i][1], f)], i };
}

async function fetchRoute(from: MapOrigin, to: [number, number], signal: AbortSignal): Promise<Route> {
  const a: [number, number] = [from.lat, from.lon];
  const crow = kmBetween(a, to);
  // Drive only for trips where a car is realistic; islands and long hauls are flown.
  if (crow < 800) {
    try {
      const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to[1]},${to[0]}?overview=simplified&geometries=geojson`, { signal });
      const j = await r.json();
      const g = j.routes?.[0];
      if (g?.geometry?.coordinates?.length > 1 && g.distance / 1000 < crow * 2.2 + 40) {
        return buildRoute(g.geometry.coordinates.map(([lo, la]: [number, number]) => [la, lo]), 'road', g.distance / 1000, g.duration / 3600);
      }
    } catch { /* fall back to a straight arc */ }
  }
  return buildRoute(arc(a, to), 'air', crow);
}

export function MapFlyIn({ lat, lon, name, spots = [], zoomTo = 13.5, from }: { lat: number; lon: number; name: string; spots?: MapSpot[]; zoomTo?: number; from?: MapOrigin }) {
  const sec = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const base = useRef<L.TileLayer | null>(null);
  const labels = useRef<L.TileLayer | null>(null);
  const backdrop = useRef<L.TileLayer | null>(null);
  const spotLayer = useRef<L.LayerGroup | null>(null);
  const routeRef = useRef<{ r: Route; group: L.LayerGroup; done: L.Polyline; mover: L.Marker; fitZoom: number; center: L.LatLng } | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [mode, setMode] = useState<'satellite' | 'street'>('satellite');
  const [free, setFree] = useState(false);
  const freeRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const playRef = useRef(false);
  freeRef.current = free;
  const { reduced } = useMotion();
  const fromKey = from ? `${from.name}|${from.lat},${from.lon}` : '';

  useEffect(() => {
    const m = L.map(el.current!, { zoomControl: false, attributionControl: true, zoomSnap: 0, zoomDelta: 1, wheelPxPerZoomLevel: 90, scrollWheelZoom: false, dragging: false, doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false, worldCopyJump: true });
    m.setView([lat, lon], reduced ? zoomTo : 2.4);
    labels.current = L.tileLayer(LAYERS.labels.url, { maxZoom: 18, pane: 'overlayPane' }).addTo(m);
    const icon = L.divIcon({ className: 'map-pin', html: `<span class="pulse"></span><span class="dot"></span><b>${esc(name)}</b>`, iconSize: [0, 0] });
    L.marker([lat, lon], { icon, keyboard: false, zIndexOffset: 1000, title: `Play the journey to ${name}` }).addTo(m).on('click', () => playFn.current());
    spotLayer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => { m.remove(); map.current = null; routeRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon, name]);

  // Nearby places as small markers (they arrive after the map is created).
  useEffect(() => {
    const g = spotLayer.current;
    if (!g) return;
    g.clearLayers();
    spots.slice(0, 12).forEach((s) => {
      const mk = L.marker([s.lat, s.lon], { icon: L.divIcon({ className: 'map-spot', html: '<span></span>', iconSize: [12, 12] }), keyboard: false, title: s.name }).addTo(g);
      mk.bindTooltip(s.name, { direction: 'top', offset: [0, -6] });
      if (s.href) mk.on('click', () => window.open(s.href, '_blank', 'noopener'));
    });
  }, [spots, lat, lon]);

  // Fetch and draw the route from the starting city.
  useEffect(() => {
    if (!from) return;
    const ctl = new AbortController();
    fetchRoute(from, [lat, lon], ctl.signal).then((r) => {
      const m = map.current;
      if (ctl.signal.aborted || !m) return;
      const group = L.layerGroup().addTo(m);
      const full = L.polyline(r.pts, { color: '#ffffff', weight: 3, opacity: 0.6, dashArray: r.mode === 'air' ? '6 8' : undefined }).addTo(group);
      const done = L.polyline([], { color: '#f4b860', weight: 5, opacity: 0.95 }).addTo(group);
      L.marker(r.pts[0], { icon: L.divIcon({ className: 'map-origin', html: `<span></span><b>${esc(from.name)}</b>`, iconSize: [0, 0] }), keyboard: false }).addTo(group);
      const mover = L.marker(r.pts[0], { icon: L.divIcon({ className: 'map-mover', html: r.mode === 'air' ? '✈' : '🚗', iconSize: [30, 30] }), keyboard: false, zIndexOffset: 900 }).addTo(group);
      const bounds = full.getBounds();
      const fitZoom = Math.min(zoomTo - 1.5, m.getBoundsZoom(bounds.pad(0.2), false));
      routeRef.current = { r, group, done, mover, fitZoom, center: bounds.getCenter() };
      setRoute(r);
      dispatchEvent(new Event('scroll'));
    });
    return () => {
      ctl.abort();
      routeRef.current?.group.remove();
      routeRef.current = null;
      setRoute(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromKey, lat, lon]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    base.current?.remove();
    const cfg = LAYERS[mode];
    base.current = L.tileLayer(cfg.url, { maxZoom: cfg.maxZoom, attribution: cfg.attribution, keepBuffer: 4, updateInterval: 120 }).addTo(m);
    base.current.bringToBack();
    // Low-detail imagery underneath (few, quickly cached tiles) so the camera never flies over grey while sharp tiles load.
    backdrop.current?.remove();
    backdrop.current = L.tileLayer(cfg.url, { maxZoom: 19, maxNativeZoom: 6, keepBuffer: 6 }).addTo(m);
    backdrop.current.bringToBack();
    if (mode === 'satellite') labels.current?.addTo(m); else labels.current?.remove();
  }, [mode, lat, lon]);

  /** Camera for journey progress p (0 = orbit, 1 = landed at the place). */
  const applyCamera = (p: number) => {
    const m = map.current;
    if (!m) return;
    const rr = routeRef.current;
    let center: [number, number], zoom: number, tilt: number;
    if (!rr) {
      const e = smooth(p);
      center = [lat, lon]; zoom = lerp(2.4, zoomTo, e); tilt = e;
    } else {
      const follow = Math.max(rr.fitZoom, Math.min(rr.fitZoom + 2.2, 11, zoomTo - 0.5));
      const c: [number, number] = [rr.center.lat, rr.center.lng];
      if (p < 0.15) {
        // Orbit → the whole route in view.
        const e = smooth(p / 0.15);
        center = [lerp(lat, c[0], e), lerp(lon, c[1], e)]; zoom = lerp(2.4, rr.fitZoom, e); tilt = 0;
        rr.done.setLatLngs([]); rr.mover.setLatLng(rr.r.pts[0]);
      } else if (p < 0.85) {
        // Travel the path: the camera rides along it.
        const t = (p - 0.15) / 0.7, e = smooth(clamp(t * 5));
        const { p: pt, i } = along(rr.r, smooth(t));
        center = [lerp(c[0], pt[0], e), lerp(c[1], pt[1], e)];
        zoom = lerp(rr.fitZoom, follow, e); tilt = 0.55 * e;
        rr.done.setLatLngs([...rr.r.pts.slice(0, i), pt]);
        rr.mover.setLatLng(pt);
      } else {
        // Arrive and descend into the place.
        const e = smooth((p - 0.85) / 0.15);
        center = [lat, lon]; zoom = lerp(follow, zoomTo, e); tilt = lerp(0.55, 1, e);
        rr.done.setLatLngs(rr.r.pts); rr.mover.setLatLng([lat, lon]);
      }
    }
    m.setView(center, zoom, { animate: false });
    stage.current?.style.setProperty('--p', tilt.toFixed(4));
  };
  const camRef = useRef(applyCamera);
  camRef.current = applyCamera;

  // Scroll-scrubbed camera (paused while free-exploring or auto-playing).
  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const s = sec.current;
      if (!s || freeRef.current || playRef.current) return;
      const rect = s.getBoundingClientRect();
      camRef.current(clamp(-rect.top / Math.max(1, rect.height - innerHeight)));
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    addEventListener('scroll', on, { passive: true });
    addEventListener('resize', on);
    return () => { removeEventListener('scroll', on); removeEventListener('resize', on); cancelAnimationFrame(raf); };
  }, [lat, lon, zoomTo, reduced]);

  /** Click the pin (or "Play journey"): the camera travels the whole path on its own. */
  const play = () => {
    if (playRef.current || !map.current) return;
    if (free) { setFree(false); setInteractive(false); }
    setPlaying(true); playRef.current = true;
    const dur = routeRef.current ? 9000 : 4500, t0 = performance.now();
    const step = (now: number) => {
      if (!playRef.current) return;
      const p = clamp((now - t0) / dur);
      camRef.current(p);
      if (p < 1) requestAnimationFrame(step);
      else { playRef.current = false; setPlaying(false); }
    };
    requestAnimationFrame(step);
  };
  const playFn = useRef(play);
  playFn.current = play;
  const stop = () => { playRef.current = false; setPlaying(false); dispatchEvent(new Event('scroll')); };

  const setInteractive = (on: boolean) => {
    const m = map.current;
    if (!m) return;
    [m.dragging, m.scrollWheelZoom, m.doubleClickZoom, m.touchZoom, m.boxZoom, m.keyboard].forEach((f) => (on ? f.enable() : f.disable()));
  };
  useEffect(() => { if (reduced) setInteractive(true); }, [reduced, lat, lon]);

  const toggleFree = () => {
    const m = map.current;
    if (!m) return;
    const next = !free;
    setFree(next);
    setInteractive(next);
    if (next) {
      stage.current?.style.setProperty('--p', '0');
      setTimeout(() => { m.invalidateSize(); if (m.getZoom() < 9) m.flyTo([lat, lon], zoomTo, { duration: 1.4 }); }, 60);
    } else setTimeout(() => { m.invalidateSize(); dispatchEvent(new Event('scroll')); }, 60);
  };
  const zoomBy = (d: number) => { const m = map.current; if (m) m.setZoom(Math.round(m.getZoom()) + d); };

  const routeLabel = route && from
    ? `${route.mode === 'air' ? '✈ By air' : '🚗 By road'} from ${from.name} · ${Math.round(route.km).toLocaleString('en-IN')} km${route.hours ? ` · about ${Math.floor(route.hours)} h ${Math.round((route.hours % 1) * 60)} min` : ''}`
    : null;

  return (
    <section ref={sec} className={`mapfly${from ? ' has-route' : ''}${reduced ? ' is-static' : ''}${free ? ' is-free' : ''}`} aria-label={`Satellite map of ${name}`}>
      <div className="mapfly-sticky">
        <div ref={stage} className="mapfly-stage" style={{ '--p': reduced ? 1 : 0 } as React.CSSProperties}>
          <div ref={el} className="mapfly-map" />
        </div>
        {routeLabel && <p className="mapfly-route small">{routeLabel}</p>}
        <div className="mapfly-ui glass">
          <div className="seg" role="group" aria-label="Map type">
            <button aria-pressed={mode === 'satellite'} onClick={() => setMode('satellite')}>Satellite</button>
            <button aria-pressed={mode === 'street'} onClick={() => setMode('street')}>Map</button>
          </div>
          <button className="btn btn-sm btn-primary" onClick={playing ? stop : play}>{playing ? '■ Stop' : '▶ Play journey'}</button>
          <button className="btn btn-sm" onClick={toggleFree}>{free ? 'Back to fly-in' : 'Explore map'}</button>
          <a className="btn btn-sm" href={from ? `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lon}&destination=${lat},${lon}` : `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`} target="_blank" rel="noreferrer">Directions ↗</a>
        </div>
        {(free || reduced) && (
          <div className="mapfly-zoom glass" role="group" aria-label="Zoom">
            <button onClick={() => zoomBy(1)} aria-label="Zoom in">+</button>
            <button onClick={() => zoomBy(-1)} aria-label="Zoom out">−</button>
          </div>
        )}
        {!free && !reduced && <p className="mapfly-hint small">{playing ? `Travelling${from ? ` from ${from.name}` : ''} to ${name}…` : `Scroll — or tap the ${name} pin — to travel${from ? ` from ${from.name}` : ''}`}</p>}
      </div>
    </section>
  );
}
