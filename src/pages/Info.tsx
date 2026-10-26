import { useEffect, useState } from 'react';
import { COMPANY, PRICING_BASIS } from '../config/company';
import { DESTINATIONS } from '../data/catalog';
import { href } from '../lib/router';

/**
 * Terms, Privacy, Security, Status, Community and Docs pages.
 * The legal texts are plain-language starting points and should be reviewed by a lawyer before launch.
 */
type Kind = 'terms' | 'privacy' | 'security' | 'status' | 'community' | 'docs';

const TITLES: Record<Kind, string> = { terms: 'Terms of use', privacy: 'Privacy', security: 'Security', status: 'Service status', community: 'Community', docs: 'Docs' };

interface Check { name: string; url: string; state: 'checking' | 'up' | 'down' | 'off'; ms?: number; note?: string }
const CHECKS: Omit<Check, 'state'>[] = [
  { name: 'Destination photos (Wikimedia Commons)', url: 'https://commons.wikimedia.org/w/api.php?action=query&meta=siteinfo&format=json&origin=*' },
  { name: 'Place information (Wikipedia)', url: 'https://en.wikipedia.org/w/api.php?action=query&meta=siteinfo&format=json&origin=*' },
  { name: 'Exchange rates (European Central Bank via Frankfurter)', url: 'https://api.frankfurter.dev/v1/latest?base=INR&symbols=USD' },
  { name: 'Weather & place search (Open-Meteo)', url: 'https://api.open-meteo.com/v1/forecast?latitude=28.6&longitude=77.2&current=temperature_2m' },
  { name: 'Live flight offers (/api/flights)', url: `${import.meta.env.BASE_URL}api/flights?from=DEL&to=BOM&date=2099-01-01` },
];

function Status() {
  const [checks, setChecks] = useState<Check[]>(CHECKS.map((c) => ({ ...c, state: 'checking' })));
  const run = () => {
    setChecks(CHECKS.map((c) => ({ ...c, state: 'checking' })));
    CHECKS.forEach((c, i) => {
      const t0 = performance.now();
      fetch(c.url, { cache: 'no-store' })
        .then(async (r) => {
          const ms = Math.round(performance.now() - t0);
          const json = (r.headers.get('content-type') ?? '').includes('json');
          let state: Check['state'] = r.ok ? 'up' : 'down';
          let note: string | undefined;
          if (c.url.includes('/api/flights')) {
            if (!json || r.status === 501) { state = 'off'; note = 'Not configured on this deployment (no API keys).'; }
            else if (r.status === 400) { state = 'up'; note = 'Endpoint reachable.'; }
          }
          setChecks((x) => x.map((y, j) => (j === i ? { ...y, state, ms, note } : y)));
        })
        .catch(() => setChecks((x) => x.map((y, j) => (j === i ? { ...y, state: 'down' } : y))));
    });
  };
  useEffect(run, []);
  return (
    <div className="stack">
      <p className="muted">Live checks run from your browser right now.</p>
      <div className="glass panel pad">
        <table className="cost-table">
          <tbody>
            <tr><td><strong>Website & trip planner</strong></td><td className="r"><span className="tag tag-ok">● Operational</span></td></tr>
            {checks.map((c) => (
              <tr key={c.name}>
                <td><strong>{c.name}</strong>{c.note && <div className="tiny muted">{c.note}</div>}</td>
                <td className="r">
                  {c.state === 'checking' && <span className="tag">Checking…</span>}
                  {c.state === 'up' && <span className="tag tag-ok">● Operational{c.ms ? ` · ${c.ms} ms` : ''}</span>}
                  {c.state === 'down' && <span className="tag tag-warn">● Unreachable — the site falls back gracefully</span>}
                  {c.state === 'off' && <span className="tag">○ Not connected</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="btn" onClick={run}>Re-run checks</button>
    </div>
  );
}

export default function Info({ kind }: { kind: Kind }) {
  const contactNote = COMPANY.contact.email ? <>Email <a href={`mailto:${COMPANY.contact.email}`}>{COMPANY.contact.email}</a>.</> : <>Use the <a href={href('/contact')}>contact page</a>.</>;
  return (
    <main className="page" id="main" tabIndex={-1}>
      <div className="page-bg" />
      <div className="wrap-narrow stack" style={{ gap: '1.2rem' }}>
        <span className="eyebrow">{COMPANY.name}</span>
        <h1 style={{ fontSize: 'clamp(2.2rem, 5vw, 3.4rem)' }}>{TITLES[kind]}</h1>

        {kind === 'terms' && (
          <div className="glass panel pad stack small">
            <p><strong>Draft — have these terms reviewed by a lawyer before launch.</strong></p>
            <p>{COMPANY.name} is a trip-planning and inspiration service. Itineraries, journey times and prices are <b>estimates</b> ({PRICING_BASIS.label}) and are not offers, quotes or bookings.</p>
            <p>No booking or payment is made on this website. When you follow a link to an airline, hotel, transport or booking site, that provider’s own terms and prices apply.</p>
            <p>Opening hours, permits, visa rules, health and safety advice and venue policies change. Always confirm with official sources before you travel.</p>
            <p>Photos are credited to their creators and used under their licences (Wikimedia Commons licences and the Unsplash License). Site code and text © {new Date().getFullYear()} {COMPANY.name}.</p>
            <p>Questions? {contactNote}</p>
          </div>
        )}

        {kind === 'privacy' && (
          <div className="glass panel pad stack small">
            <p><strong>Draft — review with a privacy professional before launch.</strong></p>
            <p><b>No accounts, no tracking cookies, no advertising trackers.</b> {COMPANY.name} does not run analytics on this demo.</p>
            <p><b>Stored on your device only</b> (browser local storage): your preferences (theme, currency), saved trips, passport stamps, recent searches and the plan you are editing. Clear them any time from <b>Manage cookies</b> in the footer.</p>
            <p><b>Sent to third parties when you use a feature:</b> place names and coordinates to Wikipedia / Wikimedia (photos and place info), Open-Meteo (weather and place search) and Frankfurter (exchange rates); map tiles from the map providers shown on the map. These services receive your IP address as with any web request.</p>
            <p><b>Quote requests</b> are only sent if the site owner connects an endpoint; when an encryption key is configured they are encrypted in your browser first (see Security).</p>
            <p>Questions or deletion requests: {contactNote}</p>
          </div>
        )}

        {kind === 'security' && (
          <div className="glass panel pad stack small">
            <p>No website is impossible to attack, but {COMPANY.name} is built to close the common routes in:</p>
            <ul>
              <li>Quote requests are encrypted in your browser with RSA-OAEP-256 + AES-256-GCM so only {COMPANY.name}’s offline private key can read them.</li>
              <li>A strict Content-Security-Policy, HSTS, anti-framing and other security headers on every page.</li>
              <li>No secrets in the browser; API keys stay on the server. The server endpoint validates input and is rate-limited.</li>
              <li>All text is escaped (no raw HTML injection); external links open without passing your page to the destination.</li>
              <li>Forms have length limits, a spam honeypot and a resubmission throttle.</li>
            </ul>
            <p>Found a vulnerability? Please report it privately — {contactNote}</p>
          </div>
        )}

        {kind === 'status' && <Status />}

        {kind === 'community' && (
          <div className="glass panel pad stack small">
            <p>{COMPANY.name} stands on the work of thousands of photographers and volunteers.</p>
            <ul>
              <li><b>Photographers</b> on Wikimedia Commons and Unsplash — every photo is credited; see the full list on <a href={href('/about')}>About</a>.</li>
              <li><b>Wikipedia & Wikidata editors</b> who maintain the place information used by search.</li>
              <li><b>OpenStreetMap contributors</b> and open map data used in maps and search.</li>
              <li><b>Open data:</b> Natural Earth, NASA Earth Observatory, the European Central Bank and Open-Meteo.</li>
            </ul>
            <p>Share your trip ideas or corrections through the <a href={href('/contact')}>contact page</a> — corrections to destination facts are especially welcome.</p>
          </div>
        )}

        {kind === 'docs' && (
          <div className="glass panel pad stack small">
            <h3 style={{ margin: 0 }}>Using {COMPANY.name}</h3>
            <ol>
              <li><b>Find a place:</b> use the search box (any city, town, state or country), the globe, or the Explore pages. {DESTINATIONS.length} destinations have full curated guides; any other place gets a live guide built from Wikipedia, maps and weather.</li>
              <li><b>Instant estimate:</b> on a destination page, switch days, stay (budget → 5-star), food and transport — totals update immediately.</li>
              <li><b>Build My Trip:</b> choose public or private transport and the mode (flight, train, bus, cab, self-drive, bike, helicopter), then continue to trip details for fares from lowest to premium, hotels, food and an hour-by-hour plan.</li>
              <li><b>Edit the plan:</b> reorder, swap, lock or remove activities; conflicts are flagged; costs recalculate.</li>
              <li><b>Save, print or export</b> your plan, or request a quote.</li>
              <li><b>Sun / Moon:</b> the toggle at the bottom-left switches light and dark themes.</li>
            </ol>
            <h3 style={{ margin: 0 }}>How estimates work</h3>
            <p>See the “Expense breakdown” tab in the planner for every formula and assumption. Prices are illustrative ({PRICING_BASIS.compiledOn}); live prices are on the linked booking sites.</p>
            <h3 style={{ margin: 0 }}>For developers</h3>
            <p>Source, setup, data structure, media pipeline and security notes are in the project’s README, docs/DATA.md, CREDITS.md and SECURITY.md.</p>
          </div>
        )}
      </div>
    </main>
  );
}
