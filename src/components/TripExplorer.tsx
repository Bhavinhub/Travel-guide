import { useMemo, useState } from 'react';
import type { Destination } from '../data/types';
import { estimateTrip } from '../lib/estimate';
import { generateItinerary, layoutDay } from '../lib/itinerary';
import { navigate } from '../lib/router';
import { useMoney, useStore } from '../lib/store';
import { DEPARTURE_CITIES } from '../data/catalog';
import { nearestDeparture } from '../lib/tiers';
import { fmtDur } from '../lib/time';
import { fmtTime } from '../lib/time';
import { defaultConfig, type TripConfig } from '../lib/trip';

/**
 * Instant trip explorer: pick days, stay, food and transport style and the estimate
 * and day-by-day outline recompute immediately. Shows 1–4 day totals side by side.
 */
export function TripExplorer({ d }: { d: Destination }) {
  const money = useMoney();
  const startPlan = useStore((s) => s.startPlan);
  const [days, setDays] = useState(Math.max(1, Math.min(4, d.days[0])));
  const [tier, setTier] = useState<TripConfig['tier']>('comfortable');
  const [food, setFood] = useState<TripConfig['mealPlan']>('mixed');
  const [type, setType] = useState<TripConfig['transportType']>('any');
  const [dep, setDep] = useState(() => nearestDeparture(d));
  const base = { destIds: [d.id], departureId: dep, tier, mealPlan: food, transportType: type, localTransport: type === 'public' ? 'public' as const : 'private' as const };
  const totals = useMemo(() => [1, 2, 3, 4].map((n) => {
    const c = defaultConfig({ ...base, days: n });
    const g = generateItinerary(c);
    const e = estimateTrip(c, g.days);
    return { n, total: e.total, pp: e.perPerson, oneWay: g.outbound?.leg?.durationMin ?? 0 };
  }), [d.id, tier, food, type, dep]); // eslint-disable-line react-hooks/exhaustive-deps
  const plan = useMemo(() => {
    const c = defaultConfig({ ...base, days });
    const g = generateItinerary(c);
    return { c, g, e: estimateTrip(c, g.days) };
  }, [d.id, days, tier, food, type, dep]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section className="glass panel pad stack" aria-labelledby="tx">
      <div className="row between">
        <h2 id="tx" style={{ margin: 0, fontSize: '1.6rem' }}>How much is a trip to {d.name}?</h2>
        <span className="tag tag-sample">2 adults · illustrative</span>
      </div>
      <div className="pref-grid">
        <div className="field">
          <label htmlFor={`tx-dep-${d.id}`}>From</label>
          <select id={`tx-dep-${d.id}`} className="input" value={dep} onChange={(e) => setDep(e.target.value)}>
            {DEPARTURE_CITIES.filter((c) => c.name !== d.name).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <fieldset><legend>Stay</legend><div className="segmented">{(['budget', 'comfortable', 'premium', 'luxury'] as const).map((t) => <button key={t} aria-pressed={tier === t} onClick={() => setTier(t)}>{t === 'luxury' ? '5-star' : t === 'premium' ? '4-star' : t === 'comfortable' ? '3-star' : 'Budget'}</button>)}</div></fieldset>
        <fieldset><legend>Food</legend><div className="segmented">{([['local', 'Street food'], ['mixed', 'Mixed'], ['fine', 'Fine dining']] as const).map(([v, l]) => <button key={v} aria-pressed={food === v} onClick={() => setFood(v)}>{l}</button>)}</div></fieldset>
        <fieldset><legend>Transport</legend><div className="segmented">{([['any', 'Best'], ['public', 'Public'], ['private', 'Private']] as const).map(([v, l]) => <button key={v} aria-pressed={type === v} onClick={() => setType(v)}>{l}</button>)}</div></fieldset>
      </div>
      <div className="explore-totals" role="group" aria-label="Trip length">
        {totals.map((t) => (
          <button key={t.n} className={`total-chip ${days === t.n ? 'on' : ''}`} aria-pressed={days === t.n} onClick={() => setDays(t.n)}>
            <span>{t.n === 1 ? 'Day trip' : `${t.n} days`}</span>
            <b className="num">{money(t.total)}</b>
            <small>{money(t.pp)} pp</small>
            {t.n === 1 && t.oneWay > 300 && <small className="tag tag-warn">~{fmtDur(t.oneWay)} each way — long for a day trip</small>}
          </button>
        ))}
      </div>
      <div className="explore-days">
        {plan.g.days.map((day) => {
          const l = layoutDay(day, plan.c);
          const acts = l.rows.filter((r) => r.item.type === 'activity' || r.item.type === 'service' || r.item.type === 'transit');
          return (
            <div key={day.index} className="explore-day glass pad-sm">
              <div className="row between"><strong>Day {day.index + 1}</strong><span className="small num">{money(plan.e.daily[day.index]?.total ?? 0)}</span></div>
              <ul className="small" style={{ margin: '.4rem 0 0', paddingLeft: '1rem' }}>
                {acts.slice(0, 6).map((r) => <li key={r.item.uid}><span className="num muted">{fmtTime(r.start)}</span> {r.item.title}</li>)}
              </ul>
            </div>
          );
        })}
      </div>
      <div className="row">
        <button className="btn btn-primary" onClick={() => { startPlan(plan.c); navigate('/trip'); }} data-magnetic>See the full {days}-day trip →</button>
        <button className="btn" onClick={() => { startPlan(plan.c); navigate('/plan'); }}>Customise everything</button>
      </div>
    </section>
  );
}
