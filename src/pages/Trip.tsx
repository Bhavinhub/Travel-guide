import { HeroImage } from '../components/HeroImage';
import { PackingChecklist } from '../components/PackingChecklist';
import { useMemo, useState } from 'react';
import { COMPANY, PRICING_BASIS } from '../config/company';
import { getDeparture, mustDestination } from '../data/catalog';
import { DOMESTIC_AIRLINES, ICONIC_EATS, INDIA_GROUND, INDIAN_INTL, INTL_AIRLINES, LOCAL_RIDES, CAR_RENTAL_INTL, type Provider } from '../data/booking';
import type { Destination } from '../data/types';
import { DestImage } from '../components/DestImage';
import { LiveFlightOffers, LiveWeather } from '../components/LiveWidgets';
import { addDaysISO } from '../lib/time';
import { MODE_ICON, TravelChooser } from '../components/TravelChooser';
import { estimateTrip } from '../lib/estimate';
import { download, fileSafe, itineraryHTML } from '../lib/export';
import { legOptions, type LegOption } from '../lib/geo';
import { generateItinerary, layoutDay, MEAL_PLAN_FACTOR, PACE } from '../lib/itinerary';
import { flightLinks, hotelLinks, instagramTag, mapsDirections, mapsSearch, tripadvisorEats, youtube } from '../lib/links';
import { creditLine, fileLabel, localImages, srcOf, srcSet } from '../lib/localMedia';
import { href, navigate } from '../lib/router';
import { useMoney, useStore } from '../lib/store';
import { arrivalTransfer, bikeTiers, busTiers, carTiers, flightTiers, hotelTiers, trainTiers, type Tier } from '../lib/tiers';
import { fmtDate, fmtDur, fmtTime } from '../lib/time';
import { PUBLIC_MODES, type TripConfig } from '../lib/trip';


function Links({ items, label }: { items: (Provider | undefined)[]; label?: string }) {
  const list = items.filter(Boolean) as Provider[];
  if (!list.length) return null;
  return (
    <div className="row" style={{ gap: 6, marginTop: 8 }}>
      {label && <span className="small muted">{label}</span>}
      {list.map((p) => <a key={p.name + p.url} className="btn btn-sm" href={p.url} target="_blank" rel="noreferrer" title={p.note}>{p.name} ↗</a>)}
    </div>
  );
}

function TierTable({ tiers, caption }: { tiers: Tier[]; caption: string }) {
  const money = useMoney();
  return (
    <table className="cost-table small">
      <caption className="sr-only">{caption}</caption>
      <thead><tr><th>Option (lowest → highest)</th><th className="r">Est. for your group</th></tr></thead>
      <tbody>
        {[...tiers].sort((a, b) => a.total - b.total).map((t, i) => (
          <tr key={t.name}><td><strong>{t.name}</strong>{i === 0 && <span className="tag tag-ok" style={{ marginLeft: 6 }}>Lowest</span>}<div className="tiny muted">{t.detail}</div></td><td className="r num">{money(t.total)}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

function GettingThere({ c, d, leg, options }: { c: TripConfig; d: Destination; leg?: LegOption; options: LegOption[] }) {
  const money = useMoney();
  const home = getDeparture(c.departureId);
  const pax = c.adults + c.children;
  const india = d.country === 'India';
  if (!leg) return <div className="notice">No practical transport option was found for this route.</div>;
  const fl = flightLinks(c, d);
  const arrival = arrivalTransfer(d, c);
  const rides = LOCAL_RIDES[d.country] ?? [];
  const airlines = india ? DOMESTIC_AIRLINES : [...INDIAN_INTL, ...(INTL_AIRLINES[d.country] ?? [])];
  return (
    <div className="stack">
      <div className="row between">
        <h3 style={{ margin: 0 }}>{MODE_ICON[leg.mode]} {leg.label}: {home.name} → {d.name}</h3>
        <span className="tag">~{fmtDur(leg.durationMin)} each way · {leg.km} km</span>
      </div>
      {leg.mode === 'flight' && (
        <>
          <TierTable caption="Flight fare tiers" tiers={flightTiers(leg, c)} />
          <p className="tiny muted">Return fares for {pax} traveller{pax > 1 ? 's' : ''}, modelled from distance — live fares differ. Compare real prices and airlines below.</p>
          <LiveFlightOffers from={fl.from} to={fl.to} date={c.startDate} ret={addDaysISO(c.startDate, Math.max(1, c.days - 1))} adults={c.adults} children={c.children} cabin={c.travelClass === 'premium' ? 'premium_economy' : c.travelClass} fallbackLink={fl.google} />
          <Links label="Live fares:" items={[{ name: 'Google Flights', url: fl.google }, fl.skyscanner ? { name: 'Skyscanner', url: fl.skyscanner } : undefined]} />
          <Links label="Airlines to compare (check which fly your dates):" items={airlines} />
        </>
      )}
      {leg.mode === 'car' && (
        <>
          <TierTable caption="Private cab options" tiers={carTiers(leg.km, pax, c.days)} />
          <Links label="Book a cab:" items={india ? INDIA_GROUND.cabs : CAR_RENTAL_INTL} />
        </>
      )}
      {leg.mode === 'self-drive' && (
        <>
          <TierTable caption="Self-drive rental options" tiers={carTiers(leg.km, pax, c.days, true)} />
          <Links label="Rent a car:" items={india ? INDIA_GROUND.selfDrive : CAR_RENTAL_INTL} />
        </>
      )}
      {leg.mode === 'bike' && (
        <>
          <TierTable caption="Bike rental options" tiers={bikeTiers(leg.km, pax, c.days)} />
          <Links label="Rent a bike:" items={INDIA_GROUND.bikes} />
          <p className="tiny muted">Valid two-wheeler licence and helmets are mandatory. Mountain passes may need permits.</p>
        </>
      )}
      {leg.mode === 'train' && (
        <>
          <TierTable caption="Train class options" tiers={trainTiers(leg.km, c)} />
          <Links label="Book trains:" items={INDIA_GROUND.trains} />
        </>
      )}
      {leg.mode === 'bus' && (
        <>
          <TierTable caption="Bus options" tiers={busTiers(leg.km, c)} />
          <Links label="Book buses:" items={INDIA_GROUND.buses} />
        </>
      )}
      {leg.mode === 'helicopter' && (
        <>
          <div className="notice">Estimated charter: {money(leg.vehicleINR)} each way. Helicopters fly only on approved routes and in good weather; the operator confirms availability, landing permission and the real price.</div>
          <Links label="Enquire:" items={INDIA_GROUND.heli} />
        </>
      )}

      {(leg.mode === 'flight' || leg.mode === 'train' || leg.mode === 'bus') && (
        <div className="glass pad-sm">
          <strong>From {arrival.from} to {d.name}</strong> <span className="tiny muted">(~{arrival.km} km)</span>
          <TierTable caption="Arrival transfer options" tiers={arrival.opts} />
          <Links items={[...rides, { name: 'Directions on Google Maps', url: mapsDirections(arrival.from, `${d.name}, ${d.country}`, 'driving') }]} />
        </div>
      )}

      <details className="small">
        <summary style={{ cursor: 'pointer' }}>Compare every way to get there</summary>
        <table className="cost-table small" style={{ marginTop: 8 }}>
          <thead><tr><th>Mode</th><th>Type</th><th className="r">Time</th><th className="r">One way (group)</th></tr></thead>
          <tbody>
            {options.map((o) => (
              <tr key={o.mode}><td>{MODE_ICON[o.mode]} {o.label}</td><td>{PUBLIC_MODES.includes(o.mode) ? 'Public' : 'Private'}</td><td className="r">{fmtDur(o.durationMin)}</td><td className="r num">{money(o.adultINR * c.adults + o.childINR * c.children + o.vehicleINR)}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function Stay({ c, d, onTier }: { c: TripConfig; d: Destination; onTier: (t: TripConfig['tier']) => void }) {
  const money = useMoney();
  return (
    <div className="grid grid-auto">
      {hotelTiers(c).map((h) => {
        const l = hotelLinks(c, d, h.tier);
        const on = h.tier === c.tier;
        return (
          <div key={h.tier} className="glass pad-sm stack" style={{ gap: 6, outline: on ? '2px solid var(--accent)' : undefined }} data-tilt>
            <span className="eyebrow" style={{ marginBottom: 0 }}>{h.tier === 'luxury' ? '5-star' : h.tier}</span>
            <strong>{h.label}</strong>
            <span><b className="num">{money(h.nightly)}</b> <span className="tiny muted">/ night · {c.rooms} room{c.rooms > 1 ? 's' : ''}</span></span>
            <span className="tiny muted">{h.nights} night{h.nights > 1 ? 's' : ''}: {money(h.total)} (est.)</span>
            <div className="row" style={{ gap: 6 }}>
              <a className="btn btn-sm" href={l.booking} target="_blank" rel="noreferrer">Booking.com ↗</a>
              <a className="btn btn-sm" href={l.google} target="_blank" rel="noreferrer">Google Hotels ↗</a>
              {l.mmt && <a className="btn btn-sm" href={l.mmt} target="_blank" rel="noreferrer">MakeMyTrip ↗</a>}
            </div>
            <button className="btn btn-sm btn-primary" disabled={on} onClick={() => onTier(h.tier)}>{on ? '✓ In your plan' : 'Use this stay'}</button>
          </div>
        );
      })}
      <p className="tiny muted" style={{ gridColumn: '1 / -1' }}>Booking.com links open sorted from the lowest price, filtered to guest rating 8+ (value tier) or star class. Nightly rates shown here are illustrative; live prices are on the booking sites.</p>
    </div>
  );
}

function Eat({ c, d }: { c: TripConfig; d: Destination }) {
  const money = useMoney();
  const picks = ICONIC_EATS[d.id] ?? [];
  const pp = (f: number) => money(Math.round(d.cost.mealsPerPerson[c.tier] * f));
  return (
    <div className="grid grid-2">
      <div className="glass pad stack">
        <h3 style={{ margin: 0 }}>What to eat</h3>
        <ul className="small" style={{ margin: 0 }}>{d.food.map((f) => <li key={f}>{f}</li>)}</ul>
        <table className="cost-table small">
          <tbody>
            <tr><td>🥟 Street food & local eateries</td><td className="r">{pp(MEAL_PLAN_FACTOR.local)} pp/day</td></tr>
            <tr><td>🍛 Mix of cafés & restaurants</td><td className="r">{pp(MEAL_PLAN_FACTOR.mixed)} pp/day</td></tr>
            <tr><td>🍷 Fine dining</td><td className="r">{pp(MEAL_PLAN_FACTOR.fine)} pp/day</td></tr>
          </tbody>
        </table>
      </div>
      <div className="glass pad stack">
        <h3 style={{ margin: 0 }}>Where to eat</h3>
        {picks.length > 0 ? (
          <ul className="small" style={{ margin: 0, paddingLeft: '1rem' }}>
            {picks.map((p) => <li key={p.name}><a href={mapsSearch(p.name)} target="_blank" rel="noreferrer">{p.name}</a> <span className="tag">{p.style}</span><br /><span className="muted">{p.what}</span></li>)}
          </ul>
        ) : <p className="small muted" style={{ margin: 0 }}>Use the live searches below for current favourites.</p>}
        <p className="tiny muted" style={{ margin: 0 }}>Long-established names — confirm hours and that they’re open before you go.</p>
        <div className="row" style={{ gap: 6 }}>
          <a className="btn btn-sm" href={mapsSearch(`best street food in ${d.name}`)} target="_blank" rel="noreferrer">Street food near you ↗</a>
          <a className="btn btn-sm" href={mapsSearch(`best restaurants in ${d.name}`)} target="_blank" rel="noreferrer">Top-rated restaurants ↗</a>
          <a className="btn btn-sm" href={mapsSearch(`fine dining ${d.name}`)} target="_blank" rel="noreferrer">Fine dining ↗</a>
          <a className="btn btn-sm" href={tripadvisorEats(d)} target="_blank" rel="noreferrer">Tripadvisor ↗</a>
        </div>
      </div>
    </div>
  );
}

function Journey({ c, days, daily, mode }: { c: TripConfig; days: ReturnType<typeof generateItinerary>['days']; daily: { total: number }[]; mode: 'continuous' | 'days' }) {
  const money = useMoney();
  const [sel, setSel] = useState(0);
  const shown = mode === 'continuous' ? days : [days[Math.min(sel, days.length - 1)]];
  return (
    <div className="stack">
      {mode === 'days' && (
        <div className="tabs" role="tablist" aria-label="Days">
          {days.map((d, i) => <button key={d.index} role="tab" aria-selected={sel === i} onClick={() => setSel(i)}>Day {i + 1} · {money(daily[i]?.total ?? 0)}</button>)}
        </div>
      )}
      <ol className="journey" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {shown.map((day) => {
          const l = layoutDay(day, c);
          const dest = mustDestination(day.destId);
          return (
            <li key={day.index} className="journey-day">
              <div className="journey-head glass">
                <span className="journey-num">{day.index + 1}</span>
                <div style={{ flex: 1 }}>
                  <strong>{fmtDate(day.date)} — {day.title}</strong>
                  <div className="tiny muted">{dest.name} · sunrise {fmtTime(l.sunrise)} · sunset {fmtTime(l.sunset)} (approx.)</div>
                </div>
                <div style={{ textAlign: 'right' }}><b className="num">{money(daily[day.index]?.total ?? 0)}</b><div className="tiny muted">day budget</div></div>
              </div>
              <ul className="timeline">
                {l.rows.map((r) => (
                  <li key={r.item.uid} className={`tl-item ${r.item.type}`}>
                    <span className="tl-time">{fmtTime(r.start)}</span>
                    <span className="tl-dot" aria-hidden />
                    <div className="tl-card">
                      <div className="t"><span>{r.item.title}</span><span className="small num">{r.item.groupCost || r.item.costPP ? money((r.item.groupCost ?? 0) + r.item.costPP * (c.adults + c.children * 0.5)) : ''}</span></div>
                      <div className="m">{fmtTime(r.start)}–{fmtTime(r.end)} · {fmtDur(r.item.durationMin)} · {r.item.location}{r.transferBefore ? ` · ${r.transferBefore} min transfer before` : ''}</div>
                      {r.issues.map((x) => <div key={x.text} className={`issue ${x.level}`}>{x.text}</div>)}
                    </div>
                  </li>
                ))}
              </ul>
              {mode === 'continuous' && day.index < days.length - 1 && (
                <div className="journey-link" aria-hidden>{day.overnight ? `☾ Overnight in ${dest.name}` : '→ On the move'}</div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default function Trip() {
  const draft = useStore((s) => s.draft);
  const setConfig = useStore((s) => s.setConfig);
  const saveDraft = useStore((s) => s.saveDraft);
  const money = useMoney();
  const [view, setView] = useState<'continuous' | 'days'>('continuous');
  const c = draft.config;
  const d = mustDestination(c.destIds[0]);
  const home = getDeparture(c.departureId);
  const est = useMemo(() => estimateTrip(c, draft.days), [c, draft.days]);
  const options = useMemo(() => legOptions({ name: home.name, lat: home.lat, lon: home.lon, tz: home.tz, country: home.country, hasRail: home.hasRail }, { name: d.name, lat: d.lat, lon: d.lon, tz: d.tz, country: d.country }, d, c.travelClass, c.adults + c.children), [c, d, home]);
  const leg = draft.days[0]?.items.find((i) => i.type === 'transit' && i.costCategory === 'mainTransport') ? generateItinerary(c).outbound?.leg : undefined;
  const imgs = localImages(d.id);
  const set = (p: Partial<TripConfig>) => setConfig(p, { regenerate: true });
  const sameCity = home.name === d.name;
  const maxDay = Math.max(...est.daily.map((x) => x.total), 1);

  return (
    <main className="page" id="main" tabIndex={-1} style={{ ['--dest-accent' as string]: d.accent }}>
      <div className="page-bg" />
      <div className="wrap stack" style={{ gap: '1.8rem' }}>
        <div className="print-only"><strong>{COMPANY.name}</strong> — {COMPANY.tagline}</div>

        {/* —— 3D photo hero —— */}
        <section className="trip-hero">
          <div className="trip-hero-photo">
            {imgs[0] ? <HeroImage src={srcOf(imgs[0], 'hero')!} srcSet={srcSet(imgs[0])} w={imgs[0].width} h={imgs[0].height} alt={`${d.name} — ${fileLabel(imgs[0])}`} /> : <DestImage dest={d} large />}
          </div>
          <div className="trip-hero-depth" aria-hidden>
            {imgs.slice(1, 3).map((im, i) => <figure key={im.file} className={`trip-float f${i} float3d`}><img src={srcOf(im, 'card')} alt="" /></figure>)}
          </div>
          <div className="trip-hero-text hero-3d">
            <span className="eyebrow">Your trip · {d.scope === 'india' ? d.state : d.country}</span>
            <h1 style={{ fontSize: 'clamp(2.4rem, 6vw, 4.6rem)', margin: 0 }}>{d.name}{c.destIds.length > 1 ? ` + ${c.destIds.length - 1} more` : ''}</h1>
            <p className="lead" style={{ margin: '0.4rem 0' }}>{fmtDate(c.startDate, { day: 'numeric', month: 'short', year: 'numeric' })} · {c.days} day{c.days > 1 ? 's' : ''} · {c.adults + c.children} traveller{c.adults + c.children > 1 ? 's' : ''} · from {home.name}</p>
            <div className="row"><span className="big-total num">{money(est.total)}</span><span className="small muted">total est. · {money(est.perPerson)} per person · range {money(est.low)}–{money(est.high)}</span></div>
            {imgs[0] && <a className="tiny muted" href={imgs[0].source} target="_blank" rel="noreferrer">Photo: {creditLine(imgs[0])}</a>}
          </div>
        </section>

        {/* —— Live preferences —— */}
        <section className="glass panel pad stack" aria-label="Change your trip" data-no-reveal>
          <div className="row between"><h2 style={{ fontSize: '1.3rem', margin: 0 }}>Change anything — everything updates</h2><a className="btn btn-sm" href={href('/plan')}>Advanced options</a></div>
          <div className="pref-grid">
            <fieldset><legend>Days</legend><div className="segmented">{[1, 2, 3, 4, 5, 6, 7].map((n) => <button key={n} aria-pressed={c.days === n} onClick={() => set({ days: Math.max(n, c.destIds.length) })}>{n}</button>)}</div></fieldset>
            <fieldset><legend>Stay</legend><div className="segmented">{(['budget', 'comfortable', 'premium', 'luxury'] as const).map((t) => <button key={t} aria-pressed={c.tier === t} onClick={() => set({ tier: t })}>{t === 'luxury' ? '5-star' : t === 'premium' ? '4-star' : t === 'comfortable' ? '3-star' : 'Budget'}</button>)}</div></fieldset>
            <fieldset><legend>Food</legend><div className="segmented">{([['local', 'Street food'], ['mixed', 'Mixed'], ['fine', 'Fine dining']] as const).map(([v, l]) => <button key={v} aria-pressed={c.mealPlan === v} onClick={() => set({ mealPlan: v })}>{l}</button>)}</div></fieldset>
            <fieldset><legend>Pacing</legend><div className="segmented">{(['relaxed', 'balanced', 'busy'] as const).map((p) => <button key={p} aria-pressed={c.pacing === p} onClick={() => set({ pacing: p })}>{PACE[p].label}</button>)}</div></fieldset>
            </div>
          <TravelChooser c={c} set={set} />
          {draft.warnings.map((w) => <div key={w} className="notice">{w}</div>)}
        </section>

        <LiveWeather d={d} startDate={c.startDate} days={c.days} />

        {/* —— Highlights —— */}
        <section aria-labelledby="hl">
          <h2 id="hl">Highlights of {d.name}</h2>
          <p className="lead" style={{ maxWidth: '70ch' }}>{d.why}</p>
          <div className="grid grid-auto">
            {d.attractions.slice(0, 6).map((a, i) => (
              <div key={a.id} className="card glass" data-tilt>
                <div style={{ position: 'relative', aspectRatio: '16/10' }}>
                  {imgs.length ? <img src={srcOf(imgs[i % imgs.length], 'card')} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <DestImage dest={d} />}
                </div>
                <div className="pad-sm"><strong>{a.name}</strong><div className="tiny muted">{fmtDur(a.durationMin)} · {a.costINR ? `~${money(a.costINR)} pp` : 'free'} · best {a.slot}</div></div>
              </div>
            ))}
          </div>
          <p className="tiny muted">Photos show {d.name} (Wikimedia Commons); they may not depict each specific attraction.</p>
        </section>

        <section className="glass panel pad" aria-labelledby="gt"><h2 id="gt" style={{ fontSize: '1.6rem' }}>Getting there</h2>{sameCity ? <p className="muted">You’re already in {d.name} — enjoy a staycation.</p> : <GettingThere c={c} d={d} leg={leg} options={options} />}</section>

        <section className="glass panel pad stack" aria-labelledby="pack">
          <h2 id="pack" style={{ fontSize: '1.6rem', margin: 0 }}>What to carry</h2>
          <p className="small muted" style={{ margin: 0 }}>Documents, clothes and essentials for {c.days} day{c.days > 1 ? 's' : ''} in {d.name}{leg ? ` travelling by ${leg.mode}` : ''} — tick items off as you pack.</p>
          <PackingChecklist c={c} />
        </section>

        <section aria-labelledby="st"><h2 id="st" style={{ fontSize: '1.6rem' }}>Where to stay</h2><Stay c={c} d={d} onTier={(t) => set({ tier: t })} /></section>

        <section aria-labelledby="et"><h2 id="et" style={{ fontSize: '1.6rem' }}>Where & what to eat</h2><Eat c={c} d={d} /></section>

        <section aria-labelledby="it" className="stack">
          <div className="row between">
            <h2 id="it" style={{ fontSize: '1.6rem', margin: 0 }}>Your itinerary</h2>
            <div className="segmented" role="group" aria-label="Itinerary view">
              <button aria-pressed={view === 'continuous'} onClick={() => setView('continuous')}>Full journey</button>
              <button aria-pressed={view === 'days'} onClick={() => setView('days')}>Day by day</button>
            </div>
          </div>
          <Journey c={c} days={draft.days} daily={est.daily} mode={view} />
        </section>

        <section className="glass panel pad" aria-labelledby="bd">
          <h2 id="bd" style={{ fontSize: '1.6rem' }}>Budget by day</h2>
          <div className="daybars">
            {est.daily.map((x) => (
              <div key={x.index} className="daybar"><span className="tiny">Day {x.index + 1}</span><i style={{ height: `${(x.total / maxDay) * 100}%` }} /><b className="tiny num">{money(x.total, { compact: true })}</b></div>
            ))}
          </div>
          <table className="cost-table small" style={{ marginTop: '1rem' }}>
            <tbody>
              {est.categories.filter((x) => x.amount > 0).map((x) => <tr key={x.key}><td>{x.label}</td><td className="r num">{money(x.amount)}</td></tr>)}
              <tr><td>Contingency ({c.contingencyPct}%)</td><td className="r num">{money(est.contingency)}</td></tr>
            </tbody>
            <tfoot><tr><td>Total ({est.travellers} travellers)</td><td className="r num">{money(est.total)}</td></tr></tfoot>
          </table>
          <p className="tiny muted"><span className="tag tag-sample">Sample data</span> {PRICING_BASIS.label} · {PRICING_BASIS.compiledOn}. Live prices are on the linked booking sites.</p>
        </section>

        <section className="glass pad row between">
          <div><strong>See {d.name} on social</strong><div className="tiny muted">Real traveller videos and photos (opens external sites)</div></div>
          <div className="row"><a className="btn btn-sm" href={youtube(d)} target="_blank" rel="noreferrer">YouTube vlogs ↗</a><a className="btn btn-sm" href={instagramTag(d)} target="_blank" rel="noreferrer">Instagram #{d.name.split(' (')[0].replace(/[^A-Za-z]/g, '').toLowerCase()} ↗</a></div>
        </section>

        <div className="row no-print">
          <button className="btn btn-primary" onClick={() => saveDraft()}>Save this trip</button>
          <button className="btn" onClick={() => download(`${fileSafe(draft.name)}.html`, itineraryHTML(draft.name, c, draft.days, est, money))}>Export itinerary</button>
          <button className="btn" onClick={() => window.print()}>Print</button>
          <a className="btn" href={href('/plan')}>Edit activities</a>
          <button className="btn btn-accent" onClick={() => { saveDraft(); navigate('/contact?quote=1'); }}>Request a quote</button>
        </div>
      </div>
    </main>
  );
}
