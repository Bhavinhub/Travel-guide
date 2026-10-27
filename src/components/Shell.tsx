import { useEffect, useRef, useState } from 'react';
import { COMPANY } from '../config/company';
import { href, navigate, useRoute } from '../lib/router';
import { useStore } from '../lib/store';
import { LogoMark, Wordmark } from './Logo';
import { searchDestinations } from '../data/catalog';
import { localImages, srcOf } from '../lib/localMedia';
import { useMoney } from '../lib/store';
import { quickEstimate } from '../lib/tiers';
import { cacheSearch, cachedSearch, clearSearches, geocode, mergeHits, placeHref, recentSearches, rememberSearch, wikiSearch, type PlaceHit, type RecentSearch } from '../lib/places';

/**
 * Search anything: curated destinations first (with instant 1-day / 2-day estimates), then live
 * results for any town, state, country, landmark or person. Recent searches are kept on this device.
 */
function NavSearch({ id = 'nav-q' }: { id?: string }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [live, setLive] = useState<{ q: string; hits: PlaceHit[]; loading: boolean }>({ q: '', hits: [], loading: false });
  const [recent, setRecent] = useState<RecentSearch[]>(recentSearches);
  const [active, setActive] = useState(-1);
  const pendingEnter = useRef(false);
  const picked = useRef(false);
  const money = useMoney();
  const term = q.trim();
  const curated = term.length >= 2 ? searchDestinations(term).slice(0, 4) : [];
  useEffect(() => {
    setActive(-1);
    if (term.length < 2) { setLive({ q: '', hits: [], loading: false }); return; }
    const notCurated = (hs: PlaceHit[]) => hs.filter((h) => !curated.some((d) => d.name.toLowerCase() === h.name.toLowerCase()));
    const cached = cachedSearch(term);
    if (cached) { setLive({ q: term, hits: notCurated(cached), loading: false }); return; }
    const ctl = new AbortController();
    setLive((l) => ({ ...l, loading: true }));
    // Show places the moment they arrive; Wikipedia topics join when ready.
    const t = setTimeout(() => {
      let places: PlaceHit[] = [], topics: PlaceHit[] = [], pending = 2;
      const update = () => {
        if (ctl.signal.aborted) return;
        const hits = mergeHits(places, topics, term);
        if (!pending) cacheSearch(term, hits);
        setLive({ q: term, hits: notCurated(hits), loading: pending > 0 });
      };
      geocode(term, ctl.signal).then((x) => { places = x; }).catch(() => undefined).finally(() => { pending--; update(); });
      wikiSearch(term, ctl.signal).then((x) => { topics = x; }).catch(() => undefined).finally(() => { pending--; update(); });
    }, 160);
    return () => { clearTimeout(t); ctl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);
  const go = (to: string, label: string, sub?: string) => {
    rememberSearch({ label, sub, to });
    setRecent(recentSearches());
    setQ(''); setOpen(false); setActive(-1);
    pendingEnter.current = false;
    (document.activeElement as HTMLElement | null)?.blur();
    window.dispatchEvent(new Event('tg:search-go')); // closes the phone menu, even for the page already open
    navigate(to);
  };
  const hits = live.q === term ? live.hits : [];
  const showRecent = term.length < 2 && recent.length > 0;
  const show = open && (showRecent || term.length >= 2);
  // Everything in the list, in display order — used by the arrow keys and Enter.
  const options: { key: string; to: string; label: string; sub?: string }[] = showRecent
    ? recent.map((r) => ({ key: `r-${r.to}`, to: r.to, label: r.label, sub: r.sub }))
    : [
        ...curated.map((d) => ({ key: `d-${d.id}`, to: `/destination/${d.id}`, label: d.name, sub: d.state ?? d.country })),
        ...hits.map((h, i) => ({ key: `h-${i}-${h.name}`, to: placeHref(h), label: h.name, sub: [h.region, h.country].filter(Boolean).join(', ') || h.detail })),
      ];
  const pick = (i: number) => { const o = options[i]; if (o) go(o.to, o.label, o.sub); };
  // Enter pressed before live results arrived: open the best match as soon as it does.
  useEffect(() => {
    if (pendingEnter.current && !live.loading && live.q === term && options.length) pick(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      if (options.length) setActive((i) => (e.key === 'ArrowDown' ? (i + 1) % options.length : (i <= 0 ? options.length - 1 : i - 1)));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active >= 0 && options[active]) pick(active);
      else if (options.length && !(term.length >= 2 && live.loading && !curated.length)) pick(0);
      else if (term.length >= 2) pendingEnter.current = true;
    } else if (e.key === 'Escape') {
      setOpen(false); setActive(-1);
    } else setOpen(true);
  };
  useEffect(() => { document.getElementById(`${id}-opt-${active}`)?.scrollIntoView({ block: 'nearest' }); }, [active, id]);
  // Keeping focus in the box while a suggestion is pressed: Safari does not focus links on click,
  // so without this the box blurs, the list closes and the click never lands.
  const keepFocus = (e: React.MouseEvent) => { e.preventDefault(); picked.current = false; };
  const optProps = (i: number, to: string) => ({
    id: `${id}-opt-${i}`, role: 'option', 'aria-selected': active === i, className: active === i ? 'is-active' : undefined,
    href: href(to), onMouseDown: keepFocus, onMouseEnter: () => setActive(i),
    // Mouse/pen: open on release, even if the list re-drew under the pointer since it was pressed.
    onPointerUp: (e: React.PointerEvent) => { if (e.pointerType !== 'touch' && e.button === 0) { e.preventDefault(); picked.current = true; pick(i); } },
    // Touch and keyboard activation.
    onClick: (e: React.MouseEvent) => { e.preventDefault(); if (!picked.current) pick(i); picked.current = false; },
  });
  let n = 0;
  return (
    <div className="nav-search" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) { setOpen(false); setActive(-1); } }}>
      <label htmlFor={id} className="sr-only">Search any place or person</label>
      <input id={id} className="input" type="search" placeholder="Search any place, e.g. Almora" value={q} autoComplete="off" enterKeyHint="search"
        onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => { setRecent(recentSearches()); setOpen(true); }}
        onClick={() => setOpen(true)} onKeyDown={onKey}
        role="combobox" aria-autocomplete="list" aria-expanded={show} aria-controls={`${id}-results`} aria-activedescendant={active >= 0 ? `${id}-opt-${active}` : undefined} />
      {show && (
        <div id={`${id}-results`} className="nav-results glass panel" role="listbox" onMouseDown={keepFocus}>
          {showRecent && (
            <>
              <div className="row between nav-results-head"><span className="tiny muted">Recent searches</span>
                <button className="tiny linkish" onClick={() => { clearSearches(); setRecent([]); }}>Clear</button></div>
              {recent.map((r) => {
                const i = n++;
                return (
                  <a key={r.to} {...optProps(i, r.to)}>
                    <span className="ph ico" aria-hidden>↺</span><span><b>{r.label}</b>{r.sub && <><br /><span className="tiny muted">{r.sub}</span></>}</span>
                  </a>
                );
              })}
            </>
          )}
          {!showRecent && curated.map((d) => {
            const i = n++;
            const img = localImages(d.id)[0];
            const one = quickEstimate(d.id, 1);
            const two = quickEstimate(d.id, 2);
            return (
              <a key={d.id} {...optProps(i, `/destination/${d.id}`)}>
                {img ? <img src={srcOf(img, 'card')} alt="" /> : <span className="ph" />}
                <span><b>{d.name}</b> <span className="tiny muted">{d.scope === 'india' ? d.state : d.country}</span><br />
                  <span className="tiny">Day trip {money(one.total)} · 2 days {money(two.total)}</span></span>
              </a>
            );
          })}
          {!showRecent && hits.length > 0 && <div className="tiny muted nav-results-head">Places, landmarks & people</div>}
          {!showRecent && hits.map((h, hi) => {
            const i = n++;
            const sub = [h.region, h.country].filter(Boolean).join(', ');
            return (
              <a key={`${hi}-${h.kind}-${h.name}`} {...optProps(i, placeHref(h))}>
                {h.thumb ? <img src={h.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="ph ico" aria-hidden>{h.kind === 'place' ? '📍' : '📖'}</span>}
                <span>{h.suggested && <span className="tag pack-must" style={{ marginLeft: 0, marginRight: '.35rem' }}>Did you mean</span>}<b>{h.name}</b>{sub && <span className="tiny muted"> {sub}</span>}<br /><span className="tiny muted">{h.detail ?? (h.kind === 'place' ? 'Place' : 'Wikipedia')}</span></span>
              </a>
            );
          })}
          {term.length >= 2 && live.loading && <p className="tiny muted" style={{ margin: '.4rem .5rem' }}>Searching everywhere…</p>}
          {term.length >= 2 && !live.loading && live.q === term && !curated.length && !hits.length && <p className="small muted" style={{ margin: '.5rem' }}>No match for “{term}”. Check the spelling or try a nearby town.</p>}
          {!showRecent && curated.length > 0 && <p className="tiny muted" style={{ margin: '.3rem .5rem' }}>Estimates for 2 adults from the nearest major city, 3-star stay.</p>}
        </div>
      )}
    </div>
  );
}

export const NAV = [
  { to: '/', label: 'Home' },
  { to: '/india', label: 'Explore India' },
  { to: '/world', label: 'Explore the World' },
  { to: '/honeymoon', label: 'Honeymoon Escapes' },
  { to: '/weekend', label: 'Weekend Getaways' },
  { to: '/nightlife', label: 'Nightlife & Cocktail Experiences' },
  { to: '/plan', label: 'Build My Trip' },
  { to: '/saved', label: 'Saved Trips' },
  { to: '/about', label: 'About Travel Guide' },
  { to: '/contact', label: 'Contact' },
];
const INLINE = ['/india', '/world', '/honeymoon', '/weekend', '/nightlife', '/saved'];
const SHORT: Record<string, string> = { '/nightlife': 'Nightlife', '/honeymoon': 'Honeymoon', '/weekend': 'Weekends', '/saved': 'Saved' };

function isCurrent(path: string, to: string) {
  if (to === '/') return path === '/';
  return path === to || path.startsWith(`${to}/`);
}

export function Nav() {
  const { path } = useRoute();
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    const close = () => setOpen(false);
    addEventListener('tg:search-go', close);
    return () => removeEventListener('tg:search-go', close);
  }, []);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  return (
    <>
      <header className="nav glass" role="banner">
        <a className="brand" href={href('/')} aria-label={`${COMPANY.name} home`}>
          <LogoMark />
          <Wordmark />
        </a>
        <nav aria-label="Main">
          <ul className="nav-links">
            {NAV.filter((n) => INLINE.includes(n.to)).map((n) => (
              <li key={n.to}>
                <a href={href(n.to)} aria-current={isCurrent(path, n.to) ? 'page' : undefined}>{SHORT[n.to] ?? n.label.replace('Explore ', '')}</a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="nav-tools">
          <NavSearch />
          <a className="btn btn-primary btn-sm hide-sm" href={href('/plan')} data-magnetic>Build My Trip</a>
          <button className="btn btn-sm menu-btn" style={{ display: 'inline-flex' }} aria-expanded={open} aria-controls="site-menu" onClick={() => setOpen(true)}>
            <span aria-hidden>☰</span> <span className="menu-label">Menu</span>
          </button>
          <ThemeToggle />
        </div>
      </header>
      {open && (
        <div className="drawer" onClick={() => setOpen(false)}>
          <div className="drawer-panel glass panel pad" id="site-menu" role="dialog" aria-modal="true" aria-label="Site menu" onClick={(e) => e.stopPropagation()}>
            <div className="row between" style={{ marginBottom: '1rem' }}>
              <span className="row"><LogoMark size={30} /><Wordmark /></span>
              <button ref={closeRef} className="btn btn-sm btn-icon" aria-label="Close menu" onClick={() => setOpen(false)}>✕</button>
            </div>
            <div className="drawer-search"><NavSearch id="menu-q" /></div>
            <nav aria-label="All sections">
              {NAV.map((n) => (
                <a key={n.to} href={href(n.to)} aria-current={isCurrent(path, n.to) ? 'page' : undefined}>{n.label}</a>
              ))}
            </nav>
            <p className="muted small" style={{ marginTop: '1rem' }}>{COMPANY.tagline}</p>
          </div>
        </div>
      )}
    </>
  );
}

const STORE_GROUPS = [
  { id: 'prefs', label: 'Preferences', detail: 'Theme and display currency.', keys: ['tg.prefs'] },
  { id: 'trips', label: 'Saved trips & passport', detail: 'Plans you saved and destination stamps.', keys: ['tg.trips', 'tg.passport'] },
  { id: 'draft', label: 'Current plan', detail: 'The trip you are editing.', keys: ['tg.draft'] },
  { id: 'search', label: 'Recent searches & place guides', detail: 'Places you searched for.', keys: ['tg.recentSearches', 'tg.places'] },
  { id: 'cache', label: 'Cached data', detail: 'Exchange rates and quote requests saved on this device.', keys: ['tg.fxLive', 'tg.quoteRequests', 'tg.lastQuote'] },
];

/** Shows exactly what is stored in this browser and lets the visitor clear it. */
function CookieManager({ onClose }: { onClose: () => void }) {
  const [sel, setSel] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const size = (keys: string[]) => keys.reduce((n, k) => { try { return n + (localStorage.getItem(k)?.length ?? 0); } catch { return n; } }, 0);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [onClose]);
  const clear = () => {
    STORE_GROUPS.filter((g) => sel.includes(g.id)).forEach((g) => g.keys.forEach((k) => { try { localStorage.removeItem(k); } catch { /* blocked */ } }));
    setDone(true);
  };
  return (
    <div className="drawer" onClick={onClose}>
      <div className="glass panel pad cookie-panel" role="dialog" aria-modal="true" aria-labelledby="ck-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="ck-title" style={{ fontSize: '1.4rem' }}>Cookies & storage</h2>
        <p className="small muted">{COMPANY.name} uses <b>no tracking or advertising cookies</b>. It only keeps the items below in your browser so the site remembers your choices. Nothing here is sent to us.</p>
        <div className="stack" style={{ gap: '.5rem' }}>
          {STORE_GROUPS.map((g) => (
            <label key={g.id} className="check">
              <input type="checkbox" checked={sel.includes(g.id)} onChange={(e) => setSel((x) => (e.target.checked ? [...x, g.id] : x.filter((y) => y !== g.id)))} />
              <span><b>{g.label}</b> <span className="tiny muted">({(size(g.keys) / 1024).toFixed(1)} KB)</span><br /><span className="tiny muted">{g.detail}</span></span>
            </label>
          ))}
        </div>
        {done && <p className="notice info small" role="status">Cleared. Reload the page to start fresh.</p>}
        <div className="row" style={{ marginTop: '1rem' }}>
          <button className="btn btn-primary" disabled={!sel.length} onClick={clear}>Clear selected</button>
          {done ? <button className="btn" onClick={() => location.reload()}>Reload</button> : <button className="btn" onClick={onClose}>Close</button>}
        </div>
      </div>
    </div>
  );
}

export function Footer() {
  const [cookiesOpen, setCookiesOpen] = useState(false);
  return (
    <footer className="footer" role="contentinfo">
      <div className="wrap footer-grid">
        <div>
          <div className="row" style={{ marginBottom: '0.8rem' }}><LogoMark /><Wordmark /></div>
          <p className="small">{COMPANY.tagline}</p>
          <p className="tiny muted">Destination catalog is a curated selection. Prices are illustrative estimates, not quotes or confirmed availability.</p>
        </div>
        <div>
          <h4 className="small">Discover</h4>
          <div className="stack small">
            <a href={href('/india')}>Explore India</a><br />
            <a href={href('/world')}>Explore the World</a><br />
            <a href={href('/honeymoon')}>Honeymoon Escapes</a><br />
            <a href={href('/weekend')}>Weekend Getaways</a><br />
            <a href={href('/nightlife')}>Nightlife & Cocktails</a>
          </div>
        </div>
        <div>
          <h4 className="small">Plan</h4>
          <div className="stack small">
            <a href={href('/plan')}>Build My Trip</a><br />
            <a href={href('/saved')}>Saved Trips & Passport</a><br />
            <a href={href('/saved?compare=1')}>Compare Trips</a>
          </div>
        </div>
        <div>
          <h4 className="small">{COMPANY.name}</h4>
          <div className="stack small">
            <a href={href('/about')}>About & credits</a><br />
            <a href={href('/contact')}>Contact / Request a Quote</a>
          </div>
        </div>
      </div>
      <div className="wrap">
        <nav className="footer-bar" aria-label="Legal and help">
          <span className="copy">© {new Date().getFullYear()} {COMPANY.name}</span>
          <a href={href('/terms')}>Terms</a>
          <a href={href('/privacy')}>Privacy</a>
          <a href={href('/security')}>Security</a>
          <a href={href('/status')}>Status</a>
          <a href={href('/community')}>Community</a>
          <a href={href('/docs')}>Docs</a>
          <a href={href('/contact')}>Contact</a>
          <button onClick={() => setCookiesOpen(true)}>Manage cookies</button>
        </nav>
        <p className="tiny muted" style={{ marginTop: '.8rem' }}>Photos by Wikimedia Commons and Unsplash photographers under their licences — full credits on the About page.</p>
      </div>
      {cookiesOpen && <CookieManager onClose={() => setCookiesOpen(false)} />}
    </footer>
  );
}

/** Compact Sun / Moon switch in the header: switches the whole site between light and dark themes. */
export function ThemeToggle() {
  const theme = useStore((s) => s.prefs.theme);
  const setPrefs = useStore((s) => s.setPrefs);
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button className={`theme-toggle ${theme}`} onClick={() => setPrefs({ theme: next })} title={theme === 'light' ? 'Sun mode — switch to moon' : 'Moon mode — switch to sun'}
      aria-label={`Switch to ${next === 'light' ? 'sun (light)' : 'moon (dark)'} mode`} aria-pressed={theme === 'light'}>
      <span className="tt-track" aria-hidden><span className="tt-knob">{theme === 'light' ? '☀' : '☾'}</span></span>
    </button>
  );
}

export function Toast() {
  const toast = useStore((s) => s.toast);
  const notify = useStore((s) => s.notify);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => notify(null), 4200);
    return () => clearTimeout(t);
  }, [toast, notify]);
  return (
    <div aria-live="polite" role="status">
      {toast && <div className="toast glass panel">{toast}</div>}
    </div>
  );
}

export function go(to: string) {
  navigate(to);
}
