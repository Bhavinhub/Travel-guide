import { useMemo, useState } from 'react';
import { DESTINATIONS, indiaHierarchy, KIND_LABEL, worldHierarchy } from '../data/catalog';
import { DestinationCard, DestinationFinder, usePortal } from '../components/discovery';
import { href } from '../lib/router';
import { useMoney } from '../lib/store';
import { quickEstimate } from '../lib/tiers';
import { DestImage } from '../components/DestImage';

export default function Explore({ scope }: { scope: 'india' | 'world' }) {
  const portal = usePortal();
  const list = useMemo(() => DESTINATIONS.filter((d) => d.scope === scope), [scope]);
  const india = scope === 'india' ? indiaHierarchy() : [];
  const world = scope === 'world' ? worldHierarchy() : [];
  const money = useMoney();
  const groups = scope === 'india' ? [...new Set(list.map((d) => d.state!))].sort() : [...new Set(list.map((d) => d.country))].sort();
  const [pick, setPick] = useState<string>('all');
  const top = list
    .filter((d) => pick === 'all' || (scope === 'india' ? d.state : d.country) === pick)
    .map((d) => ({ d, score: Object.values(d.suitability).reduce((a, b) => a + b, 0) + d.interests.length * 0.3 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 9)
    .map((x) => x.d);
  return (
    <main className="page" id="main" tabIndex={-1}>
      <div className="page-bg" />
      <div className="wrap stack" style={{ gap: '2rem' }}>
        <header className="editorial">
          <div>
            <span className="eyebrow">{scope === 'india' ? 'Explore India' : 'Explore the World'}</span>
            <h1 style={{ fontSize: 'clamp(2.2rem, 5vw, 4rem)' }}>{scope === 'india' ? 'From Himalayan passes to coral islands.' : 'Cities, islands and Alpine valleys.'}</h1>
            <p className="lead">
              {scope === 'india'
                ? 'Browse by state or union territory, then by destination and its nearby attractions.'
                : 'Browse by continent, then country, then destination and attractions.'}
            </p>
            <p className="small muted">This is a curated selection of {list.length} destinations, not an exhaustive list. Prices are illustrative.</p>
          </div>
          <div className="glass panel pad small">
            <strong>How places are labelled</strong>
            <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.1rem' }}>
              <li><b>City</b> — a single city (e.g. Mumbai, Bangkok)</li>
              <li><b>Town</b> — a smaller town or hill station</li>
              <li><b>Region</b> — a district or area spanning several towns (e.g. Coorg)</li>
              <li><b>Island / Atoll</b> — islands and atoll groups (e.g. Bali, Baa Atoll)</li>
              <li><b>City-state</b> — a country that is also a city (Singapore)</li>
            </ul>
          </div>
        </header>

        <section className="stack" aria-labelledby="top">
          <h2 id="top" style={{ fontSize: '1.8rem', margin: 0 }}>Top places {pick === 'all' ? (scope === 'india' ? 'in India' : 'abroad') : `in ${pick}`}</h2>
          <div className="row" style={{ gap: 6 }} role="group" aria-label={scope === 'india' ? 'Choose a state or union territory' : 'Choose a country'}>
            <button className="chip" aria-pressed={pick === 'all'} onClick={() => setPick('all')}>All</button>
            {groups.map((g) => <button key={g} className="chip" aria-pressed={pick === g} onClick={() => setPick(g)}>{g}</button>)}
          </div>
          <div className="grid grid-3 top-grid">
            {top.map((d, i) => {
              const e2 = quickEstimate(d.id, 2);
              const e1 = quickEstimate(d.id, 1);
              return (
                <a key={d.id} href={href(`/destination/${d.id}`)} className="top-card card" data-tilt>
                  <div className="top-photo"><DestImage dest={d} credit={false} /></div>
                  <div className="top-body">
                    <span className="top-rank">{i + 1}</span>
                    <div>
                      <b>{d.name}</b>
                      <div className="tiny muted">{d.scope === 'india' ? d.state : d.country} · {d.tagline}</div>
                      <div className="small" style={{ marginTop: 4 }}>Day trip {money(e1.total)} · 2 days {money(e2.total)}</div>
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        </section>

        <DestinationFinder scope={scope} title={scope === 'india' ? 'India on the globe' : 'The world on the globe'} onOpen={portal.open} />

        <section aria-labelledby="hier" className="glass panel pad tree">
          <h2 id="hier" style={{ fontSize: '1.6rem' }}>{scope === 'india' ? 'By state & union territory' : 'By continent & country'}</h2>
          {scope === 'india' &&
            india.map((s) => (
              <details key={s.state}>
                <summary><span>{s.state} <span className="tag">{s.type}</span></span><span className="muted small">{s.items.length}</span></summary>
                <ul>
                  {s.items.map((d) => (
                    <li key={d.id}>
                      <a href={href(`/destination/${d.id}`)}>{d.name}</a> <span className="tiny muted">({KIND_LABEL[d.kind]})</span>
                      <div className="tiny muted">Nearby: {d.attractions.slice(0, 4).map((a) => a.name).join(' · ')}</div>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          {scope === 'world' &&
            world.map((c) => (
              <details key={c.continent} open>
                <summary><span>{c.continent}</span><span className="muted small">{c.countries.length} countries</span></summary>
                <ul>
                  {c.countries.map((co) => (
                    <li key={co.country}>
                      <details>
                        <summary style={{ fontWeight: 500 }}><span>{co.country}</span><span className="muted small">{co.items.length}</span></summary>
                        <ul>
                          {co.items.map((d) => (
                            <li key={d.id}>
                              <a href={href(`/destination/${d.id}`)}>{d.name}</a> <span className="tiny muted">({KIND_LABEL[d.kind]})</span>
                              <div className="tiny muted">Attractions: {d.attractions.slice(0, 4).map((a) => a.name).join(' · ')}</div>
                            </li>
                          ))}
                        </ul>
                      </details>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
        </section>

        <section aria-labelledby="all">
          <h2 id="all" style={{ fontSize: '1.8rem' }}>All {scope === 'india' ? 'Indian' : 'international'} destinations</h2>
          <div className="grid grid-auto">
            {list.map((d) => <DestinationCard key={d.id} d={d} />)}
          </div>
        </section>
      </div>
      {portal.node}
    </main>
  );
}
