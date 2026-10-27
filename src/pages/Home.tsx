import { PageDolly } from '../components/PageDolly';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { COMPANY } from '../config/company';
import { getDestination } from '../data/catalog';
import type { Destination } from '../data/types';
import { DestinationFinder, Portal, usePortal } from '../components/discovery';
import { MoodCompass, SurpriseMe } from '../components/features';
import { FxLayer, type Fx } from '../components/FxLayer';
import { MomentsMarquee, PhotoRing, usePointerDepth, type StageChapter } from '../components/PhotoStage';
import { audio, type Ambience } from '../lib/audio';
import { estimateTrip } from '../lib/estimate';
import { generateItinerary } from '../lib/itinerary';
import { href, navigate } from '../lib/router';
import { useMoney, useMotion, useStore } from '../lib/store';
import { defaultConfig } from '../lib/trip';
import { localImages } from '../lib/localMedia';

import { dolly } from '../scene/dollyState';

const CHAPTERS = [
  { id: 'forest', title: 'Kedarnath Temple', short: 'Kedarnath' },
  { id: 'rainforest', title: 'Kerala backwaters', short: 'Backwaters' },
  { id: 'valley', title: 'Pangong Lake, Ladakh', short: 'Ladakh' },
  { id: 'snow', title: 'Himalayan snow lakes', short: 'Snow' },
  { id: 'beach', title: 'Maldives', short: 'Islands' },
  { id: 'city', title: 'Mumbai at night', short: 'Mumbai' },
  { id: 'discover', title: 'Taj Mahal · plan your trip', short: 'Taj Mahal' },
];

/** Real photographs per chapter (downloaded from Wikimedia Commons; see CREDITS.md). */
export const STAGE: (StageChapter & { fx: Fx; ambience: Ambience })[] = [
  { id: 'forest', media: 'kedarnath-day', focusY: 0.42, fallbackWiki: 'Kedarnath Temple', accent: '#f4dca0', fx: 'pollen', ambience: 'forest', depth: [{ media: 'badrinath-day', label: 'Badrinath Temple' }, { media: 'u-taj', label: 'Taj Mahal' }] },
  { id: 'rainforest', media: 'u-kerala', fallbackWiki: 'Athirappilly Falls', accent: '#5fbf86', fx: 'pollen', ambience: 'rain', depth: [{ media: 'm-elephant', label: 'Asian elephants' }, { media: 'm-backwaters', label: 'Kerala backwaters' }] },
  { id: 'valley', media: 'u-pangong', fallbackWiki: 'Kullu Valley', accent: '#a9d6ff', fx: 'pollen', ambience: 'wind', depth: [{ media: 'm-tahr', label: 'Nilgiri tahr' }, { media: 'manali', label: 'Manali' }] },
  { id: 'snow', media: 'ch-snow', fallbackWiki: 'Gurudongmar Lake', accent: '#dbeeff', fx: 'snow', ambience: 'wind', depth: [{ media: 'leh', label: 'Leh' }, { media: 'srinagar', index: 1, label: 'Kashmir' }] },
  { id: 'beach', media: 'u-maldives', fallbackWiki: 'Radhanagar Beach', accent: '#4fd3e0', fx: 'spray', ambience: 'ocean', depth: [{ media: 'goa', label: 'Goa' }, { media: 'male', label: 'Maldives' }] },
  { id: 'city', media: 'u-mumbai', fallbackWiki: 'Marine Drive, Mumbai', accent: '#ffcf8a', fx: 'bokeh', ambience: 'city', depth: [{ media: 'm-shibuya', label: 'Tokyo' }, { media: 'm-timessq', label: 'New York' }] },
  { id: 'discover', media: 'u-taj', fallbackWiki: 'Taj Mahal', accent: '#c9b6ff', fx: 'stars', ambience: 'wind', depth: [{ media: 'm-holi', label: 'Holi' }, { media: 'm-aarti', label: 'Ganga aarti' }] },
];

const STORIES: { eyebrow: string; title: string; body: string; portals: string[]; side?: 'right' }[] = [
  { eyebrow: 'Chapter 1 · Forest & hills', title: 'Discover your next extraordinary journey.', body: 'Explore India and the world through immersive destinations, personalised itineraries, and clear travel estimates.', portals: [] },
  { eyebrow: 'Chapter 2 · Kerala backwaters', title: 'Where the monsoon paints everything green.', body: 'Coffee estates in the clouds, backwaters lined with palms and waterfalls that roar after the rains. The Western Ghats are among the most biodiverse places on Earth.', portals: ['coorg', 'munnar', 'alleppey', 'wayanad', 'bali', 'chiang-mai'], side: 'right' },
  { eyebrow: 'Chapter 3 · Pangong Lake, Ladakh', title: 'Valleys carved by rivers and time.', body: 'Pine-scented trails, orchard villages and alpine lakes — from the Kullu Valley to the Bernese Oberland.', portals: ['manali', 'srinagar', 'nainital', 'shimla', 'rishikesh', 'interlaken', 'lucerne'] },
  { eyebrow: 'Chapter 4 · Gurudongmar Lake, Sikkim', title: 'Silence, snowfields and high-altitude light.', body: 'Monasteries above the clouds, frozen lakes and the crunch of fresh powder. Plan for altitude and season — we show you both.', portals: ['kedarnath', 'leh', 'gangtok', 'darjeeling', 'zermatt'], side: 'right' },
  { eyebrow: 'Chapter 5 · The Maldives', title: 'Turquoise water, long golden evenings.', body: 'Coral islands, Latin-quarter lanes and overwater villas — slow down where the land meets the sea.', portals: ['goa', 'havelock', 'pondicherry', 'male', 'phuket', 'maafushi'] },
  { eyebrow: 'Chapter 6 · Mumbai after dark', title: 'Skylines that come alive after dark.', body: 'Street food at midnight, rooftop views and museums worth crossing oceans for.', portals: ['bengaluru', 'mumbai', 'new-york', 'los-angeles', 'bangkok', 'tokyo', 'dubai', 'singapore', 'paris', 'london'], side: 'right' },
];

/** Five photos per chapter — its scene, two related moments and two of its featured destinations — so the
 *  camera glides continuously through far more imagery while the story beats stay the same. */
const PER_CHAPTER = 6;
/** Famous places from around the world that float past in 3D on the home page. */
const WORLD_FIELD = ['paris', 'tokyo', 'new-york', 'dubai', 'rome', 'interlaken', 'kyoto', 'london', 'singapore', 'zermatt', 'bali', 'u-taj', 'lucerne', 'male', 'bangkok', 'udaipur', 'jaipur', 'varanasi'];
const HOME_BACKDROP = (() => {
  const used = new Set<string>();
  // Spare photos (unused destinations) fill any chapter that has fewer of its own — never a repeat in a row.
  // One Kedarnath photo only (the hero) — no repeats of the same temple further on.
  used.add('kedarnath'); used.add('u-kedarnath');
  const spare = ['paris', 'kyoto', 'rome', 'london', 'new-york', 'dubai', 'tokyo', 'zermatt', 'nainital', 'rishikesh', 'mussoorie', 'darjeeling', 'udaipur', 'jaipur', 'varanasi', 'hampi', 'gangtok', 'shimla', 'ooty'].filter((id) => localImages(id).length);
  const take = (id?: string) => (id && !used.has(id) && localImages(id).length ? (used.add(id), id) : undefined);
  return STAGE.flatMap((s, i) => {
    used.add(s.media);
    if (i === STAGE.length - 1) return [s.media];
    const own = [s.depth[0]?.media, s.depth[1]?.media, ...(STORIES[i]?.portals ?? [])].map(take).filter(Boolean) as string[];
    while (own.length < PER_CHAPTER - 1) { const next = spare.find((id) => !used.has(id)); if (!next) break; own.push(take(next)!); }
    return [s.media, ...Array.from({ length: PER_CHAPTER - 1 }, (_, k) => own[k] ?? s.depth[0]?.media ?? s.media)];
  });
})();
/** Chapter progress (continuous) → position in the backdrop; chapter i's own scene sits at i × 5. */
const homeDolly = { get progress() { return dolly.progress * PER_CHAPTER; } };

const BEST_INDIA = ['agra', 'udaipur', 'jaipur', 'kedarnath', 'munnar', 'goa', 'srinagar', 'leh', 'varanasi', 'havelock', 'nainital', 'rishikesh', 'darjeeling'];
const BEST_WORLD = ['bali', 'male', 'paris', 'singapore', 'bangkok', 'dubai', 'tokyo', 'interlaken', 'new-york', 'phuket', 'london', 'kyoto'];
const MOMENTS = ['m-holi', 'm-aarti', 'm-elephant', 'm-tiger', 'm-tahr', 'm-peafowl', 'm-backwaters', 'm-tea', 'm-shibuya', 'm-timessq', 'n-bom-bandra', 'n-sin-clarke', 'n-dxb-marina', 'n-bkk-khaosan'];

function useQuickPrices(ids: string[]) {
  return useMemo(() => Object.fromEntries(ids.map((id) => {
    const d = getDestination(id)!;
    const c = defaultConfig({ destIds: [id], days: Math.max(2, Math.min(4, d.days[1])) });
    return [id, { days: c.days, pp: estimateTrip(c, generateItinerary(c).days).perPerson }];
  })), [ids]);
}

export default function Home() {
  const { paused, reduced, lightweight } = useMotion();
  const motion = !paused && !reduced && !lightweight;
  const audioOn = useStore((s) => s.prefs.audioEnabled);
  const money = useMoney();
  const portal = usePortal();
  const [active, setActive] = useState(0);
  const sections = useRef<(HTMLElement | null)[]>([]);
  const bar = useRef<HTMLDivElement>(null);
  usePointerDepth(motion);
  const ringIds = useMemo(() => [...BEST_INDIA, ...BEST_WORLD], []);
  const prices = useQuickPrices(ringIds);
  const sub = (d: Destination) => `${prices[d.id]?.days ?? 2} days · from ${money(prices[d.id]?.pp ?? 0)} pp`;

  // Scroll → active chapter + progress bar (finite: clamps at the final chapter).
  useEffect(() => {
    let raf = 0;
    const compute = () => {
      raf = 0;
      const els = sections.current.filter(Boolean) as HTMLElement[];
      if (!els.length) return;
      const y = window.scrollY + window.innerHeight * 0.45;
      let i = 0;
      while (i < els.length - 1 && y >= els[i + 1].offsetTop) i++;
      // Continuous chapter progress (e.g. 2.4 = 40% of the way from scene 3 to scene 4) scrubs the dolly.
      const start = els[i].offsetTop;
      const next = i < els.length - 1 ? els[i + 1].offsetTop : start;
      // Hold the camera on each photo for the first part of its section, then dolly to the next.
      const raw = Math.min(1, Math.max(0, (scrollY - start) / Math.max(1, next - start)));
      // Continuous: the camera keeps gliding the whole time the visitor scrolls (no hold, then jump).
      dolly.progress = i < els.length - 1 ? i + raw : i;
      const max = document.documentElement.scrollHeight - innerHeight;
      if (bar.current) bar.current.style.transform = `scaleX(${Math.min(1, scrollY / Math.max(1, max))})`;
      setActive(i);
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(compute); };
    compute();
    addEventListener('scroll', on, { passive: true });
    addEventListener('resize', on);
    return () => { removeEventListener('scroll', on); removeEventListener('resize', on); cancelAnimationFrame(raf); };
  }, []);

  useEffect(() => {
    if (audioOn) audio.play(STAGE[active].ambience, false, STAGE[active].id);
  }, [active, audioOn]);

  const goTo = useCallback((i: number) => {
    const el = sections.current[i];
    if (!el) return;
    el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    el.focus({ preventScroll: true });
  }, [reduced]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'n' || e.key === 'N') goTo(Math.min(CHAPTERS.length - 1, active + 1));
      if (e.key === 'p' || e.key === 'P') goTo(Math.max(0, active - 1));
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [active, goTo]);

  const open = (d: Destination, e?: { clientX: number; clientY: number }) => portal.open(d, e);
  const ref = (i: number) => (el: HTMLElement | null) => { sections.current[i] = el; };

  return (
    <>
      <div className="chapter-progress no-print" ref={bar} style={{ transform: 'scaleX(0)', width: '100%' }} aria-hidden />
      {/* Scroll-controlled camera dolly through the chapter photos (sharp, GPU-only, reverses on scroll up). */}
      {/* Five photos per chapter, gliding continuously with the scroll. */}
      <PageDolly ids={HOME_BACKDROP} source={homeDolly} field={WORLD_FIELD} hero heroBackdrop="golden-temple" />
      <FxLayer fx={STAGE[active].fx} enabled={motion} />


      <main id="main" tabIndex={-1} style={{ outline: 'none', position: 'relative', zIndex: 4 }}>
        {STORIES.map((s, i) => (
          <div key={s.title}>
            <section id={`chapter-${CHAPTERS[i].id}`} className="chapter" ref={ref(i)} tabIndex={-1} aria-labelledby={`ch-${i}`}>
              <div className="chapter-inner">
                {i === 0 ? (
                  <div className="fade-in hero-3d">
                    <span className="eyebrow">{COMPANY.name} · {COMPANY.tagline}</span>
                    <h1 id="ch-0" className="hero-title cine" aria-label={s.title}>
                      {s.title.split(' ').map((w, k) => <span key={k} className="w" aria-hidden style={{ animationDelay: `${0.35 + k * 0.12}s` }}>{w} </span>)}
                    </h1>
                    <p className="lead">{s.body}</p>
                    <div className="hero-actions">
                      <a className="btn btn-primary" href={href('/india')} data-magnetic>Explore India</a>
                      <a className="btn" href={href('/world')} data-magnetic>Explore the World</a>
                      <a className="btn btn-accent" href={href('/plan')} data-magnetic>Build My Trip</a>
                    </div>
                    <div className="row" style={{ marginTop: '1.4rem' }}>
                      <a className="btn btn-sm btn-ghost" href={href('/plan')}>Skip to trip planner →</a>
                      <button className="btn btn-sm btn-ghost" onClick={() => goTo(CHAPTERS.length - 1)}>Jump to destinations ↓</button>
                    </div>
                    <p className="sr-only">Keyboard: press N or P for the next or previous chapter.</p>
                  </div>
                ) : (
                  <div className={`story glass pad reveal ${s.side === 'right' ? 'right' : ''}`}>
                    <span className="eyebrow">{s.eyebrow}</span>
                    <h2 id={`ch-${i}`}>{s.title}</h2>
                    <p className="muted">{s.body}</p>
                    <div className="portals">
                      {s.portals.map((id) => getDestination(id)).filter(Boolean).map((d) => <Portal key={d!.id} d={d!} onOpen={open} />)}
                    </div>
                  </div>
                )}
              </div>
            </section>

            {i === 0 && (
              <section className="section" aria-labelledby="best-india">
                <div className="wrap reveal">
                  <span className="eyebrow">Curated selection</span>
                  <h2 id="best-india">The best of India</h2>
                  <p className="muted" style={{ maxWidth: '60ch' }}>Palaces, tea hills, islands and the high Himalaya — tap any place for a quick look and a ready-made plan.</p>
                  <PhotoRing items={BEST_INDIA.map((id) => getDestination(id)!)} onOpen={open} motion={motion} label="Best places in India" subtitle={sub} />
                </div>
              </section>
            )}
            {i === 4 && (
              <section className="section" aria-labelledby="best-world">
                <div className="wrap reveal">
                  <span className="eyebrow">Curated selection</span>
                  <h2 id="best-world">The best of the world</h2>
                  <p className="muted" style={{ maxWidth: '60ch' }}>Island resorts, Alpine villages and the great cities — with estimates from India.</p>
                  <PhotoRing items={BEST_WORLD.map((id) => getDestination(id)!)} onOpen={open} motion={motion} label="Best places abroad" subtitle={sub} />
                </div>
              </section>
            )}
            {i === 5 && (
              <section className="section" aria-labelledby="moments">
                <div className="wrap reveal">
                  <span className="eyebrow">Real moments</span>
                  <h2 id="moments">Festivals, wildlife and city lights</h2>
                  <p className="muted">Photographs by Wikimedia Commons contributors — no generated imagery.</p>
                </div>
                <MomentsMarquee ids={MOMENTS} />
              </section>
            )}
          </div>
        ))}

        <section id="chapter-discover" className="chapter" ref={ref(STORIES.length)} tabIndex={-1} aria-labelledby="ch-discover" style={{ display: 'block' }}>
          <div className="chapter-inner stack" style={{ gap: '2rem' }}>
            <div className="glass panel pad reveal">
              <span className="eyebrow">Chapter 7 · Discover & plan</span>
              <h2 id="ch-discover">Choose a destination. We’ll handle the rest.</h2>
              <p className="muted" style={{ maxWidth: '62ch' }}>Spin the globe, search the curated catalog, or let the compass choose. Every destination opens with a short portal transition and a one-click “Plan this trip”.</p>
              <div className="row">
                <a className="btn btn-primary" href={href('/plan')} data-magnetic>Build My Trip</a>
                <a className="btn" href={href('/honeymoon')}>Honeymoon Escapes</a>
                <a className="btn" href={href('/weekend')}>Weekend Getaways</a>
                <a className="btn" href={href('/nightlife')}>Nightlife & Cocktails</a>
              </div>
            </div>
            <div className="reveal"><DestinationFinder scope="all" title="Interactive globe" onOpen={open} /></div>
            <div className="glass panel pad reveal">
              <span className="eyebrow">Travel Mood Compass</span>
              <h3>Where does your mood point?</h3>
              <MoodCompass onOpen={open} />
            </div>
            <div className="reveal">
              <span className="eyebrow">Surprise Me</span>
              <h3>Not sure yet? Let us suggest.</h3>
              <SurpriseMe onOpen={open} />
            </div>
            <div className="glass panel pad row between reveal">
              <div>
                <h3 style={{ margin: 0 }}>That’s the end of the journey.</h3>
                <p className="muted small" style={{ margin: 0 }}>Ready to turn inspiration into a day-by-day plan with a transparent estimate?</p>
              </div>
              <div className="row">
                <button className="btn" onClick={() => goTo(0)}>↑ Back to start</button>
                <button className="btn btn-primary" onClick={() => navigate('/plan')}>Start planning</button>
              </div>
            </div>
          </div>
        </section>
      </main>
      {portal.node}
    </>
  );
}
