import { COMPANY, PRICING_BASIS } from '../config/company';
import { DESTINATIONS } from '../data/catalog';
import { LogoMark } from '../components/Logo';
import { href } from '../lib/router';
import media from '../data/media.json';
import { soundCredits } from '../lib/audio';

function CreditList() {
  const photos = Object.entries(media as Record<string, { images: { file: string; author: string; license?: string; source: string }[] }>)
    .flatMap(([id, e]) => e.images.map((im) => ({ id, ...im })));
  const sounds = [...Object.entries(soundCredits.ambience), ...Object.entries(soundCredits.music)];
  const seen = new Set<string>();
  return (
    <details className="small">
      <summary style={{ cursor: 'pointer' }}>Full list: {photos.length} photographs and {new Set(sounds.map(([, s]) => s.file)).size} recordings</summary>
      <ul style={{ maxHeight: 360, overflow: 'auto' }}>
        {sounds.filter(([, s]) => !seen.has(s.file) && seen.add(s.file)).map(([k, s], i) => <li key={`${i}-${k}`}>🔊 <a href={s.source} target="_blank" rel="noreferrer">{s.file.replace('File:', '')}</a> — {s.author}, {s.license}</li>)}
        {photos.map((p) => <li key={p.id + p.file}>📷 <a href={p.source} target="_blank" rel="noreferrer">{p.file.replace('File:', '')}</a> — {p.author.slice(0, 80)}, {p.license}</li>)}
      </ul>
    </details>
  );
}

export default function About() {
  const india = DESTINATIONS.filter((d) => d.scope === 'india').length;
  return (
    <main className="page" id="main" tabIndex={-1}>
      <div className="page-bg" />
      <div className="wrap-narrow stack" style={{ gap: '1.6rem' }}>
        <header className="row" style={{ gap: '1rem' }}>
          <LogoMark size={64} title={`${COMPANY.name} logo`} />
          <div>
            <span className="eyebrow">About {COMPANY.name}</span>
            <h1 style={{ fontSize: 'clamp(2.2rem, 5vw, 3.6rem)', margin: 0 }}>{COMPANY.tagline}</h1>
          </div>
        </header>
        <p className="lead">{COMPANY.name} helps travellers discover places in India and around the world, understand what a trip is likely to cost, and turn inspiration into a practical day-by-day and hourly plan.</p>

        <section className="glass panel pad">
          <h2 style={{ fontSize: '1.5rem' }}>What’s here</h2>
          <ul>
            <li>A curated catalog of {DESTINATIONS.length} destinations ({india} in India, {DESTINATIONS.length - india} international) — a selection, not a complete directory.</li>
            <li>A trip builder with transport, stay, meals, activities, guides and extras, and a transparent, inspectable estimate.</li>
            <li>Itineraries that account for journey times, time zones, meal breaks, rest periods, sunset timing and pacing.</li>
            <li>Honeymoon, weekend and nightlife sections, plus a Mood Compass, Surprise Me, Destination Passport and trip comparison.</li>
          </ul>
        </section>

        <section className="glass panel pad">
          <h2 style={{ fontSize: '1.5rem' }}>Honesty about data</h2>
          <ul>
            <li><b>Prices</b> are illustrative planning figures ({PRICING_BASIS.label}, compiled {PRICING_BASIS.compiledOn}). They are not live fares, quotes or availability, and exclude taxes.</li>
            <li><b>Exchange rates</b> for display currencies are editable reference values, not live rates.</li>
            <li><b>Opening hours, venue policies, permits and age rules</b> are not published unless verified; where we know something changes often, we say so.</li>
            <li><b>No reviews or ratings</b> are shown. Suitability and privacy indicators are editorial judgements.</li>
            <li><b>No bookings or payments</b> happen on this site. You can save, export, or send a quote request.</li>
          </ul>
        </section>

        <section className="glass panel pad">
          <h2 style={{ fontSize: '1.5rem' }}>Media & sound credits</h2>
          <ul>
            <li>All photographs on the site are real, freely licensed photos from Wikimedia Commons, stored locally in up to 4K with their author and licence. Background music and ambience are real recordings from Wikimedia Commons (CC0 / CC BY / CC BY-SA). The globe uses NASA Blue Marble and NASA/NOAA city-lights imagery (public domain). The glossy abstract 3D shapes are rendered live in your browser (WebGL), not generated images.</li>
            <li>Additional destination photographs are loaded live from <a href="https://commons.wikimedia.org" target="_blank" rel="noreferrer">Wikimedia Commons</a> via the matching Wikipedia article. Each photo shows its author and licence (or links to its file page). Wikipedia’s page-image service only returns freely licensed images.</li>
            <li>When a photo isn’t available, a clearly labelled illustration is shown instead.</li>
            <li><CreditList /></li>
            <li>Map outlines: Natural Earth data via the <code>world-atlas</code> package (public domain).</li>
            <li>Live data: exchange rates from the European Central Bank (via Frankfurter) and weather forecasts from Open-Meteo. Live flight offers appear when a flight API is configured.</li>
            <li>Typefaces: Fraunces and Inter (SIL Open Font License) via Google Fonts.</li>
          </ul>
        </section>

        <section className="glass panel pad">
          <h2 style={{ fontSize: '1.5rem' }}>Design notes</h2>
          <p className="muted">The visual direction — a single persistent 3D scene driven by ordinary page scrolling, restrained lighting and short, finite transitions — draws on general practice in immersive web design. It is an original design; no layouts, code or assets from other studios were used.</p>
          <p className="muted" style={{ margin: 0 }}>Accessibility: everything in the 3D scene is also available as regular page content. Use the controls dock to pause motion, switch to lightweight mode or change the atmosphere.</p>
        </section>

        <div className="row">
          <a className="btn btn-primary" href={href('/plan')}>Build My Trip</a>
          <a className="btn" href={href('/contact')}>Contact {COMPANY.name}</a>
        </div>
      </div>
    </main>
  );
}
