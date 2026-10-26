import { useMemo, useState } from 'react';
import { DEPARTURE_CITIES, DESTINATIONS, getDeparture } from '../data/catalog';
import type { Destination } from '../data/types';
import { DestImage } from '../components/DestImage';
import { estimateTrip } from '../lib/estimate';
import { gcKm, legOptions } from '../lib/geo';
import { generateItinerary, layoutDay } from '../lib/itinerary';
import { navigate } from '../lib/router';
import { useMoney, useStore } from '../lib/store';
import { fmtDur, fmtTime } from '../lib/time';
import { defaultConfig } from '../lib/trip';

type Cat = 'all' | 'nature' | 'road' | 'wellness' | 'adventure' | 'beach' | 'staycation';
const CATS: { id: Cat; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'nature', label: 'Nature' }, { id: 'road', label: 'Road trips' }, { id: 'wellness', label: 'Wellness' },
  { id: 'adventure', label: 'Adventure' }, { id: 'beach', label: 'Beaches' }, { id: 'staycation', label: 'Staycation' },
];

function WeekendCard({ d, depId, days }: { d: Destination; depId: string; days: 1 | 2 | 3 }) {
  const money = useMoney();
  const startPlan = useStore((s) => s.startPlan);
  const [show, setShow] = useState(false);
  const home = getDeparture(depId);
  const staycation = d.name === home.name;
  const info = useMemo(() => {
    const opts = staycation ? [] : legOptions(home, { name: d.name, lat: d.lat, lon: d.lon, tz: d.tz, country: d.country }, d, 'economy', 2);
    const c = defaultConfig({ departureId: depId, destIds: [d.id], days, pacing: 'balanced', interests: ['nature'] });
    const g = generateItinerary(c);
    const e = estimateTrip(c, g.days);
    const road = opts.find((o) => o.mode === 'car');
    return { opts, c, g, e, road };
  }, [d, depId, days, home, staycation]);
  const best = info.road
    ? info.road.durationMin > 300 ? 'Leave by 05:30 to beat city traffic and arrive by lunch' : 'Leave 06:00–07:00 to clear city traffic'
    : staycation ? 'Check in from early afternoon' : 'Take a morning flight / overnight train';
  const indoor = d.attractions.filter((a) => a.indoor).slice(0, 3);
  return (
    <article className="card glass" data-tilt>
      <div style={{ position: 'relative', aspectRatio: '16/9' }}><DestImage dest={d} /></div>
      <div className="pad stack" style={{ gap: '0.6rem' }}>
        <div className="row between"><h3 style={{ margin: 0 }}>{staycation ? `Staycation in ${d.name}` : d.name}</h3>{info.road && <span className="tag">~{info.road.km} km by road</span>}</div>
        <p className="small muted" style={{ margin: 0 }}>{d.tagline}</p>
        {!staycation && (
          <table className="cost-table small">
            <caption className="sr-only">Transport choices from {home.name}</caption>
            <tbody>{info.opts.map((o) => <tr key={o.mode}><td>{o.label}</td><td className="r">~{fmtDur(o.durationMin)}</td></tr>)}</tbody>
          </table>
        )}
        <p className="small" style={{ margin: 0 }}><strong>Best departure:</strong> {best}</p>
        <div className="row between">
          <span><strong className="num">{money(info.e.total)}</strong> <span className="tiny muted">for 2 · {days} day{days > 1 ? 's' : ''} (est.)</span></span>
        </div>
        {indoor.length > 0 && <p className="tiny muted" style={{ margin: 0 }}>☂ If it rains: {indoor.map((a) => a.name).join(' · ')}</p>}
        <div className="row">
          <button className="btn btn-sm" aria-expanded={show} onClick={() => setShow(!show)}>{show ? 'Hide' : 'Quick'} hourly plan</button>
          <button className="btn btn-primary btn-sm" onClick={() => { startPlan(info.c, `Weekend · ${d.name}`); navigate('/plan'); }}>View full plan</button>
        </div>
        {show && (
          <div className="stack small">
            {info.g.days.map((day) => {
              const l = layoutDay(day, info.c);
              return (
                <div key={day.index}>
                  <strong>Day {day.index + 1}: {day.title}</strong>
                  <ul style={{ margin: '0.3rem 0 0', paddingLeft: '1rem' }}>
                    {l.rows.filter((r) => r.item.type !== 'checkin').map((r) => <li key={r.item.uid}><span className="num">{fmtTime(r.start)}</span> {r.item.title}</li>)}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </article>
  );
}

export default function Weekend() {
  const [dep, setDep] = useState('bengaluru');
  const [days, setDays] = useState<1 | 2 | 3>(2);
  const [cat, setCat] = useState<Cat>('all');
  const home = getDeparture(dep);
  const list = useMemo(() => {
    // Reachability by estimated journey time: road first, short flights allowed for longer weekends.
    const roadLimit = days === 1 ? 225 : days === 2 ? 400 : 600;
    const flyLimit = days === 1 ? 0 : days === 2 ? 150 : 210;
    return DESTINATIONS.filter((d) => d.scope === 'india')
      .map((d) => {
        const opts = legOptions(home, { name: d.name, lat: d.lat, lon: d.lon, tz: d.tz, country: d.country }, d, 'economy', 2);
        const road = opts.find((o) => o.mode === 'car')?.durationMin ?? Infinity;
        const fly = opts.find((o) => o.mode === 'flight')?.durationMin ?? Infinity;
        return { d, km: gcKm(home, d), ok: road <= roadLimit || fly <= flyLimit };
      })
      .filter(({ d, ok }) => {
        const stay = d.name === home.name;
        if (cat === 'staycation') return stay;
        if (stay) return cat === 'all' && days > 1;
        if (!ok) return false;
        if (cat === 'nature') return d.interests.includes('nature') || d.interests.includes('mountains');
        if (cat === 'road') return d.access.road && gcKm(home, d) > 80;
        if (cat === 'wellness') return d.interests.includes('wellness');
        if (cat === 'adventure') return d.interests.includes('adventure');
        if (cat === 'beach') return d.interests.includes('beaches');
        return true;
      })
      .sort((a, b) => a.km - b.km)
      .map((x) => x.d);
  }, [home, days, cat]);
  return (
    <main className="page" id="main" tabIndex={-1}>
      <div className="page-bg" />
      <div className="wrap stack" style={{ gap: '2rem' }}>
        <header>
          <span className="eyebrow">Weekend Getaways</span>
          <h1 style={{ fontSize: 'clamp(2.2rem, 5vw, 4rem)', maxWidth: '18ch' }}>Close enough to go this Friday.</h1>
          <p className="lead">Pick where you’re leaving from and how long you have — we’ll show journey times, transport choices, the best time to set off and a ready hourly plan.</p>
        </header>
        <section className="glass panel pad row" style={{ gap: '1.2rem', alignItems: 'flex-end' }} aria-label="Weekend filters">
          <div className="field" style={{ minWidth: 200 }}>
            <label htmlFor="wk-dep">Departure city</label>
            <select id="wk-dep" className="input" value={dep} onChange={(e) => setDep(e.target.value)}>
              {DEPARTURE_CITIES.filter((c) => c.country === 'India').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <fieldset>
            <legend>Length</legend>
            <div className="segmented">
              {([1, 2, 3] as const).map((n) => <button key={n} aria-pressed={days === n} onClick={() => setDays(n)}>{n === 1 ? 'One-day outing' : n === 2 ? 'Two-day weekend' : 'Three-day long weekend'}</button>)}
            </div>
          </fieldset>
          <fieldset>
            <legend>Type</legend>
            <div className="row" style={{ gap: 6 }}>{CATS.map((c) => <button key={c.id} className="chip" aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>{c.label}</button>)}</div>
          </fieldset>
        </section>
        <p className="small muted" aria-live="polite">{list.length} escape{list.length === 1 ? '' : 's'} from {home.name}. Distances are estimated from straight-line distance with a road factor — check a live map before you drive.</p>
        <div className="grid grid-auto">{list.map((d) => <WeekendCard key={`${d.id}-${dep}-${days}`} d={d} depId={dep} days={days} />)}</div>
        {!list.length && <div className="notice">Nothing in the sample catalog fits this combination yet. Try a longer weekend or another type.</div>}
      </div>
    </main>
  );
}
