import { useMemo, useState } from 'react';
import { getDestination } from '../data/catalog';
import { NIGHT_TYPE_LABELS, NIGHTLIFE, NIGHTLIFE_CITIES } from '../data/nightlife';
import type { NightlifeListing } from '../data/types';
import { useMedia } from '../lib/media';
import { navigate } from '../lib/router';
import { useMoney, useStore } from '../lib/store';
import { Illustration } from '../components/Illustration';

type F = 'rooftop' | 'beachside' | 'live-music' | 'relaxed' | 'dancing' | 'private-events';
const FILTERS: F[] = ['rooftop', 'beachside', 'live-music', 'relaxed', 'dancing', 'private-events'];

function Listing({ n }: { n: NightlifeListing }) {
  const money = useMoney();
  const m = useMedia(n.wiki, 1);
  const startPlan = useStore((s) => s.startPlan);
  const city = getDestination(n.city)!;
  return (
    <article className="card glass">
      <div style={{ position: 'relative', aspectRatio: '16/9', background: '#0f1a2a' }}>
        {m.lead ? <img src={m.lead.src} alt={`${n.area} — neighbourhood photo`} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : m.status !== 'loading' && <Illustration scene="city" />}
        <span className="media-credit" style={{ left: 8, right: 'auto' }}>Area photo, not a specific venue</span>
        {m.lead && <a className="media-credit" href={m.lead.page} target="_blank" rel="noreferrer">{m.lead.author?.slice(0, 28) ?? 'Wikimedia Commons'}{m.lead.license ? ` · ${m.lead.license}` : ''}</a>}
      </div>
      <div className="pad stack" style={{ gap: '0.55rem' }}>
        <span className="tiny muted">{city.name} · {n.area}</span>
        <h3 style={{ margin: 0 }}>{n.title}</h3>
        <div className="row" style={{ gap: 6 }}>{n.types.map((t) => <span key={t} className="tag">{NIGHT_TYPE_LABELS[t]}</span>)}</div>
        <p className="small" style={{ margin: 0 }}>{n.atmosphere}</p>
        <dl className="small" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.25rem 0.8rem', margin: 0 }}>
          <dt className="muted">Music</dt><dd style={{ margin: 0 }}>{n.music}</dd>
          <dt className="muted">Typical spend</dt><dd style={{ margin: 0 }}>{money(n.spendINR[0])}–{money(n.spendINR[1])} pp <span className="tag tag-sample">illustrative</span></dd>
          <dt className="muted">Getting there</dt><dd style={{ margin: 0 }}>{n.transport}</dd>
          <dt className="muted">Getting back</dt><dd style={{ margin: 0 }}>{n.returnTip}</dd>
          <dt className="muted">Alcohol-free</dt><dd style={{ margin: 0 }}>{n.alcoholFree}</dd>
          <dt className="muted">Private parties</dt><dd style={{ margin: 0 }}>{n.types.includes('private-events') ? 'Some venues in this area take private bookings — not verified by Travel Guide; confirm directly with the venue.' : 'Not known for private events.'}</dd>
          <dt className="muted">Hours & entry</dt><dd style={{ margin: 0 }}>Not verified — venues change hours, cover charges and dress codes. Check before you go.</dd>
          <dt className="muted">Reservations</dt><dd style={{ margin: 0 }}>No verified reservation links yet.</dd>
        </dl>
        <button className="btn btn-sm" onClick={() => { startPlan({ destIds: [n.city], days: Math.max(2, city.days[0]), services: { 'night-out': 1, 'night-return': 1 }, interests: ['nightlife'] }, `${city.name} nights`); navigate('/plan'); }}>Add a night out to a {city.name} plan</button>
      </div>
    </article>
  );
}

export default function Nightlife() {
  const [city, setCity] = useState<string>('all');
  const [filters, setFilters] = useState<F[]>([]);
  const list = useMemo(() => NIGHTLIFE.filter((n) => (city === 'all' || n.city === city) && filters.every((f) => n.types.includes(f as never))), [city, filters]);
  return (
    <main className="page" id="main" tabIndex={-1}>
      <div className="page-bg" style={{ background: 'radial-gradient(60% 50% at 80% 0%, rgba(201,182,255,0.25), transparent 60%), radial-gradient(60% 40% at 0% 100%, rgba(244,197,106,0.12), transparent 60%), #070b16' }} />
      <div className="wrap stack" style={{ gap: '2rem' }}>
        <header className="editorial">
          <div>
            <span className="eyebrow">Nightlife & Cocktail Experiences</span>
            <h1 style={{ fontSize: 'clamp(2.2rem, 5vw, 4rem)' }}>After dark, city by city.</h1>
            <p className="lead">Rooftop lounges, cocktail bars, live-music rooms and beach clubs — organised by neighbourhood, with honest notes on what we haven’t verified.</p>
          </div>
          <div className="notice small">
            <strong>Please drink responsibly.</strong> Legal drinking ages and alcohol rules differ by state and country (some places, such as Rishikesh or Maldivian local islands, restrict alcohol). Carry ID, never drink and drive, and plan your ride home.
          </div>
        </header>
        <section className="glass panel pad stack" aria-label="Nightlife filters">
          <div className="tabs" role="tablist" aria-label="City">
            <button role="tab" aria-selected={city === 'all'} onClick={() => setCity('all')}>All cities</button>
            {NIGHTLIFE_CITIES.map((c) => <button key={c} role="tab" aria-selected={city === c} onClick={() => setCity(c)}>{getDestination(c)?.name}</button>)}
          </div>
          <div className="row" style={{ gap: 6 }}>
            {FILTERS.map((f) => <button key={f} className="chip" aria-pressed={filters.includes(f)} onClick={() => setFilters((x) => (x.includes(f) ? x.filter((y) => y !== f) : [...x, f]))}>{NIGHT_TYPE_LABELS[f]}</button>)}
          </div>
        </section>
        <p className="small muted" aria-live="polite">{list.length} area{list.length === 1 ? '' : 's'} · listings describe neighbourhoods and experience types, not specific venues.</p>
        <div className="grid grid-auto">{list.map((n) => <Listing key={n.id} n={n} />)}</div>
        {!list.length && <div className="notice">No areas match these filters.</div>}
      </div>
    </main>
  );
}
