import { localImages, srcOf } from '../lib/localMedia';
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { budgetBand, DESTINATIONS, filterDestinations, getDestination, INTEREST_LABELS, KIND_LABEL, MONTHS, searchDestinations } from '../data/catalog';
import type { Destination, Interest } from '../data/types';
import { audio, sceneAmbience } from '../lib/audio';
import { useMedia } from '../lib/media';
import { href, navigate } from '../lib/router';
import { useMotion, useStore } from '../lib/store';
import { webglAvailable } from '../lib/interactions';
import { DestImage } from './DestImage';
import { Illustration } from './Illustration';

const Globe = lazy(() => import('../scene/Globe'));

/** Mount children only once near the viewport; report visibility for pausing. */
export function LazyMount({ children, minHeight = 300, onVisible }: { children: (visible: boolean) => ReactNode; minHeight?: number; onVisible?: (v: boolean) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const io = new IntersectionObserver(([e]) => {
      setVisible(e.isIntersecting);
      onVisible?.(e.isIntersecting);
      if (e.isIntersecting) setMounted(true);
    }, { rootMargin: '200px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [onVisible]);
  return <div ref={ref} style={{ minHeight }}>{mounted ? children(visible) : null}</div>;
}

export function placeLabel(d: Destination) {
  return d.scope === 'india' ? `${KIND_LABEL[d.kind]} · ${d.state}` : `${KIND_LABEL[d.kind]} · ${d.country}`;
}

export function DestinationCard({ d, onOpen }: { d: Destination; onOpen?: (d: Destination, e: React.MouseEvent) => void }) {
  const band = budgetBand(d);
  return (
    <article className="card glass" data-tilt style={{ ['--dest-accent' as string]: d.accent }}>
      <a className="dcard" href={href(`/destination/${d.id}`)} onClick={(e) => { if (onOpen) { e.preventDefault(); onOpen(d, e); } }}>
        <div className="media"><DestImage dest={d} /></div>
        <div className="body">
          <span className="tiny muted">{placeLabel(d)}</span>
          <h3 style={{ margin: 0 }}>{d.name}</h3>
          <p className="small muted" style={{ margin: 0 }}>{d.tagline}</p>
          <div className="meta" style={{ marginTop: 'auto', paddingTop: '0.5rem' }}>
            <span className="tag">{d.days[0] === d.days[1] ? d.days[0] : `${d.days[0]}–${d.days[1]}`} days</span>
            <span className="tag">{band === 'budget' ? '₹ value' : band === 'mid' ? '₹₹ mid-range' : band === 'premium' ? '₹₹₹ premium' : '₹₹₹₹ luxury'}</span>
            <span className="tag">Best: {d.bestMonths.slice(0, 3).map((m) => MONTHS[m - 1]).join(', ')}{d.bestMonths.length > 3 ? '…' : ''}</span>
          </div>
        </div>
      </a>
    </article>
  );
}

/** Circular destination portal with a location pin. */
export function Portal({ d, onOpen }: { d: Destination; onOpen: (d: Destination, e: React.MouseEvent) => void }) {
  const local = localImages(d.id)[0];
  const m = useMedia(local ? undefined : d.wiki, 1);
  const [broken, setBroken] = useState(false);
  return (
    <button className="portal" onClick={(e) => onOpen(d, e)} style={{ ['--pa' as string]: d.accent }} aria-label={`Open ${d.name} portal`}>
      <span className="portal-ring">
        <span className="disc">
          {local && !broken ? <img src={srcOf(local, 'card')} alt="" loading="lazy" onError={() => setBroken(true)} />
            : m.lead && !broken ? <img src={m.lead.src} alt="" loading="lazy" onError={() => setBroken(true)} /> : <Illustration scene={d.scene} accent={d.accent} label={false} />}
        </span>
      </span>
      <b>{d.name}</b>
      <small>{d.scope === 'india' ? d.state : d.country}</small>
    </button>
  );
}

/** Full-screen portal transition revealing the destination, with replay / back / close. */
export function PortalOverlay({ d, origin, onClose, onBack }: { d: Destination; origin: { x: number; y: number }; onClose: () => void; onBack?: () => void }) {
  const { reduced } = useMotion();
  const m = useMedia(d.wiki, 1);
  const stamp = useStore((s) => s.stamp);
  const stamped = useStore((s) => s.passport.some((p) => p.id === d.id));
  const startPlan = useStore((s) => s.startPlan);
  const [open, setOpen] = useState(false);
  const [run, setRun] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    setOpen(false);
    audio.whoosh();
    audio.play(sceneAmbience[d.scene] ?? 'forest');
    const t = requestAnimationFrame(() => requestAnimationFrame(() => setOpen(true)));
    return () => cancelAnimationFrame(t);
  }, [d, run]);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);
  return (
    <div className="portal-overlay" role="dialog" aria-modal="true" aria-label={`${d.name} preview`} style={{ ['--ox' as string]: `${origin.x}px`, ['--oy' as string]: `${origin.y}px`, ['--dest-accent' as string]: d.accent }}>
      <div className={`portal-reveal ${open ? 'open' : ''}`}>
        {m.lead ? <div className="bg" style={{ backgroundImage: `url("${m.lead.srcLarge}")` }} /> : <div className="bg"><Illustration scene={d.scene} accent={d.accent} /></div>}
      </div>
      {!reduced && <div key={run} className={`portal-plane ${open ? 'fly' : ''}`} aria-hidden>✈</div>}
      <div className="portal-controls">
        {onBack && <button className="btn btn-sm" onClick={onBack}>← Back</button>}
        <button className="btn btn-sm" onClick={() => setRun((r) => r + 1)} aria-label="Replay transition">↻ Replay</button>
        <button ref={closeRef} className="btn btn-sm" onClick={onClose} aria-label="Close preview">✕ Close</button>
      </div>
      <div className="portal-content wrap fade-in" key={`c${run}`}>
        <div style={{ maxWidth: 620 }}>
          <span className="eyebrow">{placeLabel(d)}</span>
          <h2 style={{ fontSize: 'clamp(2.2rem, 5vw, 4rem)' }}>{d.name}</h2>
          <p className="lead">{d.why}</p>
          <div className="row" style={{ margin: '1rem 0' }}>
            <span className="tag">Ideal {d.days[1]} days</span>
            <span className="tag">Best {d.bestMonths.map((x) => MONTHS[x - 1]).slice(0, 4).join(' · ')}</span>
            {d.interests.slice(0, 3).map((i) => <span key={i} className="tag">{INTEREST_LABELS[i]}</span>)}
          </div>
          <div className="glass panel pad-sm small" style={{ marginBottom: '1.2rem' }}>
            <strong>Highlights:</strong> {d.attractions.slice(0, 4).map((a) => a.name).join(' · ')}
          </div>
          <div className="row">
            <button className="btn btn-primary" data-magnetic onClick={() => { startPlan({ destIds: [d.id], days: Math.max(2, d.days[1]) }); onClose(); navigate('/plan'); }}>Plan this trip</button>
            <a className="btn" href={href(`/destination/${d.id}`)} onClick={onClose}>Full destination guide</a>
            <button className="btn btn-ghost" onClick={() => stamp(d.id)} disabled={stamped}>{stamped ? '✓ In your passport' : '＋ Passport stamp'}</button>
          </div>
          {m.lead?.author && <p className="tiny muted" style={{ marginTop: '1rem' }}>Photo: <a href={m.lead.page} target="_blank" rel="noreferrer">{m.lead.author}</a>{m.lead.license ? `, ${m.lead.license}` : ''} via Wikimedia Commons.</p>}
          {!m.lead && m.status !== 'loading' && <p className="tiny muted">Photo unavailable — showing an illustration.</p>}
        </div>
      </div>
    </div>
  );
}

/** Opening a place goes straight to its full page (no preview overlay). */
export function usePortal() {
  const open = (d: Destination, _e?: { clientX: number; clientY: number }) => {
    audio.whoosh();
    navigate(`/destination/${d.id}`);
  };
  return { open, node: null as null, current: undefined as Destination | undefined };
}

const FILTERS: Interest[] = ['nature', 'beaches', 'mountains', 'culture', 'adventure', 'romance', 'family', 'nightlife'];

/** Globe + accessible searchable list + filters. */
export function DestinationFinder({ scope, title, onOpen }: { scope: 'india' | 'world' | 'all'; title?: string; onOpen: (d: Destination, e?: { clientX: number; clientY: number }) => void }) {
  const { paused, reduced, lightweight } = useMotion();
  const webglFailed = useStore((s) => s.webglFailed);
  const [q, setQ] = useState('');
  const [interests, setInterests] = useState<Interest[]>([]);
  const [maxDays, setMaxDays] = useState<number | undefined>();
  const [budget, setBudget] = useState<'budget' | 'mid' | 'premium' | 'luxury' | undefined>();
  const [month, setMonth] = useState<number | undefined>();
  const [selected, setSelected] = useState<string | undefined>();
  const [globeVisible, setGlobeVisible] = useState(false);
  const base = useMemo(() => DESTINATIONS.filter((d) => scope === 'all' || d.scope === scope), [scope]);
  const list = useMemo(() => filterDestinations(searchDestinations(q, base), { interests, maxDays, budget, month }), [q, base, interests, maxDays, budget, month]);
  const canGlobe = !lightweight && !webglFailed && webglAvailable();
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);
  // Highlight + short globe camera move first, then reveal the portal.
  const select = (d: Destination, e?: { clientX: number; clientY: number }) => {
    setSelected(d.id);
    window.clearTimeout(timer.current);
    const pt = e ? { clientX: e.clientX, clientY: e.clientY } : undefined;
    timer.current = window.setTimeout(() => onOpen(d, pt), reduced || !canGlobe || !globeVisible ? 0 : 1100);
  };
  return (
    <div className="grid grid-2" style={{ alignItems: 'start' }}>
      <div className="glass pad" style={{ position: 'relative' }}>
        {title && <h3>{title}</h3>}
        {canGlobe ? (
          <LazyMount minHeight={320} onVisible={setGlobeVisible}>
            {() => (
              <div className="globe-wrap">
                <Suspense fallback={<div className="loader"><div className="spinner" /><span className="small">Loading globe…</span></div>}>
                  <Globe destinations={list} selectedId={selected} onSelect={(id) => select(getDestination(id)!)} paused={paused || !globeVisible} reduced={reduced} initial={scope === 'world' ? 'world' : 'india'} />
                </Suspense>
              </div>
            )}
          </LazyMount>
        ) : (
          <div className="notice info">The 3D globe is off ({lightweight ? 'lightweight mode' : 'WebGL unavailable'}). Use the searchable list to explore.</div>
        )}
        <p className="tiny muted" style={{ marginTop: '0.6rem' }}>Drag to rotate · select a marker to open its portal · green markers are in India, blue are international. The list beside the globe offers the same destinations for keyboard and screen-reader users.</p>
      </div>
      <div className="glass panel pad">
        <div className="field">
          <label htmlFor={`search-${scope}`}>Search destinations, states, countries or attractions</label>
          <input id={`search-${scope}`} className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Bangalore, beaches, Thailand, Taj Mahal" />
        </div>
        <fieldset style={{ marginTop: '0.8rem' }}>
          <legend>Interests</legend>
          <div className="row" style={{ gap: '0.4rem' }}>
            {FILTERS.map((i) => (
              <button key={i} className="chip" aria-pressed={interests.includes(i)} onClick={() => setInterests((x) => (x.includes(i) ? x.filter((y) => y !== i) : [...x, i]))}>{INTEREST_LABELS[i]}</button>
            ))}
          </div>
        </fieldset>
        <div className="form-grid" style={{ marginTop: '0.8rem' }}>
          <div className="field">
            <label htmlFor={`dur-${scope}`}>Trip duration</label>
            <select id={`dur-${scope}`} className="input" value={maxDays ?? ''} onChange={(e) => setMaxDays(e.target.value ? Number(e.target.value) : undefined)}>
              <option value="">Any</option><option value="2">Weekend (≤2 days)</option><option value="4">Short (≤4 days)</option><option value="7">Up to a week</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor={`bud-${scope}`}>Budget</label>
            <select id={`bud-${scope}`} className="input" value={budget ?? ''} onChange={(e) => setBudget((e.target.value || undefined) as typeof budget)}>
              <option value="">Any</option><option value="budget">Value</option><option value="mid">Mid-range</option><option value="premium">Premium</option><option value="luxury">Luxury</option>
            </select>
          </div>
          <div className="field full">
            <label htmlFor={`mon-${scope}`}>Good to visit in</label>
            <select id={`mon-${scope}`} className="input" value={month ?? ''} onChange={(e) => setMonth(e.target.value ? Number(e.target.value) : undefined)}>
              <option value="">Any month</option>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
        </div>
        <p className="small muted" aria-live="polite" style={{ margin: '0.8rem 0 0.4rem' }}>{list.length} destination{list.length === 1 ? '' : 's'} match</p>
        <div className="dest-list" role="list">
          {list.map((d) => (
            <div role="listitem" key={d.id}>
              <button aria-pressed={selected === d.id} onClick={(e) => select(d, e)}>
                <span><b>{d.name}</b><br /><span className="tiny muted">{placeLabel(d)}</span></span>
                <span className="tag" style={{ background: d.accent, color: '#07150f' }}>Open</span>
              </button>
            </div>
          ))}
          {!list.length && <p className="muted small">No destinations match. Try removing a filter.</p>}
        </div>
      </div>
    </div>
  );
}
