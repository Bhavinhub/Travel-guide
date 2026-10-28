import { useEffect, useRef } from 'react';

/**
 * Keep zooming out past the Earth: the Moon, the Sun and planets (where they are today), the nearest stars,
 * the Milky Way with Sagittarius A* (its black hole), Andromeda and the Local Group, the cosmic web, and the
 * edge of the observable universe — and beyond, endlessly.
 *
 * Distances are real (km); bodies are drawn larger than true scale (a minimum on-screen size) so they stay
 * visible, like a map's symbols. `depth` is how far out the camera is: each 1.0 is ten times further.
 */
const AU = 1.496e8, LY = 9.461e12;
const KM_PER_DAY_J2000 = Date.UTC(2000, 0, 1, 12);

interface Planet { name: string; a: number; L0: number; n: number; r: number; color: string; min: number; ring?: boolean }
const PLANETS: Planet[] = [
  { name: 'Mercury', a: 0.387, L0: 252.25, n: 4.09233, r: 2440, color: '#b5ada3', min: 2.2 },
  { name: 'Venus', a: 0.723, L0: 181.98, n: 1.60213, r: 6052, color: '#e9cf98', min: 3 },
  { name: 'Earth', a: 1, L0: 100.46, n: 0.98561, r: 6371, color: '#4f8fe6', min: 3.2 },
  { name: 'Mars', a: 1.524, L0: 355.43, n: 0.52403, r: 3390, color: '#d0562a', min: 2.6 },
  { name: 'Jupiter', a: 5.203, L0: 34.35, n: 0.08309, r: 69911, color: '#d9b48a', min: 5.5 },
  { name: 'Saturn', a: 9.537, L0: 50.08, n: 0.03346, r: 58232, color: '#e6cd94', min: 5, ring: true },
  { name: 'Uranus', a: 19.19, L0: 314.06, n: 0.01173, r: 25362, color: '#a6e6ea', min: 4 },
  { name: 'Neptune', a: 30.07, L0: 304.35, n: 0.00598, r: 24622, color: '#5577e6', min: 4 },
];
// Nearby and famous stars: distance (ly) and direction (right ascension, degrees) — flattened onto the map.
const STARS: [string, number, number, string, number][] = [
  ['Alpha Centauri', 4.37, 219.9, '#fff4d6', 2.6], ["Barnard's Star", 5.96, 269.5, '#ffb38a', 1.6], ['Sirius', 8.6, 101.3, '#d8e6ff', 3],
  ['Epsilon Eridani', 10.5, 53.2, '#ffd2a1', 1.8], ['Procyon', 11.5, 114.8, '#fff6e0', 2.4], ['Vega', 25, 279.2, '#dce8ff', 2.6],
  ['Arcturus', 36.7, 213.9, '#ffc58a', 2.8], ['Polaris', 433, 37.9, '#fff2c8', 2.6], ['Betelgeuse', 548, 88.8, '#ff8a5c', 3.4], ['Rigel', 860, 78.6, '#b8d4ff', 3.2],
];

const SUN: [number, number] = [0, 0];
const GC: [number, number] = [-2.46e17, 0.55e17]; // the Milky Way's centre, 26,000 ly away (Sagittarius A*)
const ANDROMEDA: [number, number] = [GC[0] + 2.4e19 * Math.cos(2.4), GC[1] + 2.4e19 * Math.sin(2.4)];
const TRIANGULUM: [number, number] = [GC[0] + 2.73e19 * Math.cos(2.62), GC[1] + 2.73e19 * Math.sin(2.62)];
const LMC: [number, number] = [GC[0] + 1.5e18 * Math.cos(-1.9), GC[1] + 1.5e18 * Math.sin(-1.9)];
const SMC: [number, number] = [GC[0] + 1.9e18 * Math.cos(-1.55), GC[1] + 1.9e18 * Math.sin(-1.55)];
const LG: [number, number] = [(GC[0] + ANDROMEDA[0]) / 2, (GC[1] + ANDROMEDA[1]) / 2];
const EDGE = 4.4e23; // radius of the observable universe (46.5 billion ly)

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (t: number) => { const x = clamp(t); return x * x * (3 - 2 * x); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp2 = (a: [number, number], b: [number, number], t: number): [number, number] => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];

/** A seeded random generator, so the galaxies and the cosmic web look the same on every visit. */
function rng(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }

/** A spiral galaxy as points: [x, y, size, warmth]. */
function spiral(seed: number, radius: number, arms: number, count: number, tilt = 1, rot = 0) {
  const r = rng(seed), out: [number, number, number, number][] = [];
  for (let i = 0; i < count; i++) {
    const bulge = r() < 0.22;
    const d = bulge ? Math.pow(r(), 2.2) * radius * 0.22 : Math.pow(r(), 0.75) * radius;
    const arm = Math.floor(r() * arms);
    const ang = bulge ? r() * Math.PI * 2 : arm * (Math.PI * 2 / arms) + Math.log(1 + d / radius * 9) * 2.4 + (r() - 0.5) * 0.55 * (1 - d / radius * 0.4);
    const x = Math.cos(ang + rot) * d, y = Math.sin(ang + rot) * d * tilt;
    out.push([x, y, bulge ? 1.2 : 0.6 + r() * 0.8, bulge ? 1 : clamp(1 - d / radius * 1.4)]);
  }
  return out;
}
const MILKY = spiral(7, 5e17, 4, 5200);
const ANDRO = spiral(11, 1.05e18, 2, 2600, 0.38, 0.6);
const TRI = spiral(13, 3e17, 2, 700, 0.7, 1.4);

/** The cosmic web: clusters joined by filaments, out to the edge of the observable universe. */
function web(seed: number, radius: number) {
  const r = rng(seed), nodes: [number, number][] = [];
  for (let i = 0; i < 140; i++) { const d = Math.sqrt(r()) * radius, a = r() * Math.PI * 2; nodes.push([Math.cos(a) * d, Math.sin(a) * d]); }
  const links: [number, number][] = [];
  nodes.forEach((n, i) => {
    const near = nodes.map((m, j) => [j, Math.hypot(m[0] - n[0], m[1] - n[1])] as const).filter(([j]) => j !== i).sort((a, b) => a[1] - b[1]).slice(0, 3);
    near.forEach(([j]) => { if (j > i) links.push([i, j]); });
  });
  const dots: [number, number][] = [];
  links.forEach(([i, j]) => { for (let k = 0; k < 14; k++) { const t = r(); dots.push([lerp(nodes[i][0], nodes[j][0], t) + (r() - 0.5) * radius * 0.02, lerp(nodes[i][1], nodes[j][1], t) + (r() - 0.5) * radius * 0.02]); } });
  return { nodes, links, dots };
}
const WEB = web(21, EDGE);
const BEYOND = web(33, 1); // unit-size pattern repeated at every scale past the edge (endless zoom)
const SKY = (() => { const r = rng(5); return Array.from({ length: 260 }, () => [r(), r(), r() * 1.2 + 0.3, r()] as [number, number, number, number]); })();

export interface EarthOnScreen { x: number; y: number; r: number }
/** The map's globe as a picture: the snapshot and where the globe sits in it (snapshot pixels). */
export interface EarthSnapshot { img: CanvasImageSource; sx: number; sy: number; sr: number }

/** The region name and the width of the view, for the caption. */
function caption(v: number, widthKm: number) {
  const where = v < 5 ? 'Earth' : v < 7.4 ? 'Earth and the Moon' : v < 9.3 ? 'The inner Solar System' : v < 11.2 ? 'The Solar System — out to Neptune' : v < 16.6
    ? 'Our stellar neighbourhood — the nearest stars' : v < 19 ? 'The Milky Way — Sagittarius A* at its heart' : v < 21 ? 'The Local Group — Andromeda, Triangulum, the Magellanic Clouds'
      : v < 23.6 ? 'The cosmic web — superclusters of galaxies' : v < 24.6 ? 'Edge of the observable universe' : 'Beyond what we can see — the universe may go on forever';
  const w = widthKm < 1e6 ? `${Math.round(widthKm).toLocaleString('en-IN')} km` : widthKm < 0.05 * LY ? `${(widthKm / AU).toLocaleString('en-IN', { maximumFractionDigits: widthKm / AU < 10 ? 2 : 0 })} AU`
    : widthKm / LY < 1e6 ? `${(widthKm / LY).toLocaleString('en-IN', { maximumFractionDigits: widthKm / LY < 10 ? 1 : 0 })} light-years` : widthKm / LY < 1e9 ? `${(widthKm / LY / 1e6).toLocaleString('en-IN', { maximumFractionDigits: 1 })} million light-years` : widthKm / LY < 1e12 ? `${(widthKm / LY / 1e9).toLocaleString('en-IN', { maximumFractionDigits: 1 })} billion light-years` : `${(widthKm / LY / 1e12).toExponential(1).replace('e+', ' × 10^')} trillion light-years`;
  return { where, w };
}

export function CosmicZoom({ target, earth, onDepth }: { target: number; earth: () => (EarthOnScreen & { snap?: EarthSnapshot | null }) | null; onDepth: (d: number) => void }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const cap = useRef<HTMLDivElement>(null);
  const cur = useRef(0);
  const tgt = useRef(target);
  const raf = useRef(0);
  const earthRef = useRef(earth); earthRef.current = earth;
  const onDepthRef = useRef(onDepth); onDepthRef.current = onDepth;
  const start = useRef<EarthOnScreen | null>(null);

  useEffect(() => {
    tgt.current = target;
    if (!raf.current) raf.current = requestAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  useEffect(() => () => { cancelAnimationFrame(raf.current); raf.current = 0; }, []);

  function frame() {
    raf.current = 0;
    const c = cv.current;
    if (!c) return;
    const diff = tgt.current - cur.current;
    cur.current = Math.abs(diff) < 0.002 ? tgt.current : cur.current + diff * 0.09;
    const d = cur.current;
    onDepthRef.current(d);
    if (d <= 0.001) { start.current = null; c.style.opacity = '0'; if (cap.current) cap.current.style.opacity = '0'; return; }
    if (!start.current) start.current = earthRef.current() ?? null;
    draw(c, d);
    if (Math.abs(tgt.current - cur.current) > 0.0005) raf.current = requestAnimationFrame(frame);
  }

  function draw(c: HTMLCanvasElement, d: number) {
    const W = c.clientWidth, H = c.clientHeight, dpr = Math.min(devicePixelRatio || 1, 2);
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    const x = c.getContext('2d')!;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, W, H);
    c.style.opacity = '1';
    const e0 = start.current ?? { x: W / 2, y: H / 2, r: Math.min(W, H) * 0.3 };
    const S = (e0.r / 6371) * Math.pow(10, -d); // pixels per km
    const v = Math.log10(W / S); // the view's width as a power of ten (km): every stage keys off this
    // Where the camera looks: Earth → the Sun → the galaxy's centre → the Local Group.
    const days = (Date.now() - KM_PER_DAY_J2000) / 86400000;
    const pos = (p: Planet): [number, number] => { const L = ((p.L0 + p.n * days) * Math.PI) / 180; return [Math.cos(L) * p.a * AU, -Math.sin(L) * p.a * AU]; };
    const E = pos(PLANETS[2]);
    let F = lerp2(E, SUN, smooth((v - 7.9) / 1.3));
    F = lerp2(F, GC, smooth((v - 16.9) / 1.3));
    F = lerp2(F, LG, smooth((v - 19.2) / 0.9));
    const k = smooth(d / 1.2);
    const ax = lerp(e0.x, W / 2, k), ay = lerp(e0.y, H / 2, k);
    const P = (p: [number, number]) => [ax + (p[0] - F[0]) * S, ay + (p[1] - F[1]) * S] as const;
    const on = (sx: number, sy: number, m = 60) => sx > -m && sy > -m && sx < W + m && sy < H + m;
    const label = (t: string, sx: number, sy: number, a = 1, size = 12, color = '#fff') => {
      if (a <= 0.02 || !on(sx, sy, 0)) return;
      x.globalAlpha = a; x.font = `600 ${size}px system-ui, sans-serif`; x.fillStyle = color; x.shadowColor = 'rgba(0,0,0,.95)'; x.shadowBlur = 6;
      x.fillText(t, sx + 8, sy - 6); x.shadowBlur = 0; x.globalAlpha = 1;
    };
    const glow = (sx: number, sy: number, r: number, col: string, a = 1) => {
      const g = x.createRadialGradient(sx, sy, 0, sx, sy, r);
      g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.globalAlpha = a; x.fillStyle = g; x.beginPath(); x.arc(sx, sy, r, 0, Math.PI * 2); x.fill(); x.globalAlpha = 1;
    };
    const ball = (sx: number, sy: number, r: number, col: string, lightFrom: readonly [number, number]) => {
      const lx = lightFrom[0] - sx, ly = lightFrom[1] - sy, ll = Math.hypot(lx, ly) || 1;
      const g = x.createRadialGradient(sx + (lx / ll) * r * 0.45, sy + (ly / ll) * r * 0.45, r * 0.1, sx, sy, r * 1.05);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.18, col); g.addColorStop(1, '#05070c');
      x.fillStyle = g; x.beginPath(); x.arc(sx, sy, r, 0, Math.PI * 2); x.fill();
    };

    // Deep background: a black sky that thickens as the photo of the Milky Way fades away.
    x.fillStyle = `rgba(2,3,8,${clamp((v - 6) / 3) * 0.92})`; x.fillRect(0, 0, W, H);
    SKY.forEach(([u, v, s, t]) => { x.globalAlpha = clamp((v - 6.5) / 3) * (0.35 + 0.5 * t); x.fillStyle = '#e8eeff'; x.fillRect(u * W, v * H, s, s); });
    x.globalAlpha = 1;

    const sunS = P(SUN);
    // ── Solar system ──
    const ss = clamp(1 - (v - 14.6) / 1.2);
    if (ss > 0) {
      x.globalAlpha = ss;
      PLANETS.forEach((p) => {
        const orb = p.a * AU * S;
        if (orb > 14 && orb < 40000) { x.strokeStyle = 'rgba(160,190,255,.22)'; x.lineWidth = 1; x.beginPath(); x.arc(sunS[0], sunS[1], orb, 0, Math.PI * 2); x.stroke(); }
      });
      // The Moon's orbit and the Moon
      const ml = ((218.32 + 13.176396 * days) * Math.PI) / 180, moon: [number, number] = [E[0] + Math.cos(ml) * 384400, E[1] - Math.sin(ml) * 384400];
      const es = P(E), mo = P(moon), morb = 384400 * S;
      if (morb > 10 && morb < 60000) { x.strokeStyle = 'rgba(220,220,220,.25)'; x.beginPath(); x.arc(es[0], es[1], morb, 0, Math.PI * 2); x.stroke(); }
      if (morb > 6) { ball(mo[0], mo[1], Math.max(1737 * S, 2.4), '#cfcac2', sunS); label('Moon', mo[0], mo[1], clamp((morb - 10) / 30)); }
      // Sun
      const sr = Math.max(696340 * S, 6);
      glow(sunS[0], sunS[1], sr * 5, 'rgba(255,190,90,.55)'); glow(sunS[0], sunS[1], sr * 1.6, 'rgba(255,236,170,.95)');
      x.fillStyle = '#fff6d8'; x.beginPath(); x.arc(sunS[0], sunS[1], sr, 0, Math.PI * 2); x.fill();
      label('Sun', sunS[0] + sr * 0.6, sunS[1], clamp((v - 7.4) / 1) * clamp(1 - (v - 13.4) / 0.6));
      PLANETS.forEach((p) => {
        const w = pos(p), s = P(w);
        const isEarth = p.name === 'Earth';
        const r = Math.max(p.r * S, p.min);
        if (!on(s[0], s[1], r + 20)) return;
        if (isEarth && d < 1.2) {
          // Close to home: the real globe (a snapshot of the map) shrinking away, then a blue marble.
          const em = earthRef.current();
          const snap = em?.snap;
          if (snap) {
            x.save(); x.beginPath(); x.arc(s[0], s[1], r, 0, Math.PI * 2); x.clip();
            x.drawImage(snap.img, snap.sx - snap.sr, snap.sy - snap.sr, snap.sr * 2, snap.sr * 2, s[0] - r, s[1] - r, r * 2, r * 2); x.restore();
            glow(s[0], s[1], r * 1.25, 'rgba(120,180,255,.25)');
            return;
          }
        }
        if (p.ring) { x.strokeStyle = 'rgba(230,210,160,.75)'; x.lineWidth = Math.max(1, r * 0.25); x.beginPath(); x.ellipse(s[0], s[1], r * 2.1, r * 0.75, -0.35, 0, Math.PI * 2); x.stroke(); }
        if (isEarth) glow(s[0], s[1], r * 2.2, 'rgba(90,160,255,.35)');
        ball(s[0], s[1], r, p.color, sunS);
        const orb = p.a * AU * S;
        label(isEarth ? 'Earth — you are here' : p.name, s[0], s[1], (isEarth ? clamp((v - 6.4) / 0.8) : 1) * clamp((orb - 22) / 40), isEarth ? 12.5 : 11.5, isEarth ? '#9fd0ff' : '#fff');
      });
      x.globalAlpha = 1;
    }

    // ── Nearby stars ──
    const st = clamp((v - 12.6) / 1) * clamp(1 - (v - 18.2) / 0.8);
    if (st > 0) STARS.forEach(([n, ly, ra, col, sz]) => {
      const a = (ra * Math.PI) / 180, s = P([Math.cos(a) * ly * LY, -Math.sin(a) * ly * LY]);
      if (!on(s[0], s[1])) return;
      glow(s[0], s[1], sz * 4, col, st * 0.7); x.globalAlpha = st; x.fillStyle = col; x.beginPath(); x.arc(s[0], s[1], sz * 0.7, 0, Math.PI * 2); x.fill();
      const sep = ly * LY * S; label(n, s[0], s[1], st * clamp((sep - 25) / 40), 11);
    });
    if (st > 0 && v > 13.4) label('Sun', sunS[0], sunS[1], st * clamp(1 - (v - 17) / 0.8));

    // ── Galaxies ──
    const gal = (pts: typeof MILKY, c: [number, number], a: number, warm: string, cool: string) => {
      if (a <= 0.01) return;
      const cs = P(c);
      x.globalCompositeOperation = 'lighter';
      for (let i = 0; i < pts.length; i++) {
        const q = pts[i], sx = cs[0] + q[0] * S, sy = cs[1] + q[1] * S;
        if (sx < -4 || sy < -4 || sx > W + 4 || sy > H + 4) continue;
        x.globalAlpha = a * (0.25 + q[3] * 0.4); x.fillStyle = q[3] > 0.6 ? warm : cool;
        const s = Math.max(0.7, q[2] * Math.min(2.2, 0.6 + S * 4e16)); x.fillRect(sx, sy, s, s);
      }
      x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
    };
    const mw = clamp((v - 16.4) / 1);
    if (mw > 0) {
      const gc = P(GC), gr = 5e17 * S;
      glow(gc[0], gc[1], Math.max(gr * 0.35, 8), 'rgba(255,214,150,.55)', mw);
      gal(MILKY, GC, mw, '#ffe0b0', '#a9c6ff');
      // Sagittarius A*: the black hole at the centre — a dark shadow inside a glowing ring.
      const br = clamp(Math.max(gr * 0.012, 5), 5, 14);
      x.globalAlpha = mw; x.strokeStyle = '#ffb44d'; x.lineWidth = br * 0.45; x.shadowColor = '#ff9a2a'; x.shadowBlur = 12;
      x.beginPath(); x.arc(gc[0], gc[1], br, 0, Math.PI * 2); x.stroke(); x.shadowBlur = 0;
      x.fillStyle = '#000'; x.beginPath(); x.arc(gc[0], gc[1], br * 0.72, 0, Math.PI * 2); x.fill(); x.globalAlpha = 1;
      label('Sagittarius A* — black hole', gc[0] + br, gc[1], mw * clamp(1 - (v - 19.4) / 0.6), 11.5, '#ffd08a');
      label('Milky Way', gc[0] - gr * 0.2, gc[1] + gr * 0.75, mw * clamp((v - 17.4) / 0.6) * clamp(1 - (v - 19.9) / 0.4), 13);
      label('Sun — you are here', sunS[0], sunS[1], mw * clamp((v - 17.2) / 0.6) * clamp(1 - (v - 19) / 0.5), 11, '#9fd0ff');
      if (v > 17.2 && v < 19.5) { x.globalAlpha = mw; x.fillStyle = '#9fd0ff'; x.beginPath(); x.arc(sunS[0], sunS[1], 2.4, 0, Math.PI * 2); x.fill(); x.globalAlpha = 1; }
    }
    const lg = clamp((v - 18.6) / 0.9) * clamp(1 - (v - 22.8) / 1);
    if (lg > 0) {
      gal(ANDRO, ANDROMEDA, lg, '#ffe6c4', '#bcd2ff'); gal(TRI, TRIANGULUM, lg, '#fff0d8', '#b8d0ff');
      const a = P(ANDROMEDA), t = P(TRIANGULUM), l = P(LMC), sm = P(SMC);
      glow(a[0], a[1], Math.max(1.05e18 * S * 0.3, 6), 'rgba(255,225,180,.6)', lg);
      [l, sm].forEach((q) => glow(q[0], q[1], Math.max(1.4e17 * S, 3), 'rgba(200,215,255,.7)', lg));
      label('Andromeda', a[0], a[1], lg * clamp(1 - (v - 21.2) / 0.5), 12.5); label('Triangulum', t[0], t[1], lg * clamp((v - 19.5) / 0.5) * clamp(1 - (v - 21) / 0.5), 11);
      label('Magellanic Clouds', l[0], l[1], lg * clamp((v - 18.6) / 0.5) * clamp(1 - (v - 19.6) / 0.4), 10.5);
      if (v > 20.2) label('Local Group', P(LG)[0], P(LG)[1] + 18, lg * clamp((v - 20.2) / 0.5), 12.5, '#ffd08a');
    }
    // ── The cosmic web, the edge, and beyond (endless) ──
    const wa = clamp((v - 21) / 1);
    if (wa > 0) {
      const o = P(LG), drawWeb = (wb: typeof WEB, scale: number, alpha: number) => {
        x.globalCompositeOperation = 'lighter';
        x.strokeStyle = '#7f8cff'; x.lineWidth = 1; x.globalAlpha = alpha * 0.22;
        x.beginPath(); wb.links.forEach(([i, j]) => { x.moveTo(o[0] + wb.nodes[i][0] * scale, o[1] + wb.nodes[i][1] * scale); x.lineTo(o[0] + wb.nodes[j][0] * scale, o[1] + wb.nodes[j][1] * scale); }); x.stroke();
        x.fillStyle = '#d9c7ff'; x.globalAlpha = alpha * 0.7; wb.dots.forEach((q) => x.fillRect(o[0] + q[0] * scale, o[1] + q[1] * scale, 1.2, 1.2));
        x.fillStyle = '#ffe2b8'; wb.nodes.forEach((q) => { x.globalAlpha = alpha; x.beginPath(); x.arc(o[0] + q[0] * scale, o[1] + q[1] * scale, 1.8, 0, Math.PI * 2); x.fill(); });
        x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
      };
      drawWeb(WEB, S, wa * clamp(1 - (v - 25.6) / 1.2));
      const er = EDGE * S;
      if (v > 23.2) {
        const ea = clamp((v - 23.2) / 0.6);
        const g = x.createRadialGradient(o[0], o[1], er * 0.96, o[0], o[1], er * 1.08);
        g.addColorStop(0, 'rgba(255,120,80,0)'); g.addColorStop(0.5, `rgba(255,140,90,${0.55 * ea})`); g.addColorStop(1, 'rgba(255,120,80,0)');
        x.fillStyle = g; x.beginPath(); x.arc(o[0], o[1], er * 1.08, 0, Math.PI * 2); x.fill();
        label('Observable universe — 93 billion light-years across', o[0] - er * 0.5, o[1] - er * 1.04, ea * clamp(1 - (v - 25) / 0.6), 11.5, '#ffc9a8');
      }
      // Past the edge: a self-similar web, repeating at every power of ten, so zooming out never ends.
      if (v > 24.6) {
        const lv = v - 24.6, base = Math.floor(lv), fr = lv - base;
        for (let i = 0; i < 2; i++) {
          const sc = EDGE * 3 * Math.pow(10, base + i) * S, a = clamp((v - 24.6) / 0.8) * (i === 0 ? 1 - fr : fr) * 0.8;
          drawWeb(BEYOND, sc, a);
        }
      }
    }

    // Caption: where you are and how wide the view is.
    if (cap.current) {
      const { where, w } = caption(v, W / S);
      cap.current.style.opacity = d > 0.6 ? '1' : '0';
      cap.current.innerHTML = `<b>${where}</b><span>View ≈ ${w} across</span>`;
    }
  }

  return (
    <>
      <canvas ref={cv} className="cosmic-canvas" aria-hidden />
      <div ref={cap} className="cosmic-caption" aria-live="polite" />
    </>
  );
}
