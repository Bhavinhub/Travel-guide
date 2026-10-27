import maplibregl, { type Map as MLMap, type Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import { nearbySpots, placeHref, SCENIC_STOP, type NearbySpot } from '../lib/places';
import { href, navigate } from '../lib/router';
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
      const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to[1]},${to[0]}?overview=full&geometries=geojson`, { signal });
      const j = await r.json();
      const g = j.routes?.[0];
      if (g?.geometry?.coordinates?.length > 1 && g.distance / 1000 < crow * 2.2 + 40) {
        const all: [number, number][] = g.geometry.coordinates.map(([lo, la]: [number, number]) => [la, lo]);
        const step = Math.max(1, Math.ceil(all.length / 700)); // keep winding mountain roads, cap the point count
        const pts = all.filter((_, i) => i % step === 0 || i === all.length - 1);
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

export function MapFlyIn({ lat, lon, name, spots = [], zoomTo = 13.5, from }: { lat: number; lon: number; name: string; spots?: MapSpot[]; zoomTo?: number; from?: MapOrigin }) {
  const sec = useRef<HTMLElement>(null);
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const ready = useRef(false);
  const mover = useRef<Marker | null>(null);
  const spotMarkers = useRef<Marker[]>([]);
  const routeRef = useRef<{ r: Route; fit: { center: [number, number]; zoom: number } } | null>(null);
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

  // ── Create the globe ──
  useEffect(() => {
    const m = new maplibregl.Map({
      container: el.current!,
      center: [lon, lat],
      zoom: reduced ? zoomTo : 0.9,
      pitch: 0,
      maxPitch: 80,
      attributionControl: { compact: true },
      interactive: true,
      style: {
        version: 8,
        projection: { type: 'globe' },
        sources: {
          satellite: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 18, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' },
          labels: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 18 },
          street: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19, attribution: '© OpenStreetMap contributors' },
          dem: { type: 'raster-dem', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], encoding: 'terrarium', tileSize: 256, maxzoom: 14, attribution: 'Elevation: AWS Terrain Tiles' },
          route: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
          done: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
        },
        layers: [
          { id: 'satellite', type: 'raster', source: 'satellite' },
          { id: 'street', type: 'raster', source: 'street', layout: { visibility: 'none' } },
          { id: 'labels', type: 'raster', source: 'labels' },
          { id: 'route-glow', type: 'line', source: 'route', paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.25, 'line-blur': 4 } },
          { id: 'route', type: 'line', source: 'route', paint: { 'line-color': '#ffffff', 'line-width': 2.5, 'line-opacity': 0.85 } },
          { id: 'done', type: 'line', source: 'done', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#f4b860', 'line-width': 5 } },
        ],
        terrain: { source: 'dem', exaggeration: 1.4 },
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
    m.on('load', () => { ready.current = true; kick.current(); });
    map.current = m;
    return () => { ready.current = false; m.remove(); map.current = null; routeRef.current = null; mover.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon, name]);

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

  // Nearby places as small markers.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    spotMarkers.current.forEach((k) => k.remove());
    spotMarkers.current = spots.slice(0, 12).map((s) => {
      const d = document.createElement('div');
      d.className = 'map-spot';
      d.title = s.name;
      d.innerHTML = '<span></span>';
      if (s.href) d.addEventListener('click', () => window.open(s.href, '_blank', 'noopener'));
      return new maplibregl.Marker({ element: d }).setLngLat([s.lon, s.lat]).addTo(m);
    });
  }, [spots, lat, lon]);

  // ── Route from the starting city, and scenic stops along it ──
  useEffect(() => {
    if (!from) return;
    const ctl = new AbortController();
    const markers: Marker[] = [];
    fetchRoute(from, [lat, lon], ctl.signal).then((r) => {
      const m = map.current;
      if (ctl.signal.aborted || !m) return;
      const draw = () => {
        (m.getSource('route') as maplibregl.GeoJSONSource).setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: r.pts.map(([a, b]) => [b, a]) } });
        if (r.mode === 'air') m.setPaintProperty('route', 'line-dasharray', [2, 2]);
        const lngs = r.pts.map((p) => p[1]), lats = r.pts.map((p) => p[0]);
        const cam = m.cameraForBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 70 });
        const c = cam?.center as maplibregl.LngLat | undefined;
        routeRef.current = { r, fit: { center: c ? [c.lng, c.lat] : [(lon + from.lon) / 2, (lat + from.lat) / 2], zoom: Math.min(zoomTo - 2, cam?.zoom ?? 5) } };
        const o = document.createElement('div');
        o.className = 'map-origin';
        o.innerHTML = `<span></span><b>${esc(from.name)}</b>`;
        markers.push(new maplibregl.Marker({ element: o }).setLngLat([from.lon, from.lat]).addTo(m));
        const mv = document.createElement('div');
        mv.className = 'map-mover';
        mv.textContent = r.mode === 'air' ? '✈' : '🚗';
        mover.current = new maplibregl.Marker({ element: mv }).setLngLat([from.lon, from.lat]).addTo(m);
        markers.push(mover.current);
        setRoute(r);
        kick.current();
      };
      if (m.isStyleLoaded()) draw(); else m.once('load', draw);
      scenicStops(r, from, [lat, lon], ctl.signal).then((st) => {
        if (ctl.signal.aborted || !map.current) return;
        stopsRef.current = st; setStops(st);
        st.forEach((s, i) => {
          const d = document.createElement('div');
          d.className = 'map-photo';
          d.innerHTML = `<img src="${esc(s.image ?? '')}" alt="" referrerpolicy="no-referrer"><b>${esc(s.title)}</b>`;
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromKey, lat, lon]);

  /** The 3D camera for journey progress p (0 = whole Earth, 1 = landed at the place). */
  const applyCamera = (p: number) => {
    const m = map.current;
    if (!m || !ready.current) return;
    const rr = routeRef.current;
    const setDone = (coords: [number, number][]) => (m.getSource('done') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords.map(([a, b]) => [b, a]) } });
    let center: [number, number], zoom: number, pitch: number, bearing = 0;
    if (!rr) {
      const e = smooth(p);
      center = [lon, lat]; zoom = lerp(0.9, zoomTo, e); pitch = lerp(0, 62, smooth(clamp((p - 0.45) / 0.55)));
      bearing = lerp(0, -25, e);
    } else {
      const follow = Math.max(rr.fit.zoom, Math.min(rr.fit.zoom + 1.6, 11, zoomTo - 1));
      if (p < 0.18) {
        // Whole Earth → the route region, spinning the globe towards it.
        const e = smooth(p / 0.18);
        center = [lerp(rr.fit.center[0] - 40, rr.fit.center[0], e), lerp(rr.fit.center[1] - 10, rr.fit.center[1], e)];
        zoom = lerp(0.9, rr.fit.zoom, e); pitch = lerp(0, 20, e);
        setDone([]); mover.current?.setLngLat([rr.r.pts[0][1], rr.r.pts[0][0]]);
      } else if (p < 0.85) {
        // Follow the road / flight over 3D terrain, looking ahead along the route.
        const t = (p - 0.18) / 0.67, e = smooth(clamp(t * 5));
        const f = smooth(t);
        const { p: pt, i } = along(rr.r, f);
        const ahead = along(rr.r, Math.min(1, f + 0.04)).p;
        center = [lerp(rr.fit.center[0], pt[1], e), lerp(rr.fit.center[1], pt[0], e)];
        zoom = lerp(rr.fit.zoom, follow, e); pitch = lerp(20, 58, e);
        bearing = e * (Math.atan2(ahead[1] - pt[1], ahead[0] - pt[0]) * 180 / Math.PI) * 0.5;
        setDone([...rr.r.pts.slice(0, i), pt]); mover.current?.setLngLat([pt[1], pt[0]]);
        const near = stopsRef.current.findIndex((st) => Math.abs(st.frac - f) < 0.065);
        if (near !== cardRef.current) { cardRef.current = near; setCard(near); }
      } else {
        // Arrive: dolly in and orbit down onto the place.
        const e = smooth((p - 0.85) / 0.15);
        center = [lon, lat]; zoom = lerp(follow, zoomTo, e); pitch = lerp(58, 68, e); bearing = lerp(0, -30, e);
        setDone(rr.r.pts); mover.current?.setLngLat([lon, lat]);
        if (cardRef.current !== -1) { cardRef.current = -1; setCard(-1); }
      }
    }
    m.jumpTo({ center, zoom, pitch, bearing });
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
      if (freeRef.current || playRef.current) { cur = -1; return; }
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
      last = now;
      cur = cur < 0 ? target : cur + (target - cur) * (1 - Math.exp(-dt * 5));
      if (Math.abs(target - cur) < 0.0004) cur = target;
      camRef.current(cur);
      if (cur !== target) raf = requestAnimationFrame(frame); else last = 0;
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
  };
  useEffect(() => { if (reduced) setInteractive(true); }, [reduced, lat, lon]);

  /** Tap the pin (or "Play journey"): the camera flies the whole journey on its own, from the Earth down. */
  const play = () => {
    if (playRef.current || !map.current) return;
    if (free) { setFree(false); setInteractive(false); }
    setPlaying(true); playRef.current = true;
    const dur = routeRef.current ? 14000 : 6000, t0 = performance.now();
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
  const stop = () => { playRef.current = false; setPlaying(false); kick.current(); };

  const toggleFree = () => {
    const m = map.current;
    if (!m) return;
    const next = !free;
    setFree(next);
    setInteractive(next);
    if (next) m.easeTo({ center: [lon, lat], zoom: Math.max(m.getZoom(), zoomTo - 1), pitch: 60, duration: 1600 });
    else kick.current();
  };
  const zoomBy = (d: number) => map.current?.easeTo({ zoom: map.current.getZoom() + d, duration: 400 });

  const routeLabel = route && from
    ? `${route.mode === 'air' ? '✈ By air' : '🚗 By road'} from ${from.name} · ${Math.round(route.km).toLocaleString('en-IN')} km${route.hours ? ` · about ${Math.floor(route.hours)} h ${Math.round((route.hours % 1) * 60)} min` : ''}`
    : null;

  return (
    <>
    <section ref={sec} className={`mapfly${from ? ' has-route' : ''}${reduced ? ' is-static' : ''}${free ? ' is-free' : ''}`} aria-label={`3D map journey to ${name}`}>
      <div className="mapfly-sticky">
        <div className="mapfly-stage"><div ref={el} className="mapfly-map" /></div>
        {routeLabel && <p className="mapfly-route small">{routeLabel}</p>}
        {stops.map((s, i) => (
          <div key={s.title} className={`mapfly-card glass${card === i ? ' is-on' : ''}`} aria-hidden={card !== i}>
            {s.image && <img src={s.image} alt={s.title} referrerPolicy="no-referrer" />}
            <div><span className="tiny muted">On the way · {s.kmFromStart} km from {from?.name}</span><b>{s.title}</b>{s.description && <span className="tiny muted">{s.description}</span>}</div>
          </div>
        ))}
        <div className="mapfly-ui glass">
          <div className="seg" role="group" aria-label="Map type">
            <button aria-pressed={mode === 'satellite'} onClick={() => setMode('satellite')}>Satellite</button>
            <button aria-pressed={mode === 'street'} onClick={() => setMode('street')}>Map</button>
          </div>
          <button className="btn btn-sm btn-primary" onClick={playing ? stop : play}>{playing ? '■ Stop' : '▶ Play journey'}</button>
          <button className="btn btn-sm" onClick={toggleFree}>{free ? 'Back to journey' : 'Explore map'}</button>
          <a className="btn btn-sm" href={from ? `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lon}&destination=${lat},${lon}` : `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`} target="_blank" rel="noreferrer">Directions ↗</a>
        </div>
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
                {s.image && <img src={s.image} alt={s.title} loading="lazy" referrerPolicy="no-referrer" />}
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
