import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { PackingChecklist } from '../components/PackingChecklist';
import { getDeparture, getDestination, INTEREST_LABELS, KIND_LABEL, MONTHS } from '../data/catalog';
import type { BudgetTier, Destination } from '../data/types';
import { getService } from '../data/services';
import { AtmospherePreview } from '../components/features';
import { DestinationCard } from '../components/discovery';
import { TripExplorer } from '../components/TripExplorer';
import { LiveWeather } from '../components/LiveWidgets';
import { MapFlyIn } from '../components/MapFlyIn';
import { Illustration } from '../components/Illustration';
import { estimateTrip } from '../lib/estimate';
import { generateItinerary, priceLevel } from '../lib/itinerary';
import { useMedia, type MediaImage, type MediaSet } from '../lib/media';
import { localImages, srcOf, srcSet } from '../lib/localMedia';
import { HeroImage } from '../components/HeroImage';
import { href, navigate } from '../lib/router';
import { useMoney, useStore } from '../lib/store';
import { defaultConfig } from '../lib/trip';
import { fmtDur } from '../lib/time';
import { nearestDeparture } from '../lib/tiers';

const TIERS: { id: BudgetTier; label: string; blurb: string }[] = [
  { id: 'budget', label: 'Budget', blurb: 'Guesthouses & homestays, local eateries' },
  { id: 'comfortable', label: 'Comfortable', blurb: '3-star hotels, mixed dining' },
  { id: 'premium', label: 'Premium', blurb: '4-star / boutique stays, private transfers' },
  { id: 'luxury', label: 'Luxury', blurb: '5-star & heritage resorts, fine dining' },
];

function Gallery({ images, name }: { images: MediaImage[]; name: string }) {
  const [open, setOpen] = useState<MediaImage | null>(null);
  return (
    <>
      <div className="gallery">
        {images.slice(0, 5).map((g) => (
          <figure key={g.title}>
            <button onClick={() => setOpen(g)} aria-label={`Enlarge photo: ${g.title.replace(/^File:/, '')}`}>
              <img src={g.src} alt={`${name} — ${g.title.replace(/^File:/, '').replace(/\.[a-z]+$/i, '').replace(/_/g, ' ')}`} loading="lazy" />
            </button>
            <a className="media-credit" href={g.page} target="_blank" rel="noreferrer">{g.author?.slice(0, 32) ?? 'Wikimedia Commons'}{g.license ? ` · ${g.license}` : ''}</a>
          </figure>
        ))}
      </div>
      {open && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label="Photo" onClick={() => setOpen(null)} onKeyDown={(e) => e.key === 'Escape' && setOpen(null)}>
          <figure style={{ margin: 0 }}>
            <img src={open.srcLarge} alt={open.title.replace(/^File:/, '')} />
            <figcaption>
              {open.title.replace(/^File:/, '').replace(/_/g, ' ')} — {open.author ?? 'Unknown author'}{open.license ? `, ${open.license}` : ''} · <a href={open.page} target="_blank" rel="noreferrer">Source on Wikimedia Commons</a>
            </figcaption>
            <div className="row" style={{ justifyContent: 'center', marginTop: '0.6rem' }}><button className="btn btn-sm" autoFocus onClick={() => setOpen(null)}>Close</button></div>
          </figure>
        </div>
      )}
    </>
  );
}

function Packages({ d }: { d: Destination }) {
  const money = useMoney();
  const startPlan = useStore((s) => s.startPlan);
  const pkgs = useMemo(() => {
    const defs = [
      { name: 'Short escape', days: Math.max(2, d.days[0]), tier: 'comfortable' as BudgetTier, pacing: 'balanced' as const, extras: {} as Record<string, number> },
      { name: 'Classic', days: Math.max(2, d.days[1]), tier: 'comfortable' as BudgetTier, pacing: 'balanced' as const, extras: { 'spa-pp': 0 } },
      { name: 'Slow & premium', days: Math.max(3, d.days[1] + 1), tier: 'premium' as BudgetTier, pacing: 'relaxed' as const, extras: (d.romanceExtras?.includes('candlelight') ? { candlelight: 1 } : {}) as Record<string, number> },
    ];
    return defs.map((p) => {
      const c = defaultConfig({ destIds: [d.id], days: p.days, tier: p.tier, pacing: p.pacing, services: Object.fromEntries(Object.entries(p.extras).filter(([, v]) => v > 0)) });
      const e = estimateTrip(c, generateItinerary(c).days);
      return { ...p, c, e };
    });
  }, [d]);
  const [pack, setPack] = useState<(typeof pkgs)[number] | null>(null);
  useEffect(() => {
    if (!pack) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setPack(null);
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [pack]);
  return (
    <>
    {pack && createPortal(
      <div className="drawer" onClick={() => setPack(null)}>
        <div className="drawer-panel glass panel pad pack-drawer" role="dialog" aria-modal="true" aria-labelledby="pack-title" onClick={(e) => e.stopPropagation()}>
          <div className="row between" style={{ marginBottom: '.8rem' }}>
            <div><span className="eyebrow" style={{ marginBottom: '.2rem' }}>{pack.name} · {pack.days} days</span><h2 id="pack-title" style={{ fontSize: '1.4rem', margin: 0 }}>What to carry to {d.name}</h2></div>
            <button className="btn btn-sm btn-icon" aria-label="Close" onClick={() => setPack(null)}>✕</button>
          </div>
          <PackingChecklist c={pack.c} compact />
        </div>
      </div>,
      document.body,
    )}
    <div className="grid grid-3">
      {pkgs.map((p) => (
        <div key={p.name} className="glass pad stack" data-tilt>
          <span className="eyebrow">{p.days} days · {p.tier}</span>
          <h3 style={{ margin: 0 }}>{p.name}</h3>
          <p className="small muted" style={{ margin: 0 }}>2 adults from Bengaluru, {p.pacing} pacing{Object.keys(p.c.services).length ? ', candlelight dinner' : ''}.</p>
          <div><span className="big" style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem' }}>{money(p.e.perPerson)}</span> <span className="small muted">per person (est.)</span></div>
          <p className="tiny muted" style={{ margin: 0 }}>Range {money(p.e.low)} – {money(p.e.high)} total · illustrative</p>
          <button className="btn btn-primary btn-sm" onClick={() => { startPlan(p.c); navigate('/plan'); }}>Customise this package</button>
          <button className="btn btn-sm" onClick={() => setPack(p)}>🧳 What to carry & documents</button>
        </div>
      ))}
    </div>
    </>
  );
}

export default function DestinationPage({ id }: { id: string }) {
  const d = getDestination(id);
  const local = localImages(id);
  const remote = useMedia(local.length >= 3 ? undefined : d?.wiki, 8);
  // Locally hosted 4K photos first; live Wikimedia lookup tops up the gallery if needed.
  const m: MediaSet = local.length
    ? {
        status: 'ready',
        gallery: [
          ...local.map((im) => ({ title: im.file, src: srcOf(im, 'large')!, srcLarge: srcOf(im, 'hero')!, author: im.author, license: im.license, licenseUrl: im.licenseUrl, page: im.source })),
          ...remote.gallery.filter((g) => !local.some((l) => l.file.replace(/ /g, '_') === g.title.replace(/ /g, '_'))),
        ].slice(0, 8),
      }
    : remote;
  if (m.gallery.length) m.lead = m.gallery[0];
  const money = useMoney();
  const startPlan = useStore((s) => s.startPlan);
  const stamp = useStore((s) => s.stamp);
  const stamped = useStore((s) => s.passport.some((p) => p.id === id));
  if (!d) {
    return (
      <main className="page wrap-narrow" id="main"><div className="page-bg" />
        <div className="glass panel pad"><h1 style={{ fontSize: '2rem' }}>Destination not found</h1><a className="btn" href={href('/india')}>Browse destinations</a></div>
      </main>
    );
  }
  const plan = () => { startPlan({ destIds: [d.id], days: Math.max(2, d.days[1]) }); navigate('/plan'); };
  const pl = priceLevel(d);
  const nearby = d.nearby.map((n) => getDestination(n)).filter(Boolean) as Destination[];
  return (
    <main id="main" tabIndex={-1} style={{ ['--dest-accent' as string]: d.accent }}>
      <div className="page-bg" />
      <section className="dhero">
        <div className="bg">
          {local[0] ? <HeroImage src={srcOf(local[0], 'hero')!} srcSet={srcSet(local[0])} w={local[0].width} h={local[0].height} alt={`${d.name} — lead photograph`} /> : m.lead ? <HeroImage src={m.lead.srcLarge} alt={`${d.name} — lead photograph`} /> : m.status === 'loading' ? <div className="skeleton" style={{ position: 'absolute', inset: 0 }} /> : <Illustration scene={d.scene} accent={d.accent} />}
        </div>
        <div className="wrap">
          <ol className="crumbs" aria-label="Breadcrumb">
            <li><a href={href(d.scope === 'india' ? '/india' : '/world')}>{d.scope === 'india' ? 'India' : d.continent}</a></li>
            <li>{d.scope === 'india' ? `${d.state} (${d.stateType})` : d.country}</li>
            <li aria-current="page">{d.name}</li>
          </ol>
          <span className="eyebrow">{KIND_LABEL[d.kind]}{d.aka ? ` · also ${d.aka.filter((a) => a !== 'Andaman' && a !== 'Maldives').join(', ')}` : ''}</span>
          <h1>{d.name}</h1>
          <p className="lead">{d.tagline}</p>
          <div className="row" style={{ marginTop: '1.2rem' }}>
            <button className="btn btn-primary" onClick={plan} data-magnetic>Plan this trip</button>
            <button className="btn" onClick={() => stamp(d.id)} disabled={stamped}>{stamped ? '✓ Stamped in passport' : '＋ Add passport stamp'}</button>
          </div>
          {m.lead && <p className="tiny muted" style={{ marginTop: '1rem' }}>Photo: <a href={m.lead.page} target="_blank" rel="noreferrer">{m.lead.author ?? 'Wikimedia Commons'}</a>{m.lead.license ? ` · ${m.lead.license}` : ''}</p>}
        </div>
      </section>

      <div className="wrap stack" style={{ gap: '2.4rem', paddingBottom: 80 }}>
        <section className="editorial">
          <div>
            <h2>Why visit?</h2>
            <p className="lead">{d.why}</p>
            <div className="row">{d.interests.map((i) => <span key={i} className="tag">{INTEREST_LABELS[i]}</span>)}</div>
            {d.entryNotes && <div className="notice info" style={{ marginTop: '1rem' }}>{d.entryNotes}</div>}
          </div>
          <div className="glass panel pad stack">
            <div className="row between"><span className="muted small">Recommended duration</span><strong>{d.days[0] === d.days[1] ? d.days[0] : `${d.days[0]}–${d.days[1]}`} day{d.days[1] > 1 ? 's' : ''}</strong></div>
            <div>
              <span className="muted small">Best seasons</span>
              <div className="months" style={{ marginTop: '0.4rem' }} aria-label={`Best months: ${d.bestMonths.map((x) => MONTHS[x - 1]).join(', ')}`}>
                {MONTHS.map((mo, i) => <span key={mo} className={d.bestMonths.includes(i + 1) ? 'on' : ''}>{mo[0]}<span className="sr-only">{mo}</span></span>)}
              </div>
              <p className="small muted" style={{ marginTop: '0.4rem' }}>{d.seasonsNote}</p>
            </div>
            <div className="row between"><span className="muted small">Getting there</span><span className="small" style={{ textAlign: 'right' }}>{d.gateway ? `Fly to ${d.gateway.name}, then ${d.gateway.mode} ~${fmtDur(d.gateway.minutes)}` : d.access.nearestAirport}</span></div>
          </div>
        </section>

        <LiveWeather d={d} />
        <div>
          <h2 style={{ fontSize: '1.8rem' }}>{d.name} from above</h2>
          <MapFlyIn lat={d.lat} lon={d.lon} name={d.name} zoomTo={d.kind === 'city' || d.kind === 'city-state' ? 14 : 16} from={getDeparture(nearestDeparture(d))} />
        </div>
        <TripExplorer d={d} />

        <section aria-labelledby="media">
          <div className="row between"><h2 id="media" style={{ margin: 0 }}>Photos</h2><span className="tiny muted">Matched via the “{d.wiki.split('#')[0]}” Wikipedia article · Wikimedia Commons</span></div>
          <div style={{ marginTop: '1rem' }}>
            {m.status === 'loading' && <div className="gallery"><figure className="skeleton" /><figure className="skeleton" /><figure className="skeleton" /></div>}
            {m.status === 'ready' && <Gallery images={m.gallery} name={d.name} />}
            {m.status === 'error' && <div className="notice">Photos couldn’t be loaded right now (offline or the media service is busy). Showing an illustration instead.<div style={{ position: 'relative', height: 220, marginTop: '0.8rem', borderRadius: 14, overflow: 'hidden' }}><Illustration scene={d.scene} accent={d.accent} /></div></div>}
          </div>
          <div className="glass panel pad-sm small" style={{ marginTop: '1rem' }}>
            <strong>Video preview:</strong>{' '}
            {d.video ? (
              <video controls preload="none" poster={d.video.poster} style={{ width: '100%', borderRadius: 12, marginTop: 8 }}>
                <source src={d.video.src} />
                {d.video.captions && <track kind="captions" src={d.video.captions} srcLang="en" label="English" default />}
              </video>
            ) : (
              <span className="muted">No licensed, captioned video has been added for {d.name} yet — the photo gallery is shown instead. (See docs/DATA.md to add one.)</span>
            )}
          </div>
        </section>

        <AtmospherePreview d={d} />

        <section aria-labelledby="attr">
          <h2 id="attr">Attractions & experiences</h2>
          <div className="grid grid-auto">
            {d.attractions.map((a) => (
              <div key={a.id} className="glass pad-sm stack" style={{ gap: '0.4rem' }}>
                <strong>{a.name}</strong>
                <div className="row" style={{ gap: '0.35rem' }}>
                  <span className="tag">{fmtDur(a.durationMin)}</span>
                  <span className="tag">{a.costINR ? `~${money(a.costINR)} pp` : 'Free / no ticket'}</span>
                  <span className="tag">{a.indoor ? 'Indoor' : 'Outdoor'}</span>
                  {a.slot !== 'any' && <span className="tag">Best: {a.slot}</span>}
                  {a.difficulty && <span className="tag tag-warn">{a.difficulty}</span>}
                  {a.transferMin && a.transferMin >= 45 ? <span className="tag">~{fmtDur(a.transferMin)} away</span> : null}
                </div>
                {a.note && <span className="tiny muted">{a.note}</span>}
              </div>
            ))}
          </div>
          <p className="tiny muted" style={{ marginTop: '0.6rem' }}>Costs are illustrative Indian-resident entry/activity figures. Opening hours are not listed because they change — verify with the operator before visiting.</p>
        </section>

        <section className="grid grid-2">
          <div className="glass panel pad">
            <h3>Travel styles</h3>
            <table className="cost-table small">
              <thead><tr><th>Style</th><th className="r">Room / night</th><th className="r">Meals pp / day</th></tr></thead>
              <tbody>
                {TIERS.map((t) => (
                  <tr key={t.id}><td><strong>{t.label}</strong><br /><span className="tiny muted">{t.blurb}</span></td><td className="r">{money(d.cost.room[t.id])}</td><td className="r">{money(d.cost.mealsPerPerson[t.id])}</td></tr>
                ))}
              </tbody>
            </table>
            <p className="tiny muted">Illustrative planning figures, not quotes. Price level ×{pl.toFixed(1)} vs. Indian baseline.</p>
          </div>
          <div className="glass panel pad stack">
            <h3>Who it suits</h3>
            {(['couples', 'families', 'solo', 'friends'] as const).map((k) => (
              <div key={k}>
                <div className="row between small"><span style={{ textTransform: 'capitalize' }}>{k === 'solo' ? 'Solo travellers' : k}</span><span className="muted">{d.suitability[k]}/5</span></div>
                <div className="meter"><i style={{ width: `${d.suitability[k] * 20}%` }} /></div>
              </div>
            ))}
            <div>
              <h4 className="small" style={{ marginBottom: '0.2rem' }}>Accessibility & difficulty</h4>
              <p className="small muted" style={{ margin: 0 }}>{d.accessibility}</p>
            </div>
          </div>
        </section>

        <section className="grid grid-2">
          <div className="glass pad"><h3>Food highlights</h3><ul>{d.food.map((f) => <li key={f}>{f}</li>)}</ul></div>
          <div className="glass pad"><h3>Culture</h3><ul>{d.culture.map((f) => <li key={f}>{f}</li>)}</ul></div>
        </section>

        {d.romanceExtras && (
          <section className="glass panel pad">
            <h3>Couple extras available here</h3>
            <div className="row">{d.romanceExtras.map((x) => getService(x)).filter(Boolean).map((s) => <span key={s!.id} className="tag">{s!.name} · ~{money(Math.round(s!.baseINR * pl))}</span>)}</div>
          </section>
        )}

        <section aria-labelledby="pk">
          <h2 id="pk">Suggested packages</h2>
          <p className="muted small">Live estimates from the same calculator as the planner — open one to customise every detail.</p>
          <Packages d={d} />
        </section>

        {nearby.length > 0 && (
          <section aria-labelledby="nb">
            <h2 id="nb">Nearby destinations</h2>
            <div className="grid grid-auto">{nearby.slice(0, 4).map((n) => <DestinationCard key={n.id} d={n} />)}</div>
          </section>
        )}

        <div className="glass panel pad row between">
          <div><h3 style={{ margin: 0 }}>Ready for {d.name}?</h3><p className="small muted" style={{ margin: 0 }}>Build a day-by-day plan with an hourly schedule and transparent estimate.</p></div>
          <button className="btn btn-primary" onClick={plan}>Plan this trip</button>
        </div>
      </div>
    </main>
  );
}
