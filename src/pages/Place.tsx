import { useEffect, useMemo, useState } from 'react';
import { DestinationCard } from '../components/discovery';
import { LiveWeather } from '../components/LiveWidgets';
import { MapFlyIn } from '../components/MapFlyIn';
import { setBackdrop } from '../components/PageDolly';
import { HeroImage } from '../components/HeroImage';
import type { Destination } from '../data/types';
import { weatherLabel, useWeather } from '../lib/live';
import { connectedPlaces, kmBetween, nearbySpots, nearestCity, nearestCurated, placeHref, placeSummary, type NearbySpot, type PlaceHit, type WikiSummary } from '../lib/places';
import { href, navigate, useRoute } from '../lib/router';
import { useMoney } from '../lib/store';
import { quickEstimate } from '../lib/tiers';

/**
 * Live guide for any place or person found by search: Wikipedia overview and lead photo,
 * why it is worth the trip, satellite map journey, live weather, notable places nearby (or,
 * for a person, the places connected with them), and the nearest curated planners.
 * The page background is a scroll-controlled 3D dolly through photos of this place only.
 * Facts come from the linked sources, not from us.
 */
const firstSentences = (t: string, n: number) => (t.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [t]).slice(0, n).join('').trim();

function SpotCard({ p, note }: { p: NearbySpot; note: string }) {
  const to = placeHref({ kind: 'place', name: p.title, title: p.title, lat: p.lat, lon: p.lon });
  return (
    <a className="spot-card glass" href={href(to)} onClick={(e) => { e.preventDefault(); navigate(to); }}>
      {p.image ? <img src={p.image} alt={p.title} loading="lazy" referrerPolicy="no-referrer" /> : <span className="spot-ph" aria-hidden>📍</span>}
      <span className="spot-body"><b>{p.title}</b><span className="tiny muted">{p.description ? `${p.description} · ` : ''}{note}</span></span>
    </a>
  );
}

export default function Place() {
  const { query } = useRoute();
  const qs = query.toString();
  const hit: PlaceHit = useMemo(() => {
    const lat = query.get('lat'), lon = query.get('lon');
    return {
      kind: query.get('title') ? 'topic' : 'place',
      name: query.get('name') ?? query.get('title') ?? '',
      title: query.get('title') ?? undefined,
      region: query.get('region') ?? undefined,
      country: query.get('country') ?? undefined,
      lat: lat ? +lat : undefined, lon: lon ? +lon : undefined,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qs]);
  const [sum, setSum] = useState<WikiSummary | null | 'loading'>('loading');
  const [spots, setSpots] = useState<NearbySpot[]>([]);
  const [linked, setLinked] = useState<NearbySpot[]>([]);
  const money = useMoney();

  useEffect(() => {
    const ctl = new AbortController();
    setSum('loading'); setSpots([]); setLinked([]);
    placeSummary(hit, ctl.signal).then((s) => !ctl.signal.aborted && setSum(s));
    return () => ctl.abort();
  }, [hit]);

  const s = sum === 'loading' ? null : sum;
  const ownLat = hit.lat ?? s?.lat;
  const ownLon = hit.lon ?? s?.lon;
  const isPlace = ownLat != null && ownLon != null;

  // A person or topic without a location: find the places connected with them (ashrams, temples, birthplaces…).
  useEffect(() => {
    if (isPlace || !s) return;
    const ctl = new AbortController();
    connectedPlaces(s.title, ctl.signal).then((x) => !ctl.signal.aborted && setLinked(x));
    return () => ctl.abort();
  }, [isPlace, s]);

  // Where the map and nearby search point: the place itself, or the main place connected with the person.
  const target = isPlace ? { lat: ownLat!, lon: ownLon!, name: hit.name } : linked[0] ? { lat: linked[0].lat, lon: linked[0].lon, name: linked[0].title } : null;
  useEffect(() => {
    if (!target) return;
    const ctl = new AbortController();
    nearbySpots(target.lat, target.lon, ctl.signal).then((x) => !ctl.signal.aborted && setSpots(x.filter((p) => p.title !== s?.title && p.title !== target.name)));
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.lat, target?.lon, s?.title]);

  // 3D background: photos of this place only.
  useEffect(() => {
    // Landscape photos only: portraits or tiny images would be blown up and cropped full-screen.
    const wide = (src?: string, w?: number, h?: number) => (src && (!w || !h || (w > h * 1.15 && w >= 900)) ? src : undefined);
    const urls = [wide(s?.image, s?.imageW, s?.imageH), ...linked.map((p) => wide(p.image, p.imageW, p.imageH)), ...spots.map((p) => wide(p.image, p.imageW, p.imageH))]
      .filter((u, i, a): u is string => !!u && a.indexOf(u) === i).slice(0, 5);
    setBackdrop(urls.map((src) => ({ src })));
  }, [s?.image, spots, linked]);
  useEffect(() => () => setBackdrop([]), []);

  const w = useWeather(target?.lat ?? 0, target?.lon ?? 0);
  useEffect(() => { document.title = `${hit.name} — Travel Guide`; }, [hit.name]);

  if (!hit.name) {
    return <main className="page wrap-narrow" id="main"><div className="glass panel pad"><h1 style={{ fontSize: '2rem' }}>Search for a place</h1><p>Use the search box at the top to find any town, state, country, landmark or person.</p></div></main>;
  }

  const curated = target ? nearestCurated(target.lat, target.lon, 3) : [];
  const same = curated.find((c) => c.km < 12);
  const sub = [hit.region, hit.country].filter(Boolean).join(', ');
  const alt = linked.find((p) => p.image) ?? spots.find((p) => p.image);
  const hero = s?.image ? { src: s.image, w: s.imageW, h: s.imageH } : alt ? { src: alt.image!, w: alt.imageW, h: alt.imageH } : null;
  const q = encodeURIComponent([target?.name ?? hit.name, hit.region, hit.country].filter(Boolean).join(', '));
  const pseudo = target ? ({ name: target.name, lat: target.lat, lon: target.lon } as unknown as Destination) : null;
  const city = target ? nearestCity(target.lat, target.lon, hit.country) : undefined;

  // Why go — every line is drawn from the live sources on this page.
  const why: { icon: string; text: string }[] = [];
  if (s?.description) why.push({ icon: '✦', text: `${s.description.charAt(0).toUpperCase()}${s.description.slice(1)}.` });
  if (s?.extract) {
    const more = firstSentences(s.extract, 3).replace(firstSentences(s.extract, 1), '').trim();
    if (more) why.push({ icon: '📖', text: more });
  }
  if (!isPlace && linked.length) why.push({ icon: '🛕', text: `Visit the places connected with ${hit.name}: ${linked.slice(0, 4).map((p) => p.title).join(', ')}.` });
  if (spots.length) why.push({ icon: '📍', text: `Within 10 km: ${spots.slice(0, 4).map((p) => p.title).join(', ')}.` });
  if (w.status === 'ready' && w.current && target) { const [ic, lb] = weatherLabel(w.current.code); why.push({ icon: ic, text: `Right now in ${target.name}: ${Math.round(w.current.temp)}°C, ${lb.toLowerCase()}.` }); }
  if (city && target) why.push({ icon: '🧭', text: `About ${Math.round(kmBetween(city, target))} km from ${city.name} as the crow flies — see the route on the map below.` });

  return (
    <main id="main" tabIndex={-1}>
      <section className="dhero">
        <div className="bg">
          {hero ? <HeroImage src={hero.src} w={hero.w} h={hero.h} alt={`${hit.name} — photograph from Wikipedia`} /> : sum === 'loading' ? <div className="skeleton" style={{ position: 'absolute', inset: 0 }} /> : <div className="place-bg-fallback" />}
        </div>
        <div className="wrap">
          <ol className="crumbs" aria-label="Breadcrumb">
            <li><a href={href('/')}>Search</a></li>
            {sub && <li>{sub}</li>}
            <li aria-current="page">{hit.name}</li>
          </ol>
          <span className="eyebrow">{s?.description ?? (isPlace ? 'Place' : 'From Wikipedia')}</span>
          <h1>{hit.name}</h1>
          {sub && <p className="lead">{sub}</p>}
          <div className="row" style={{ marginTop: '1.2rem' }}>
            {same && <a className="btn btn-primary" href={href(`/destination/${same.d.id}`)}>Open full {same.d.name} guide & planner</a>}
            {target && <a className="btn" href="#map-section" onClick={(e) => { e.preventDefault(); document.getElementById('map-section')?.scrollIntoView({ behavior: 'smooth' }); }}>Fly to the map ↓</a>}
            {s && <a className="btn" href={s.page} target="_blank" rel="noreferrer">Wikipedia ↗</a>}
          </div>
        </div>
      </section>

      <div className="wrap stack" style={{ gap: '2.4rem', paddingBottom: 80 }}>
        <section className="grid grid-2 place-intro">
          <div className="glass panel pad stack">
            <h2 style={{ fontSize: '1.6rem', margin: 0 }}>About {hit.name}</h2>
            {sum === 'loading' && <p className="muted">Loading live information…</p>}
            {s && <p style={{ fontSize: '1.05rem', lineHeight: 1.7, margin: 0 }}>{s.extract}</p>}
            {sum === null && <p className="muted">No encyclopedia summary was found for this exact name. The map, weather and nearby places below are still live.</p>}
            {s && <p className="tiny muted" style={{ margin: 0 }}>Text: Wikipedia, CC BY-SA 4.0 — <a href={s.page} target="_blank" rel="noreferrer">read the full article</a>. Facts can change; confirm locally before you travel.</p>}
          </div>
          <div className="glass panel pad stack">
            <h2 style={{ fontSize: '1.6rem', margin: 0 }}>{isPlace ? `Why travel to ${hit.name}` : `Why travellers seek out ${hit.name}`}</h2>
            {why.length ? (
              <ul className="why-list">{why.map((x, i) => <li key={i}><span aria-hidden>{x.icon}</span><span>{x.text}</span></li>)}</ul>
            ) : <p className="muted">Gathering details…</p>}
          </div>
        </section>

        {linked.length > 0 && (
          <section aria-labelledby="linked">
            <h2 id="linked" style={{ fontSize: '1.8rem' }}>Places connected with {hit.name}</h2>
            <p className="muted small">Ashrams, temples and places linked from the Wikipedia article. Tap one to open its guide and map.</p>
            <div className="grid grid-3 spot-grid">{linked.map((p) => <SpotCard key={p.title} p={p} note="Open guide →" />)}</div>
          </section>
        )}

        {pseudo && <LiveWeather d={pseudo} />}

        {target && (
          <div id="map-section">
            <h2 style={{ fontSize: '1.8rem' }}>{target.name} from above</h2>
            <MapFlyIn lat={target.lat} lon={target.lon} name={target.name} spots={spots.map((p) => ({ name: p.title, lat: p.lat, lon: p.lon, href: p.page }))} from={city} />
          </div>
        )}

        {spots.length > 0 && (
          <section aria-labelledby="spots">
            <h2 id="spots" style={{ fontSize: '1.8rem' }}>Places to see in and around {target?.name ?? hit.name}</h2>
            <p className="muted small">Notable places within 10 km, from Wikipedia’s map data. Tap a card to open its guide.</p>
            <div className="grid grid-3 spot-grid">{spots.map((p) => <SpotCard key={p.title} p={p} note={`${p.dist.toFixed(1)} km away`} />)}</div>
          </section>
        )}

        {target && (
          <section className="glass panel pad stack">
            <h2 style={{ fontSize: '1.6rem', margin: 0 }}>Plan a trip to {target.name}</h2>
            <p className="small muted">Compare live prices on the provider sites (opens in a new tab):</p>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <a className="btn" href={`https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights to ${target.name}`)}`} target="_blank" rel="noreferrer">Flights ↗</a>
              <a className="btn" href={`https://www.booking.com/searchresults.html?ss=${q}`} target="_blank" rel="noreferrer">Hotels on Booking.com ↗</a>
              <a className="btn" href={`https://www.google.com/travel/hotels/${q}`} target="_blank" rel="noreferrer">Google Hotels ↗</a>
              <a className="btn" href={`https://www.google.com/maps/search/restaurants+near+${q}`} target="_blank" rel="noreferrer">Places to eat ↗</a>
              <a className="btn" href={`https://www.youtube.com/results?search_query=${q}+travel+4k`} target="_blank" rel="noreferrer">Watch in 4K ↗</a>
            </div>
            {curated.length > 0 && (
              <>
                <h3 style={{ margin: '1rem 0 0' }}>Nearest destinations with full Travel Guide planners</h3>
                <p className="small muted">Estimates for 2 adults, 3-star stay, from the nearest major city. Open one to build a day-by-day plan and add {target.name} as a day trip.</p>
                <div className="grid grid-3">
                  {curated.map(({ d, km }) => (
                    <div key={d.id} className="stack" style={{ gap: '.4rem' }}>
                      <DestinationCard d={d} onOpen={() => navigate(`/destination/${d.id}`)} />
                      <p className="tiny muted" style={{ margin: 0 }}>{Math.round(km)} km from {target.name} · 2 days ≈ {money(quickEstimate(d.id, 2).total)}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
