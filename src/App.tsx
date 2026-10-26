import { Component, lazy, Suspense, useEffect, type ReactNode } from 'react';
import { COMPANY } from './config/company';
import { getDestination } from './data/catalog';
import { Footer, Nav, Toast } from './components/Shell';
import { useRoute } from './lib/router';
import { ATMOSPHERES, useMotion, useStore } from './lib/store';
import Home from './pages/Home';
import { fetchLiveFx } from './lib/live';

const Explore = lazy(() => import('./pages/Explore'));
const DestinationPage = lazy(() => import('./pages/Destination'));
const Planner = lazy(() => import('./pages/Planner'));
const Trip = lazy(() => import('./pages/Trip'));
const Honeymoon = lazy(() => import('./pages/Honeymoon'));
const Weekend = lazy(() => import('./pages/Weekend'));
const Nightlife = lazy(() => import('./pages/Nightlife'));
const Saved = lazy(() => import('./pages/Saved'));
const About = lazy(() => import('./pages/About'));
const Contact = lazy(() => import('./pages/Contact'));
const Info = lazy(() => import('./pages/Info'));
const Place = lazy(() => import('./pages/Place'));

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <main className="page wrap-narrow" id="main">
          <div className="glass panel pad">
            <h1 style={{ fontSize: '2rem' }}>Something went wrong</h1>
            <p className="muted">This part of {COMPANY.name} hit an unexpected error. Your saved trips are stored on this device and are not affected.</p>
            <div className="row">
              <button className="btn btn-primary" onClick={() => location.reload()}>Reload</button>
              <a className="btn" href="#/">Go home</a>
            </div>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}

const TITLES: Record<string, string> = {
  '': 'Explore beautifully. Plan effortlessly.',
  india: 'Explore India', world: 'Explore the World', honeymoon: 'Honeymoon Escapes', weekend: 'Weekend Getaways',
  nightlife: 'Nightlife & Cocktail Experiences', plan: 'Build My Trip', trip: 'Your Trip', saved: 'Saved Trips', about: 'About Travel Guide', contact: 'Contact', terms: 'Terms of use', privacy: 'Privacy', security: 'Security', status: 'Service status', community: 'Community', docs: 'Docs', place: 'Place guide',
};

function useDocumentState() {
  const route = useRoute();
  const { reduced } = useMotion();
  const atmo = useStore((s) => s.prefs.atmosphere);
  const theme = useStore((s) => s.prefs.theme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#eef4f1' : '#0b1f1a');
  }, [theme]);
  useEffect(() => {
    document.documentElement.dataset.motion = reduced ? 'reduced' : 'full';
  }, [reduced]);
  useEffect(() => {
    document.documentElement.style.setProperty('--accent', ATMOSPHERES[atmo].accent);
  }, [atmo]);
  useEffect(() => {
    const key = route.parts[0] ?? '';
    const sub = key === 'destination' ? getDestination(route.parts[1] ?? '')?.name : TITLES[key];
    document.title = key ? `${sub ?? 'Page not found'} — ${COMPANY.name}` : `${COMPANY.name} — ${COMPANY.tagline}`;
    if (key !== '' && !route.query.get('section')) window.scrollTo({ top: 0, behavior: 'auto' });
  }, [route.path]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // Live ECB exchange rates replace the reference rates (manual edits still possible in the planner).
    fetchLiveFx().then((fx) => {
      if (!fx) return;
      const s = useStore.getState();
      s.setPrefs({ fx: { ...s.prefs.fx, ...fx.inrPerUnit } });
      useStore.setState({ fxLive: { date: fx.date, source: fx.source } });
    });
  }, []);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => useStore.setState({ systemReducedMotion: mq.matches });
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return route;
}

function NotFound() {
  return (
    <main className="page wrap-narrow" id="main">
      <div className="page-bg" />
      <div className="glass panel pad">
        <h1 style={{ fontSize: '2.4rem' }}>This path isn’t on the map</h1>
        <p className="muted">The page you’re looking for doesn’t exist.</p>
        <a className="btn btn-primary" href="#/">Back to {COMPANY.name}</a>
      </div>
    </main>
  );
}

export default function App() {
  const route = useDocumentState();
  const [key, sub] = route.parts;
  let page: ReactNode;
  switch (key ?? '') {
    case '': page = <Home />; break;
    case 'india': page = <Explore scope="india" />; break;
    case 'world': page = <Explore scope="world" />; break;
    case 'destination': page = <DestinationPage id={sub ?? ''} />; break;
    case 'plan': page = <Planner />; break;
    case 'trip': page = <Trip />; break;
    case 'honeymoon': page = <Honeymoon />; break;
    case 'weekend': page = <Weekend />; break;
    case 'nightlife': page = <Nightlife />; break;
    case 'saved': page = <Saved />; break;
    case 'about': page = <About />; break;
    case 'contact': page = <Contact />; break;
    case 'place': page = <Place />; break;
    case 'terms': case 'privacy': case 'security': case 'status': case 'community': case 'docs':
      page = <Info kind={key as 'terms'} />; break;
    default: page = <NotFound />;
  }
  return (
    <>
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden focusable="false">
        <filter id="liquid-glass" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.006 0.011" numOctaves="2" seed="11" result="noise" />
          <feGaussianBlur in="noise" stdDeviation="2" result="soft" />
          <feDisplacementMap in="SourceGraphic" in2="soft" scale="46" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); document.getElementById('main')?.scrollIntoView(); }}>Skip to content</a>
      <Nav />
      <ErrorBoundary key={route.path}>
        <Suspense fallback={<main className="page" id="main"><div className="page-bg" /><div className="loader"><div className="spinner" /><p className="small">Loading…</p></div></main>}>
          <div className={key ? 'route-stage' : undefined} key={route.path}>{page}</div>
        </Suspense>
      </ErrorBoundary>
      <Footer />
      <Toast />
    </>
  );
}
