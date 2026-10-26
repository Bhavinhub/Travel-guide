import { useMemo, useState } from 'react';
import { getDeparture, getDestination, mustDestination } from '../data/catalog';
import { Stamp } from '../components/features';
import { estimateTrip } from '../lib/estimate';
import { download, fileSafe, itineraryHTML } from '../lib/export';
import { href, navigate, useRoute } from '../lib/router';
import { useMoney, useStore } from '../lib/store';
import { fmtDate } from '../lib/time';
import type { Trip } from '../lib/trip';

function summary(t: Trip) {
  const e = estimateTrip(t.config, t.days);
  const experiences = t.days.flatMap((d) => d.items).filter((i) => i.type === 'activity' || i.type === 'service');
  return { e, experiences };
}

export default function Saved() {
  const trips = useStore((s) => s.trips);
  const passport = useStore((s) => s.passport);
  const loadTrip = useStore((s) => s.loadTrip);
  const deleteTrip = useStore((s) => s.deleteTrip);
  const renameTrip = useStore((s) => s.renameTrip);
  const unstamp = useStore((s) => s.unstamp);
  const money = useMoney();
  const route = useRoute();
  const [compare, setCompare] = useState<string[]>([]);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const sums = useMemo(() => Object.fromEntries(trips.map((t) => [t.id, summary(t)])), [trips]);
  const cmp = compare.map((id) => trips.find((t) => t.id === id)).filter(Boolean) as Trip[];
  return (
    <main className="page" id="main" tabIndex={-1}>
      <div className="page-bg" />
      <div className="wrap stack" style={{ gap: '2rem' }}>
        <header>
          <span className="eyebrow">Saved Trips</span>
          <h1 style={{ fontSize: 'clamp(2.2rem, 5vw, 3.6rem)' }}>Your plans, passport & comparisons</h1>
          <p className="muted">Saved on this device only (browser storage). Clearing site data removes them — export anything you want to keep.</p>
        </header>

        <section aria-labelledby="trips">
          <h2 id="trips" style={{ fontSize: '1.6rem' }}>Saved plans ({trips.length})</h2>
          {!trips.length && (
            <div className="glass panel pad">
              <p>No saved plans yet.</p>
              <a className="btn btn-primary" href={href('/plan')}>Build a trip</a>
            </div>
          )}
          <div className="grid grid-auto">
            {trips.map((t) => {
              const s = sums[t.id];
              const dests = [...new Set(t.config.destIds)].map((d) => getDestination(d)?.name ?? d);
              const inCmp = compare.includes(t.id);
              return (
                <article key={t.id} className="glass pad stack" style={{ gap: '0.6rem' }}>
                  <label className="sr-only" htmlFor={`n-${t.id}`}>Trip name</label>
                  <input id={`n-${t.id}`} className="input" defaultValue={t.name} onBlur={(e) => e.target.value.trim() && renameTrip(t.id, e.target.value.trim())} style={{ fontWeight: 600 }} />
                  <span className="small muted">{dests.join(' → ')} · from {getDeparture(t.config.departureId).name}</span>
                  <span className="small">{fmtDate(t.config.startDate, { day: 'numeric', month: 'short', year: 'numeric' })} · {t.config.days} days · {t.config.adults + t.config.children} travellers</span>
                  <span><strong className="num">{money(s.e.total)}</strong> <span className="tiny muted">est. · {money(s.e.perPerson)} pp</span></span>
                  <span className="tiny muted">Updated {new Date(t.updatedAt).toLocaleString('en-GB')}</span>
                  <div className="row" style={{ gap: 6 }}>
                    <button className="btn btn-primary btn-sm" onClick={() => { loadTrip(t.id); navigate('/plan'); }}>Open</button>
                    <button className="btn btn-sm" aria-pressed={inCmp} disabled={!inCmp && compare.length >= 3} onClick={() => setCompare((c) => (inCmp ? c.filter((x) => x !== t.id) : [...c, t.id]))}>{inCmp ? '✓ Comparing' : 'Compare'}</button>
                    <button className="btn btn-sm" onClick={() => download(`${fileSafe(t.name)}.html`, itineraryHTML(t.name, t.config, t.days, s.e, money))}>Export</button>
                    {confirmDel === t.id ? (
                      <>
                        <button className="btn btn-sm" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }} onClick={() => { deleteTrip(t.id); setConfirmDel(null); setCompare((c) => c.filter((x) => x !== t.id)); }}>Confirm delete</button>
                        <button className="btn btn-sm btn-ghost" onClick={() => setConfirmDel(null)}>Cancel</button>
                      </>
                    ) : (
                      <button className="btn btn-sm btn-ghost" onClick={() => setConfirmDel(t.id)}>Delete</button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="cmp" className="glass panel pad" style={route.query.get('compare') ? { outline: '2px solid var(--accent)' } : undefined}>
          <h2 id="cmp" style={{ fontSize: '1.6rem' }}>Compare trips</h2>
          {cmp.length < 2 ? (
            <p className="muted">Select two or three saved plans with “Compare” to see them side by side.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="cost-table">
                <thead><tr><th scope="col">Metric</th>{cmp.map((t) => <th key={t.id} scope="col">{t.name}</th>)}</tr></thead>
                <tbody>
                  <tr><th scope="row">Destinations</th>{cmp.map((t) => <td key={t.id}>{[...new Set(t.config.destIds)].map((d) => mustDestination(d).name).join(', ')}</td>)}</tr>
                  <tr><th scope="row">Duration</th>{cmp.map((t) => <td key={t.id}>{t.config.days} days · {sums[t.id].e.nights} nights</td>)}</tr>
                  <tr><th scope="row">Travellers</th>{cmp.map((t) => <td key={t.id}>{t.config.adults} adults, {t.config.children} children</td>)}</tr>
                  <tr><th scope="row">Experiences</th>{cmp.map((t) => <td key={t.id}>{sums[t.id].experiences.length}<div className="tiny muted">{sums[t.id].experiences.slice(0, 5).map((x) => x.title).join(' · ')}{sums[t.id].experiences.length > 5 ? '…' : ''}</div></td>)}</tr>
                  <tr><th scope="row">Stay style</th>{cmp.map((t) => <td key={t.id} style={{ textTransform: 'capitalize' }}>{t.config.tier}</td>)}</tr>
                  {sums[cmp[0].id].e.categories.filter((c) => c.key !== 'fees').map((cat) => (
                    <tr key={cat.key}><th scope="row">{cat.label}</th>{cmp.map((t) => <td key={t.id} className="num">{money(sums[t.id].e.categories.find((x) => x.key === cat.key)!.amount)}</td>)}</tr>
                  ))}
                  <tr><th scope="row">Estimated total</th>{cmp.map((t) => <td key={t.id}><strong className="num">{money(sums[t.id].e.total)}</strong></td>)}</tr>
                  <tr><th scope="row">Per person</th>{cmp.map((t) => <td key={t.id} className="num">{money(sums[t.id].e.perPerson)}</td>)}</tr>
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section aria-labelledby="pp">
          <h2 id="pp" style={{ fontSize: '1.6rem' }}>Destination Passport</h2>
          <p className="muted small">Collect a stamp from any destination page or portal. Stamps are saved on this device.</p>
          {!passport.length && <div className="glass pad"><p className="muted" style={{ margin: 0 }}>Your passport is empty — open a destination and tap “Add passport stamp”.</p></div>}
          <div className="stamps">
            {passport.map((p, i) => {
              const d = getDestination(p.id);
              if (!d) return null;
              return (
                <div key={p.id} style={{ display: 'grid', gap: 6, justifyItems: 'center' }}>
                  <a href={href(`/destination/${d.id}`)} style={{ textDecoration: 'none', width: '100%' }} aria-label={`${d.name} stamp`}><Stamp d={d} at={p.at} i={i} /></a>
                  <button className="btn btn-sm btn-ghost" onClick={() => unstamp(p.id)}>Remove</button>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
