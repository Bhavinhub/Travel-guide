import { useEffect, useMemo, useState } from 'react';
import { DestinationCard } from '../components/discovery';
import { LiveWeather } from '../components/LiveWidgets';
import { MapFlyIn } from '../components/MapFlyIn';
import type { Destination } from '../data/types';
import { nearbySpots, nearestCity, nearestCurated, placeSummary, type NearbySpot, type PlaceHit, type WikiSummary } from '../lib/places';
import { href, navigate, useRoute } from '../lib/router';
import { useMoney } from '../lib/store';
import { quickEstimate } from '../lib/tiers';

/**
 * Live guide for any place or person found by search: Wikipedia overview and lead photo,
 * satellite map fly-in, live weather, notable spots nearby with photos, and the nearest
 * curated destinations with estimates. Facts come from the linked sources, not from us.
 */
export default function Place() {
  const { query } = useRoute();
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
  }, [query]);
  const [sum, setSum] = useState<WikiSummary | null | 'loading'>('loading');
  const [spots, setSpots] = useState<NearbySpot[]>([]);
  const money = useMoney();

  useEffect(() => {
    const ctl = new AbortController();
    setSum('loading'); setSpots([]);
    placeSummary(hit, ctl.signal).then((s) => !ctl.signal.aborted && setSum(s));
    return () => ctl.abort();
  }, [hit]);

  const s = sum === 'loading' ? null : sum;
  const lat = hit.lat ?? s?.lat;
  const lon = hit.lon ?? s?.lon;
  useEffect(() => {
    if (lat == null || lon == null) return;
    const ctl = new AbortController();
    nearbySpots(lat, lon, ctl.signal).then((x) => !ctl.signal.aborted && setSpots(x.filter((p) => p.title !== s?.title)));
    return () => ctl.abort();
  }, [lat, lon, s?.title]);

  useEffect(() => { document.title = `${hit.name} — Travel Guide`; }, [hit.name]);

  if (!hit.name) {
    return <main className="page wrap-narrow" id="main"><div className="page-bg" /><div className="glass panel pad"><h1 style={{ fontSize: '2rem' }}>Search for a place</h1><p>Use the search box at the top to find any town, state, country, landmark or person.</p></div></main>;
  }

  const curated = lat != null && lon != null ? nearestCurated(lat, lon, 3) : [];
  const same = curated.find((c) => c.km < 12);
  const sub = [hit.region, hit.country].filter(Boolean).join(', ');
  const heroImg = s?.image ?? spots.find((p) => p.image)?.image;
  const isPlace = lat != null && lon != null;
  const q = encodeURIComponent([hit.name, hit.region, hit.country].filter(Boolean).join(', '));
  const pseudo = isPlace ? ({ name: hit.name, lat, lon } as unknown as Destination) : null;

  return (
    <main id="main" tabIndex={-1}>
      <div className="page-bg" />
      <section className="dhero">
        <div className="bg">
          {heroImg ? <img src={heroImg} alt={`${hit.name} — photograph from Wikipedia`} /> : sum === 'loading' ? <div className="skeleton" style={{ position: 'absolute', inset: 0 }} /> : <div className="place-bg-fallback" />}
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
            {isPlace && <a className="btn" href="#map-section" onClick={(e) => { e.preventDefault(); document.getElementById('map-section')?.scrollIntoView({ behavior: 'smooth' }); }}>Fly to the map ↓</a>}
            {s && <a className="btn" href={s.page} target="_blank" rel="noreferrer">Wikipedia ↗</a>}
          </div>
        </div>
      </section>

      <div className="wrap stack" style={{ gap: '2.4rem', paddingBottom: 80 }}>
        <section className="editorial">
          <div className="glass panel pad stack">
            <h2 style={{ fontSize: '1.6rem', margin: 0 }}>About {hit.name}</h2>
            {sum === 'loading' && <p className="muted">Loading live information…</p>}
            {s && <p style={{ fontSize: '1.05rem', lineHeight: 1.7 }}>{s.extract}</p>}
            {sum === null && <p className="muted">No encyclopedia summary was found for this exact name. The map, weather and nearby places below are still live.</p>}
            {s && <p className="tiny muted">Text: Wikipedia, CC BY-SA 4.0 — <a href={s.page} target="_blank" rel="noreferrer">read the full article</a>. Facts can change; confirm locally before you travel.</p>}
          </div>
        </section>

        {pseudo && <LiveWeather d={pseudo} />}

        {isPlace && (
          <div id="map-section">
            <h2 style={{ fontSize: '1.8rem' }}>{hit.name} from above</h2>
            <MapFlyIn lat={lat!} lon={lon!} name={hit.name} spots={spots.map((p) => ({ name: p.title, lat: p.lat, lon: p.lon, href: p.page }))} from={nearestCity(lat!, lon!, hit.country)} />
          </div>
        )}

        {spots.length > 0 && (
          <section aria-labelledby="spots">
            <h2 id="spots" style={{ fontSize: '1.8rem' }}>Places to see in and around {hit.name}</h2>
            <p className="muted small">Notable places within 10 km, from Wikipedia’s map data. Tap a card to read more.</p>
            <div className="grid grid-3 spot-grid">
              {spots.map((p) => (
                <a key={p.title} className="spot-card glass" href={p.page} target="_blank" rel="noreferrer">
                  {p.image ? <img src={p.image} alt={p.title} loading="lazy" /> : <span className="spot-ph" aria-hidden>📍</span>}
                  <span className="spot-body"><b>{p.title}</b><span className="tiny muted">{p.description ? `${p.description} · ` : ''}{p.dist.toFixed(1)} km away</span></span>
                </a>
              ))}
            </div>
          </section>
        )}

        {isPlace && (
          <section className="glass panel pad stack">
            <h2 style={{ fontSize: '1.6rem', margin: 0 }}>Plan a trip to {hit.name}</h2>
            <p className="small muted">Compare live prices on the provider sites (opens in a new tab):</p>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <a className="btn" href={`https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights to ${hit.name}`)}`} target="_blank" rel="noreferrer">Flights ↗</a>
              <a className="btn" href={`https://www.booking.com/searchresults.html?ss=${q}`} target="_blank" rel="noreferrer">Hotels on Booking.com ↗</a>
              <a className="btn" href={`https://www.google.com/travel/hotels/${q}`} target="_blank" rel="noreferrer">Google Hotels ↗</a>
              <a className="btn" href={`https://www.google.com/maps/search/restaurants+near+${q}`} target="_blank" rel="noreferrer">Places to eat ↗</a>
              <a className="btn" href={`https://www.youtube.com/results?search_query=${q}+travel+4k`} target="_blank" rel="noreferrer">Watch in 4K ↗</a>
            </div>
            {curated.length > 0 && (
              <>
                <h3 style={{ margin: '1rem 0 0' }}>Nearest destinations with full Travel Guide planners</h3>
                <p className="small muted">Estimates for 2 adults, 3-star stay, from the nearest major city. Open one to build a day-by-day plan and add {hit.name} as a day trip.</p>
                <div className="grid grid-3">
                  {curated.map(({ d, km }) => (
                    <div key={d.id} className="stack" style={{ gap: '.4rem' }}>
                      <DestinationCard d={d} onOpen={() => navigate(`/destination/${d.id}`)} />
                      <p className="tiny muted" style={{ margin: 0 }}>{Math.round(km)} km from {hit.name} · 2 days ≈ {money(quickEstimate(d.id, 2).total)}</p>
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
