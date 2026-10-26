import { useMemo, useState } from 'react';
import { getDestination, MONTHS } from '../data/catalog';
import { getService, SERVICES } from '../data/services';
import type { Destination } from '../data/types';
import { DestImage } from '../components/DestImage';
import { usePortal } from '../components/discovery';
import { estimateTrip } from '../lib/estimate';
import { generateItinerary, priceLevel } from '../lib/itinerary';
import { navigate } from '../lib/router';
import { useMoney, useStore } from '../lib/store';
import { defaultConfig } from '../lib/trip';

/** Curated honeymoon set with qualitative attributes (editorial judgement, not ratings). */
const HONEYMOONS: { id: string; region: string; setting: 'beach' | 'mountain' | 'city' | 'lake'; privacy: 1 | 2 | 3; resorts: boolean; adventure: boolean; story: string }[] = [
  { id: 'udaipur', region: 'Udaipur, Rajasthan', setting: 'lake', privacy: 2, resorts: true, adventure: false, story: 'Lake-palace sunsets, heritage suites and rooftop dinners above Lake Pichola.' },
  { id: 'munnar', region: 'Kerala — Munnar', setting: 'mountain', privacy: 3, resorts: true, adventure: true, story: 'Mist over tea hills, plantation bungalows and sunrise jeep rides.' },
  { id: 'alleppey', region: 'Kerala — Alleppey', setting: 'lake', privacy: 3, resorts: true, adventure: false, story: 'A private houseboat drifting through palm-fringed backwaters.' },
  { id: 'srinagar', region: 'Kashmir — Srinagar & Gulmarg', setting: 'mountain', privacy: 2, resorts: false, adventure: true, story: 'Shikara rides at dusk, Mughal gardens and a gondola into the snow.' },
  { id: 'havelock', region: 'Andaman — Swaraj Dweep', setting: 'beach', privacy: 3, resorts: true, adventure: true, story: 'Radhanagar’s famous sunset and reef dives in clear water.' },
  { id: 'bali', region: 'Bali, Indonesia', setting: 'beach', privacy: 3, resorts: true, adventure: true, story: 'Jungle villas in Ubud, cliff-top temples and a volcano sunrise.' },
  { id: 'male', region: 'Maldives — North Malé Atoll', setting: 'beach', privacy: 3, resorts: true, adventure: false, story: 'Overwater villas, house reefs and sandbank picnics.' },
  { id: 'baa-atoll', region: 'Maldives — Baa Atoll', setting: 'beach', privacy: 3, resorts: true, adventure: true, story: 'Secluded islands in a UNESCO biosphere, with seasonal mantas.' },
  { id: 'phuket', region: 'Phuket, Thailand', setting: 'beach', privacy: 2, resorts: true, adventure: true, story: 'Limestone bays by boat, then sunset at Promthep Cape.' },
  { id: 'paris', region: 'Paris, France', setting: 'city', privacy: 1, resorts: false, adventure: false, story: 'Seine cruises, café mornings and the Eiffel Tower sparkling at night.' },
  { id: 'interlaken', region: 'Switzerland — Interlaken', setting: 'mountain', privacy: 2, resorts: true, adventure: true, story: 'Turquoise lakes, glacier trains and paragliding over the valley.' },
  { id: 'lucerne', region: 'Switzerland — Lucerne', setting: 'lake', privacy: 2, resorts: true, adventure: false, story: 'Medieval bridges, lake steamers and Alpine summits by day.' },
];

const ROMANCE = SERVICES.filter((s) => s.group === 'honeymoon');

function HoneymoonCard({ h, d, extras, onOpen }: { h: (typeof HONEYMOONS)[number]; d: Destination; extras: string[]; onOpen: (d: Destination, e: React.MouseEvent) => void }) {
  const money = useMoney();
  const startPlan = useStore((s) => s.startPlan);
  const days = Math.max(4, d.days[1]);
  const est = useMemo(() => {
    const services = Object.fromEntries(extras.filter((x) => (d.romanceExtras ?? []).includes(x)).map((x) => [x, 1]));
    const c = defaultConfig({ destIds: [d.id], days, adults: 2, rooms: 1, tier: 'premium', pacing: 'relaxed', interests: ['romance'], services });
    return { c, e: estimateTrip(c, generateItinerary(c).days) };
  }, [d, extras, days]);
  const pl = priceLevel(d);
  return (
    <article className="card glass" data-tilt style={{ ['--dest-accent' as string]: d.accent }}>
      <div style={{ position: 'relative', aspectRatio: '16/10' }}><DestImage dest={d} /></div>
      <div className="pad stack" style={{ gap: '0.6rem' }}>
        <span className="tiny muted">{h.region}</span>
        <h3 style={{ margin: 0 }}>{d.name}</h3>
        <p className="small muted" style={{ margin: 0 }}>{h.story}</p>
        <div className="row" style={{ gap: 6 }}>
          <span className="tag">{h.setting}</span>
          <span className="tag">Privacy {'●'.repeat(h.privacy)}{'○'.repeat(3 - h.privacy)}</span>
          {h.resorts && <span className="tag">Resort stays</span>}
          {h.adventure && <span className="tag">Adventure options</span>}
          <span className="tag">Best {d.bestMonths.slice(0, 3).map((m) => MONTHS[m - 1]).join(', ')}</span>
        </div>
        <table className="cost-table small">
          <caption className="sr-only">Optional extras and estimated cost for {d.name}</caption>
          <tbody>
            {ROMANCE.map((s) => {
              const avail = (d.romanceExtras ?? []).includes(s.id);
              return <tr key={s.id}><td>{s.name}</td><td className="r">{avail ? `~${money(Math.round(s.baseINR * pl))}` : <span className="muted">not offered</span>}</td></tr>;
            })}
          </tbody>
        </table>
        <div className="row between">
          <div><strong className="num">{money(est.e.total)}</strong> <span className="tiny muted">for 2 · {days} days · premium stay (est.)</span></div>
        </div>
        <div className="row">
          <button className="btn btn-primary btn-sm" onClick={() => { startPlan(est.c, `Honeymoon · ${d.name}`); navigate('/plan'); }}>Plan honeymoon</button>
          <button className="btn btn-sm" onClick={(e) => onOpen(d, e)}>Preview</button>
        </div>
      </div>
    </article>
  );
}

export default function Honeymoon() {
  const portal = usePortal();
  const [setting, setSetting] = useState<'all' | 'beach' | 'mountain'>('all');
  const [privacy, setPrivacy] = useState(false);
  const [resorts, setResorts] = useState(false);
  const [adventure, setAdventure] = useState(false);
  const [maxDays, setMaxDays] = useState(0);
  const [budget, setBudget] = useState(0);
  const [extras, setExtras] = useState<string[]>(['candlelight', 'spa']);
  const money = useMoney();
  const list = HONEYMOONS.filter((h) => {
    const d = getDestination(h.id)!;
    if (setting !== 'all' && h.setting !== setting) return false;
    if (privacy && h.privacy < 3) return false;
    if (resorts && !h.resorts) return false;
    if (adventure && !h.adventure) return false;
    if (maxDays && d.days[0] > maxDays) return false;
    if (budget && d.cost.room.premium > budget) return false;
    return true;
  });
  return (
    <main className="page romance-bg" id="main" tabIndex={-1}>
      <div className="wrap stack" style={{ gap: '2rem' }}>
        <header className="editorial">
          <div>
            <span className="eyebrow" style={{ color: 'var(--rose)' }}>Honeymoon Escapes</span>
            <h1 style={{ fontSize: 'clamp(2.4rem, 5.5vw, 4.4rem)' }}>The beginning of every story deserves a beautiful setting.</h1>
            <p className="lead">Lake palaces, tea-hill hideaways, coral islands and Alpine villages — each with transparent estimates for the extras that make it yours.</p>
          </div>
          <div className="glass panel pad small">
            <strong>About these picks</strong>
            <p className="muted" style={{ margin: '0.4rem 0 0' }}>Privacy and resort labels are Travel Guide’s editorial judgement, not guest ratings. Extras are illustrative prices scaled to each destination; availability must be confirmed with the property.</p>
          </div>
        </header>

        <section className="glass panel pad stack" aria-label="Honeymoon filters">
          <div className="row" style={{ gap: '1rem', alignItems: 'flex-end' }}>
            <fieldset>
              <legend>Setting</legend>
              <div className="segmented">
                {(['all', 'beach', 'mountain'] as const).map((s) => <button key={s} aria-pressed={setting === s} onClick={() => setSetting(s)}>{s === 'all' ? 'All' : s === 'beach' ? 'Beaches' : 'Mountains'}</button>)}
              </div>
            </fieldset>
            <button className="chip" aria-pressed={privacy} onClick={() => setPrivacy(!privacy)}>Most private</button>
            <button className="chip" aria-pressed={resorts} onClick={() => setResorts(!resorts)}>Resorts</button>
            <button className="chip" aria-pressed={adventure} onClick={() => setAdventure(!adventure)}>Adventure</button>
            <div className="field">
              <label htmlFor="hm-days">Duration</label>
              <select id="hm-days" className="input" value={maxDays} onChange={(e) => setMaxDays(Number(e.target.value))}>
                <option value={0}>Any</option><option value={3}>Up to 3 days</option><option value={5}>Up to 5 days</option><option value={7}>A week</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="hm-budget">Premium room budget / night</label>
              <select id="hm-budget" className="input" value={budget} onChange={(e) => setBudget(Number(e.target.value))}>
                <option value={0}>Any</option><option value={12000}>Up to {money(12000)}</option><option value={25000}>Up to {money(25000)}</option><option value={45000}>Up to {money(45000)}</option>
              </select>
            </div>
          </div>
          <fieldset>
            <legend>Include these extras in the estimate</legend>
            <div className="row" style={{ gap: 6 }}>
              {ROMANCE.map((s) => <button key={s.id} className="chip" aria-pressed={extras.includes(s.id)} onClick={() => setExtras((x) => (x.includes(s.id) ? x.filter((y) => y !== s.id) : [...x, s.id]))}>{s.name}</button>)}
            </div>
            <p className="hint" style={{ marginTop: 6 }}>Each extra is costed separately on the cards below; {getService('cruise')!.name.toLowerCase()}s are only included where cruises operate.</p>
          </fieldset>
        </section>

        <p className="small muted" aria-live="polite">{list.length} escape{list.length === 1 ? '' : 's'}</p>
        <div className="grid grid-auto">
          {list.map((h) => <HoneymoonCard key={h.id} h={h} d={getDestination(h.id)!} extras={extras} onOpen={portal.open} />)}
        </div>
        {!list.length && <div className="notice">No escapes match all filters — try removing one.</div>}
      </div>
      {portal.node}
    </main>
  );
}
