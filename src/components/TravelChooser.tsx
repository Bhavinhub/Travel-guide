import { useMemo } from 'react';
import { getDeparture, mustDestination } from '../data/catalog';
import { legOptions } from '../lib/geo';
import { generateItinerary } from '../lib/itinerary';
import { useMoney } from '../lib/store';
import { fmtDur } from '../lib/time';
import { PRIVATE_MODES, PUBLIC_MODES, type TransportMode, type TripConfig } from '../lib/trip';

export const MODE_ICON: Record<string, string> = { flight: '✈', train: '🚆', bus: '🚌', car: '🚗', 'self-drive': '🔑', bike: '🏍', helicopter: '🚁' };
export const MODE_NAME: Record<string, string> = { flight: 'Flight', train: 'Train', bus: 'Bus', car: 'Private cab', 'self-drive': 'Self-drive car', bike: 'Motorbike', helicopter: 'Helicopter' };
const ALL: TransportMode[] = ['flight', 'train', 'bus', 'car', 'self-drive', 'bike', 'helicopter'];

/** Public / private toggle + 3D mode cards with time and group cost for each way to travel. */
export function TravelChooser({ c, set }: { c: TripConfig; set: (p: Partial<TripConfig>) => void }) {
  const money = useMoney();
  const d = mustDestination(c.destIds[0]);
  const home = getDeparture(c.departureId);
  const options = useMemo(
    () => legOptions({ name: home.name, lat: home.lat, lon: home.lon, tz: home.tz, country: home.country, hasRail: home.hasRail }, { name: d.name, lat: d.lat, lon: d.lon, tz: d.tz, country: d.country }, d, c.travelClass, c.adults + c.children),
    [c.travelClass, c.adults, c.children, d, home],
  );
  const chosen = useMemo(() => generateItinerary(c).outbound?.leg?.mode, [c]);
  if (home.name === d.name) return <p className="muted small">You’re already in {d.name} — no main transport needed.</p>;
  const visible = ALL.filter((m) => c.transportType === 'any' || (c.transportType === 'public' ? PUBLIC_MODES : PRIVATE_MODES).includes(m));
  return (
    <div className="stack">
      <fieldset>
        <legend>Public or private transport</legend>
        <div className="segmented">
          {([['any', 'Show all'], ['public', 'Public (flight, train, bus)'], ['private', 'Private (cab, self-drive, bike, helicopter)']] as const).map(([v, l]) => (
            <button key={v} aria-pressed={c.transportType === v} onClick={() => set({ transportType: v, transport: 'auto', localTransport: v === 'public' ? 'public' : v === 'private' ? 'private' : c.localTransport })}>{l}</button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Travel from {home.name} to {d.name} by</legend>
        <div className="mode-grid">
          {visible.map((m) => {
            const o = options.find((x) => x.mode === m);
            const on = chosen === m;
            return (
              <button key={m} className={`mode-card ${on ? 'on' : ''}`} disabled={!o} aria-pressed={on} onClick={() => set({ transport: m })}>
                <span className="mode-icon" aria-hidden>{MODE_ICON[m]}</span>
                <b>{MODE_NAME[m]}</b>
                <small>{o ? `~${fmtDur(o.durationMin)} · ${money(o.adultINR * c.adults + o.childINR * c.children + o.vehicleINR)} one way` : 'Not available on this route'}</small>
                <small className="tag">{PUBLIC_MODES.includes(m) ? 'Public' : 'Private'}</small>
              </button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}
