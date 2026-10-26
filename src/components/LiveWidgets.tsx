import type { Destination } from '../data/types';
import { useLiveFlights, useWeather, weatherLabel } from '../lib/live';
import { useMoney } from '../lib/store';
import { addDaysISO, fmtDate } from '../lib/time';

/** Live forecast from Open-Meteo, aligned to the trip dates when they are within 16 days. */
export function LiveWeather({ d, startDate, days }: { d: Destination; startDate?: string; days?: number }) {
  const w = useWeather(d.lat, d.lon);
  if (w.status === 'loading') return <div className="glass pad-sm small muted">Loading live weather…</div>;
  if (w.status === 'error') return <div className="glass pad-sm small muted">Live weather is unavailable right now.</div>;
  const trip = startDate && days ? Array.from({ length: days }, (_, i) => addDaysISO(startDate, i)) : [];
  const inRange = trip.filter((t) => w.daily.some((x) => x.date === t));
  const show = inRange.length ? w.daily.filter((x) => inRange.includes(x.date)) : w.daily.slice(0, 7);
  const [icon, label] = weatherLabel(w.current!.code);
  return (
    <div className="glass pad stack live-weather">
      <div className="row between">
        <div className="row"><span className="live-dot" aria-hidden /> <strong>Live weather in {d.name}</strong></div>
        <span className="small">{icon} {Math.round(w.current!.temp)}°C · {label} now</span>
      </div>
      <p className="tiny muted" style={{ margin: 0 }}>
        {inRange.length ? 'Forecast for your trip days.' : trip.length ? 'Your dates are beyond the 16-day forecast — showing the next 7 days. Check again nearer departure.' : 'Next 7 days.'} Source: Open-Meteo.
      </p>
      <div className="wx-row">
        {show.map((x) => {
          const [i, l] = weatherLabel(x.code);
          return (
            <div key={x.date} className="wx-day" title={l}>
              <span className="tiny muted">{fmtDate(x.date, { weekday: 'short', day: 'numeric' })}</span>
              <span className="wx-icon" aria-hidden>{i}</span>
              <b className="small num">{Math.round(x.max)}° / {Math.round(x.min)}°</b>
              <span className="tiny muted">☔ {x.rain}%</span>
              <span className="sr-only">{l}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Live flight offers from the site's serverless endpoint (when a provider is configured). */
export function LiveFlightOffers({ from, to, date, ret, adults, children, cabin, fallbackLink }: { from?: string; to?: string; date: string; ret?: string; adults: number; children: number; cabin: string; fallbackLink: string }) {
  const money = useMoney();
  const s = useLiveFlights(from && to ? { from, to, date, ret, adults, children, cabin } : null);
  if (s.status === 'idle') return null;
  if (s.status === 'loading') return <p className="small muted"><span className="live-dot" /> Searching live fares…</p>;
  if (s.status !== 'ready' || !s.offers.length) {
    return (
      <p className="tiny muted">
        <span className="tag">Live fares {s.status === 'unconfigured' ? 'not connected' : 'unavailable'}</span>{' '}
        {s.status === 'unconfigured' ? 'This deployment has no flight-API keys yet, so fares above are modelled estimates.' : s.message} <a href={fallbackLink} target="_blank" rel="noreferrer">Check live prices on Google Flights ↗</a>
      </p>
    );
  }
  const o = s.offers;
  const pick = [o[0], o[Math.floor(o.length / 2)], o[o.length - 1]].filter((x, i, a) => a.indexOf(x) === i);
  const labels = ['Lowest live fare', 'Mid-range', 'Highest returned'];
  return (
    <div className="stack">
      <div className="row"><span className="live-dot" aria-hidden /> <strong className="small">Live fares ({s.provider}) · {o.length} offers</strong></div>
      <table className="cost-table small">
        <thead><tr><th>Option</th><th>Airline</th><th>Stops</th><th className="r">Total</th></tr></thead>
        <tbody>
          {pick.map((x, i) => (
            <tr key={i}><td>{labels[i]}</td><td>{x.carrier}<div className="tiny muted">{x.departs.replace('T', ' ').slice(0, 16)}</div></td><td>{x.stops ? `${x.stops} stop${x.stops > 1 ? 's' : ''}` : 'Direct'}</td><td className="r num">{x.currency === 'INR' ? money(x.price) : `${x.currency} ${x.price.toLocaleString()}`}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="tiny muted">Live offers can change within minutes; book on the airline or agency site.</p>
    </div>
  );
}
