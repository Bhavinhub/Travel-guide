import { useEffect, useMemo, useRef, useState } from 'react';
import { feature } from 'topojson-client';
import type { Topology } from 'topojson-specification';
import land from 'world-atlas/land-110m.json';
import { DEPARTURE_CITIES, DESTINATIONS, getDeparture, INTEREST_LABELS, MOODS, mustDestination } from '../data/catalog';
import type { Destination, Interest, Mood } from '../data/types';
import { estimateTrip } from '../lib/estimate';
import { gcKm } from '../lib/geo';
import { generateItinerary } from '../lib/itinerary';
import { useMoney, useMotion, useStore } from '../lib/store';
import { defaultConfig, type TripConfig } from '../lib/trip';
import { Illustration } from './Illustration';
import { useMedia } from '../lib/media';

/* ——— Travel Mood Compass ——— */
export function MoodCompass({ onOpen }: { onOpen: (d: Destination, e?: { clientX: number; clientY: number }) => void }) {
  const [mood, setMood] = useState<Mood | null>(null);
  const idx = mood ? MOODS.findIndex((m) => m.id === mood) : 0;
  const picks = useMemo(() => (mood ? DESTINATIONS.filter((d) => d.moods.includes(mood)).slice(0, 8) : []), [mood]);
  return (
    <div className="grid grid-2" style={{ alignItems: 'center' }}>
      <div className="compass" role="group" aria-label="Travel Mood Compass">
        <div className="compass-face" aria-hidden />
        <div className="compass-needle" aria-hidden style={{ transform: `rotate(${180 + idx * 60}deg)` }} />
        <div className="compass-center" aria-hidden />
        {MOODS.map((m, i) => {
          const a = (i / MOODS.length) * Math.PI * 2 - Math.PI / 2;
          return (
            <button
              key={m.id}
              className={`chip compass-btn ${mood === m.id ? 'is-on' : ''}`}
              aria-pressed={mood === m.id}
              style={{ left: `${50 + Math.cos(a) * 40}%`, top: `${50 + Math.sin(a) * 40}%` }}
              onClick={() => setMood(m.id)}
            >
              <span aria-hidden>{m.icon}</span> {m.id}
            </button>
          );
        })}
      </div>
      <div aria-live="polite">
        {!mood && <p className="lead">Choose a mood on the compass to see where it points.</p>}
        {mood && (
          <>
            <h3>{mood}: {MOODS[idx].blurb}</h3>
            <div className="dest-list" style={{ maxHeight: 360 }}>
              {picks.map((d) => (
                <button key={d.id} onClick={(e) => onOpen(d, e)}>
                  <span><b>{d.name}</b> <span className="tiny muted">· {d.scope === 'india' ? d.state : d.country}</span><br /><span className="small muted">{d.tagline}</span></span>
                  <span aria-hidden>→</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ——— Surprise Me ——— */
export function SurpriseMe({ onOpen }: { onOpen: (d: Destination, e?: { clientX: number; clientY: number }) => void }) {
  const money = useMoney();
  const [dep, setDep] = useState('bengaluru');
  const [days, setDays] = useState(3);
  const [budget, setBudget] = useState(30000);
  const [interests, setInterests] = useState<Interest[]>(['nature']);
  const [result, setResult] = useState<{ d: Destination; pp: number; why: string[] }[] | null>(null);
  const [pick, setPick] = useState(0);
  const run = () => {
    const month = new Date().getMonth() + 2 > 12 ? 1 : new Date().getMonth() + 2;
    const home = getDeparture(dep);
    const scored = DESTINATIONS.filter((d) => d.days[0] <= days && d.name !== home.name).map((d) => {
      const c = defaultConfig({ departureId: dep, destIds: [d.id], days: Math.min(days, Math.max(1, d.days[1])), interests });
      const g = generateItinerary(c);
      const e = estimateTrip(c, g.days);
      const overlap = d.interests.filter((i) => interests.includes(i)).length;
      const km = gcKm(home, d);
      const why: string[] = [];
      let s = overlap * 3;
      if (overlap) why.push(`Matches ${d.interests.filter((i) => interests.includes(i)).map((i) => INTEREST_LABELS[i].toLowerCase()).join(', ')}`);
      if (d.bestMonths.includes(month)) { s += 2; why.push('Good season next month'); }
      if (e.perPerson <= budget) { s += 3; why.push(`Est. ${money(e.perPerson)} per person`); } else s -= ((e.perPerson - budget) / budget) * 6;
      if (days <= 3 && km > 1500) s -= 3;
      if (days <= 3 && km < 400) { s += 1.5; why.push('Short journey for a quick break'); }
      return { d, pp: e.perPerson, why, s };
    }).sort((a, b) => b.s - a.s).slice(0, 4);
    setResult(scored);
    setPick(Math.floor(Math.random() * Math.min(3, scored.length)));
  };
  const chosen = result?.[pick];
  return (
    <div className="grid grid-2" style={{ alignItems: 'start' }}>
      <form className="glass panel pad stack" onSubmit={(e) => { e.preventDefault(); run(); }}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="sm-dep">Departure city</label>
            <select id="sm-dep" className="input" value={dep} onChange={(e) => setDep(e.target.value)}>
              {DEPARTURE_CITIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="sm-days">Available days</label>
            <input id="sm-days" className="input" type="number" min={1} max={14} value={days} onChange={(e) => setDays(Math.max(1, Math.min(14, Number(e.target.value) || 1)))} />
          </div>
          <div className="field full">
            <label htmlFor="sm-budget">Budget per person: {money(budget)}</label>
            <input id="sm-budget" type="range" min={5000} max={300000} step={5000} value={budget} onChange={(e) => setBudget(Number(e.target.value))} />
          </div>
        </div>
        <fieldset>
          <legend>Interests</legend>
          <div className="row" style={{ gap: '0.4rem' }}>
            {(['nature', 'beaches', 'mountains', 'culture', 'adventure', 'romance', 'nightlife', 'food'] as Interest[]).map((i) => (
              <button type="button" key={i} className="chip" aria-pressed={interests.includes(i)} onClick={() => setInterests((x) => (x.includes(i) ? x.filter((y) => y !== i) : [...x, i]))}>{INTEREST_LABELS[i]}</button>
            ))}
          </div>
        </fieldset>
        <button className="btn btn-primary" type="submit" data-magnetic>✦ Surprise me</button>
        <p className="tiny muted">Suggestions use the sample dataset and illustrative prices for 2 adults.</p>
      </form>
      <div aria-live="polite">
        {chosen && (
          <div className="glass card fade-in" key={chosen.d.id}>
            <div style={{ position: 'relative', aspectRatio: '16/9' }}><SurpriseImage d={chosen.d} /></div>
            <div className="pad">
              <span className="eyebrow">Your surprise</span>
              <h3>{chosen.d.name}</h3>
              <p className="muted">{chosen.d.why}</p>
              <ul className="small">{chosen.why.map((w) => <li key={w}>{w}</li>)}</ul>
              <div className="row">
                <button className="btn btn-primary" onClick={(e) => onOpen(chosen.d, e)}>Open portal</button>
                <button className="btn" onClick={() => setPick((p) => (p + 1) % (result?.length || 1))}>Another idea</button>
              </div>
            </div>
          </div>
        )}
        {result && !result.length && <p className="muted">Nothing fits — try more days or a higher budget.</p>}
      </div>
    </div>
  );
}
function SurpriseImage({ d }: { d: Destination }) {
  const m = useMedia(d.wiki, 1);
  return m.lead ? <img src={m.lead.srcLarge} alt={d.name} style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }} /> : <Illustration scene={d.scene} accent={d.accent} />;
}

/* ——— Animated Journey Route (schematic map) ——— */
const LAND = (() => {
  const topo = land as unknown as Topology;
  return feature(topo, topo.objects.land as any) as unknown as GeoJSON.FeatureCollection<GeoJSON.MultiPolygon | GeoJSON.Polygon>;
})();

export function RouteMap({ config, height = 320 }: { config: TripConfig; height?: number }) {
  const { reduced } = useMotion();
  const home = getDeparture(config.departureId);
  const stops = [{ name: home.name, lat: home.lat, lon: home.lon }, ...config.destIds.map((id) => mustDestination(id)).map((d) => ({ name: d.name, lat: d.lat, lon: d.lon }))];
  const W = 640;
  const H = height * 2;
  const lats = stops.map((s) => s.lat);
  const lons = stops.map((s) => s.lon);
  let minLat = Math.min(...lats), maxLat = Math.max(...lats), minLon = Math.min(...lons), maxLon = Math.max(...lons);
  const padLat = Math.max(2.5, (maxLat - minLat) * 0.35);
  const padLon = Math.max(3, (maxLon - minLon) * 0.25);
  minLat -= padLat; maxLat += padLat; minLon -= padLon; maxLon += padLon;
  // Keep aspect ratio (approximate equirectangular with latitude scaling).
  const k = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const spanLon = maxLon - minLon;
  const spanLat = maxLat - minLat;
  const scale = Math.min(W / (spanLon * k), H / spanLat);
  const cx = (minLon + maxLon) / 2;
  const cy = (minLat + maxLat) / 2;
  const P = (lat: number, lon: number) => [W / 2 + (lon - cx) * k * scale, H / 2 - (lat - cy) * scale] as const;
  const landPath = useMemo(() => {
    let d = '';
    LAND.features.forEach((f) => {
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      polys.forEach((poly) => poly.forEach((ring) => {
        ring.forEach(([lon, lat], i) => {
          const [x, y] = P(lat, lon);
          d += `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
        });
        d += 'Z';
      }));
    });
    return d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minLat, maxLat, minLon, maxLon]);
  const legs = [...stops.map((s, i) => [s, stops[i + 1] ?? stops[0]] as const)].filter(([a, b]) => a !== b);
  const pathRef = useRef<SVGPathElement[]>([]);
  const [lens, setLens] = useState<number[]>([]);
  useEffect(() => setLens(pathRef.current.map((p) => p?.getTotalLength() ?? 0)), [config.destIds.join(','), config.departureId]);
  return (
    <figure style={{ margin: 0 }}>
      <svg className="route-map" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Schematic route: ${stops.map((s) => s.name).join(' → ')} → ${home.name}`}>
        <path d={landPath} fill="#1d4a44" stroke="#3f7f72" strokeWidth={0.8} />
        {legs.map(([a, b], i) => {
          const [x1, y1] = P(a.lat, a.lon);
          const [x2, y2] = P(b.lat, b.lon);
          const mx = (x1 + x2) / 2 - (y2 - y1) * 0.18 * (i % 2 ? -1 : 1);
          const my = (y1 + y2) / 2 + (x2 - x1) * 0.18 * (i % 2 ? -1 : 1);
          return (
            <path key={`${config.destIds.join()}-${i}`} ref={(el) => { if (el) pathRef.current[i] = el; }} d={`M${x1},${y1} Q${mx},${my} ${x2},${y2}`}
              className={`route-path ${reduced || !lens[i] ? '' : 'animate'}`} style={{ ['--len' as string]: lens[i] || 0, animationDelay: `${i * 0.6}s`, opacity: i === legs.length - 1 && legs.length > 1 ? 0.55 : 1 }} />
          );
        })}
        {stops.map((s, i) => {
          const [x, y] = P(s.lat, s.lon);
          return (
            <g key={s.name + i}>
              <circle cx={x} cy={y} r={i ? 7 : 9} fill={i ? '#f4c56a' : '#9fe0b8'} stroke="#08111f" strokeWidth={3} />
              <text x={x + 12} y={y + 5} fill="#eef5f3" fontSize={18} fontWeight={600} style={{ paintOrder: 'stroke', stroke: '#08111f', strokeWidth: 4 }}>{i ? `${i}. ` : ''}{s.name}</text>
            </g>
          );
        })}
      </svg>
      <figcaption className="tiny muted" style={{ marginTop: '0.4rem' }}>Schematic route map (not to scale for roads). Coastlines: Natural Earth via world-atlas.</figcaption>
    </figure>
  );
}

/* ——— Budget Comfort Meter ——— */
export function BudgetMeter({ config, perPerson, onBudget }: { config: TripConfig; perPerson: number; onBudget: (v: number) => void }) {
  const money = useMoney();
  const target = config.budgetPerPersonINR;
  const ratio = perPerson / Math.max(1, target);
  const zone = ratio < 0.85 ? { label: 'Comfortable', cls: 'tag-ok' } : ratio <= 1.05 ? { label: 'On the edge', cls: 'tag-warn' } : { label: 'Over budget', cls: 'tag-warn' };
  const deltas = useMemo(() => {
    const base = estimateTrip(config, generateItinerary(config).days).perPerson;
    const tiers = ['budget', 'comfortable', 'premium', 'luxury'] as const;
    const ti = tiers.indexOf(config.tier);
    const alts: { label: string; c: TripConfig }[] = [];
    if (ti < 3) alts.push({ label: `Upgrade stay to ${tiers[ti + 1]}`, c: { ...config, tier: tiers[ti + 1] } });
    if (ti > 0) alts.push({ label: `Downgrade stay to ${tiers[ti - 1]}`, c: { ...config, tier: tiers[ti - 1] } });
    alts.push({ label: config.guide === 'none' ? 'Add a full-day guide' : 'Remove guide', c: { ...config, guide: config.guide === 'none' ? 'full' : 'none' } });
    alts.push({ label: config.localTransport === 'private' ? 'Use public transport locally' : 'Private car locally', c: { ...config, localTransport: config.localTransport === 'private' ? 'public' : 'private' } });
    alts.push({ label: config.includeAdventure ? 'Skip adventure activities' : 'Include adventure activities', c: { ...config, includeAdventure: !config.includeAdventure } });
    return alts.map((a) => ({ label: a.label, delta: estimateTrip(a.c, generateItinerary(a.c).days).perPerson - base }));
  }, [config]);
  return (
    <div className="stack">
      <div className="row between">
        <h4 style={{ margin: 0 }}>Budget Comfort Meter</h4>
        <span className={`tag ${zone.cls}`}>{zone.label}</span>
      </div>
      <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={150} aria-valuenow={Math.round(ratio * 100)} aria-label="Estimated spend as a share of your budget">
        <i style={{ width: `${Math.min(100, ratio * 100)}%`, background: ratio > 1.05 ? 'linear-gradient(90deg,#f4c56a,#ff8f7a)' : undefined }} />
      </div>
      <p className="small muted" style={{ margin: 0 }}>{money(perPerson)} per person vs. your budget of {money(target)} ({Math.round(ratio * 100)}%).</p>
      <div className="field">
        <label htmlFor="bm-target">Your budget per person</label>
        <input id="bm-target" type="range" min={5000} max={500000} step={2500} value={target} onChange={(e) => onBudget(Number(e.target.value))} />
      </div>
      <table className="cost-table small">
        <caption className="sr-only">Effect of upgrades on estimated cost per person</caption>
        <tbody>
          {deltas.map((d) => (
            <tr key={d.label}><td>{d.label}</td><td className="r" style={{ color: d.delta > 0 ? 'var(--warn)' : 'var(--ok)' }}>{d.delta >= 0 ? '+' : '−'}{money(Math.abs(d.delta))} pp</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ——— Atmosphere Preview (illustrative, not live weather) ——— */
export function AtmospherePreview({ d }: { d: Destination }) {
  const m = useMedia(d.wiki, 4);
  const { reduced } = useMotion();
  const modes = ['daylight', 'sunset', 'rain', ...(d.scene === 'snow' || d.scene === 'mountain' ? ['snow'] : [])] as const;
  const [mode, setMode] = useState<(typeof modes)[number]>('daylight');
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    let raf = 0;
    const W = (c.width = c.offsetWidth);
    const H = (c.height = c.offsetHeight);
    const parts = Array.from({ length: mode === 'rain' ? 220 : mode === 'snow' ? 140 : 0 }, () => ({ x: Math.random() * W, y: Math.random() * H, v: 0.5 + Math.random() }));
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      parts.forEach((p) => {
        if (mode === 'rain') {
          ctx.strokeStyle = 'rgba(220,235,255,0.55)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - 2, p.y + 14);
          ctx.stroke();
          p.y += 14 * p.v; p.x -= 1;
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.beginPath();
          ctx.arc(p.x, p.y, 1.6 * p.v + 0.6, 0, 6.28);
          ctx.fill();
          p.y += 1.1 * p.v; p.x += Math.sin(p.y * 0.03) * 0.6;
        }
        if (p.y > H) { p.y = -10; p.x = Math.random() * W; }
      });
      if (!reduced) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [mode, reduced]);
  const wash = { daylight: 'transparent', sunset: 'linear-gradient(180deg, rgba(255,140,80,0.35), rgba(120,40,90,0.35))', rain: 'linear-gradient(180deg, rgba(40,55,70,0.55), rgba(20,30,40,0.35))', snow: 'linear-gradient(180deg, rgba(220,235,255,0.35), rgba(200,220,240,0.25))' }[mode];
  const filter = { daylight: 'none', sunset: 'saturate(1.2) sepia(0.25)', rain: 'saturate(0.6) brightness(0.8)', snow: 'saturate(0.5) brightness(1.1)' }[mode];
  return (
    <div className="stack">
      <div className="row between">
        <h3 style={{ margin: 0 }}>Atmosphere Preview</h3>
        <div className="segmented" role="group" aria-label="Preview conditions">
          {modes.map((x) => <button key={x} aria-pressed={mode === x} onClick={() => setMode(x)}>{x[0].toUpperCase() + x.slice(1)}</button>)}
        </div>
      </div>
      <div className="atmo-preview">
        {m.gallery[1] || m.lead ? <img src={(m.gallery[1] ?? m.lead)!.srcLarge} alt={`${d.name} (photo, recoloured for preview)`} style={{ filter }} /> : <Illustration scene={d.scene} accent={d.accent} />}
        <div className="wash" style={{ background: wash }} />
        <canvas ref={canvas} aria-hidden />
        <span className="tag tag-sample label">Illustrative visual preview — not live weather</span>
      </div>
    </div>
  );
}

/* ——— Passport stamp ——— */
export function Stamp({ d, at, i }: { d: Destination; at: string; i: number }) {
  return (
    <div className="stamp" style={{ ['--sa' as string]: d.accent, ['--rot' as string]: `${(i % 5) * 4 - 8}deg` }}>
      <div>
        <small>{d.scope === 'india' ? 'India' : d.country}</small>
        <b>{d.name}</b>
        <small>{new Date(at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</small>
      </div>
    </div>
  );
}

export function usePassport() {
  return useStore((s) => s.passport);
}
