import { DEPARTURE_CITIES, getDeparture, mustDestination } from '../data/catalog';
import type { Destination } from '../data/types';
import { estimateTrip } from './estimate';
import { gcKm, RATES, type LegOption } from './geo';
import { generateItinerary, priceLevel } from './itinerary';
import { defaultConfig, type TripConfig } from './trip';

/** Closest departure city (Indian cities for Indian destinations). */
export function nearestDeparture(d: Destination) {
  const pool = DEPARTURE_CITIES.filter((c) => c.country === 'India' && c.name !== d.name);
  return pool.reduce((best, c) => (gcKm(c, d) < gcKm(best, d) ? c : best), pool[0]).id;
}

/** Cached quick estimate for search results and destination cards. */
const cache = new Map<string, { total: number; pp: number }>();
export function quickEstimate(destId: string, days: number, o: Partial<TripConfig> = {}) {
  const key = `${destId}|${days}|${JSON.stringify(o)}`;
  if (!cache.has(key)) {
    const c = defaultConfig({ destIds: [destId], days, departureId: nearestDeparture(mustDestination(destId)), ...o });
    const e = estimateTrip(c, generateItinerary(c).days);
    cache.set(key, { total: e.total, pp: e.perPerson });
  }
  return cache.get(key)!;
}

export interface Tier { name: string; detail: string; total: number; unit?: string }

/** Flight fare tiers derived from the modelled economy fare (illustrative). */
export function flightTiers(leg: LegOption, c: TripConfig): Tier[] {
  const econ = leg.adultINR / (c.travelClass === 'business' ? 3.5 : c.travelClass === 'premium' ? 1.8 : 1);
  const party = (f: number) => Math.round((econ * f) * (c.adults + c.children * 0.75) * 2);
  return [
    { name: 'Lowest — economy saver', detail: 'Cabin bag only, non-refundable, early/late departures', total: party(0.8) },
    { name: 'Mid-range — economy flexi', detail: 'Checked bag, seat selection, change allowed', total: party(1.15) },
    { name: 'Premium — premium economy', detail: 'Extra legroom, priority boarding (where offered)', total: party(1.8) },
    { name: 'Premium — business', detail: 'Lie-flat or recliner seats, lounge access', total: party(3.5) },
  ];
}

export const CAR_CLASSES = [
  { name: 'Hatchback (e.g. Swift class)', seats: 4, perKm: 11, perDay: 2200, selfDay: 2200 },
  { name: 'Sedan (e.g. Dzire class)', seats: 4, perKm: 13, perDay: 2800, selfDay: 2800 },
  { name: 'SUV (e.g. Innova / Ertiga class)', seats: 6, perKm: 18, perDay: 3800, selfDay: 4200 },
  { name: 'Luxury (e.g. E-class / premium SUV)', seats: 4, perKm: 35, perDay: 9000, selfDay: 9000 },
];

export function carTiers(km: number, people: number, days: number, self = false): Tier[] {
  return CAR_CLASSES.filter((cl) => cl.seats >= Math.min(people, 6)).map((cl) => {
    const cars = Math.ceil(people / cl.seats);
    const total = self
      ? (cl.selfDay * Math.max(1, days) + km * 2 * (RATES.selfDriveFuelPerKm + RATES.tollPerKm)) * cars
      : cl.perKm * km * 2 * cars + 400 * Math.max(0, days - 1) * cars;
    return { name: `${cl.name}${cars > 1 ? ` × ${cars}` : ''}`, detail: self ? `₹${cl.selfDay.toLocaleString('en-IN')}/day + fuel & tolls` : `₹${cl.perKm}/km return + driver allowance`, total: Math.round(total) };
  }).sort((a, b) => a.total - b.total);
}

export function bikeTiers(km: number, people: number, days: number): Tier[] {
  const bikes = Math.ceil(people / 2);
  return [
    { name: 'Scooter (110–125cc)', perDay: 600, fuel: 2 },
    { name: 'Commuter bike (150–200cc)', perDay: 900, fuel: 2.5 },
    { name: 'Royal Enfield Classic 350 class', perDay: 1500, fuel: 3 },
    { name: 'Adventure tourer (Himalayan class)', perDay: 2200, fuel: 3.5 },
  ].map((b) => ({ name: `${b.name}${bikes > 1 ? ` × ${bikes}` : ''}`, detail: `₹${b.perDay}/day + fuel · 2 riders per bike`, total: Math.round((b.perDay * Math.max(1, days) + km * 2 * b.fuel) * bikes) }));
}

export function trainTiers(km: number, c: TripConfig): Tier[] {
  const pax = c.adults + c.children * 0.5;
  return [
    { name: 'Sleeper (SL)', perKm: 0.55 },
    { name: 'AC 3-tier (3A)', perKm: 1.5 },
    { name: 'AC 2-tier (2A)', perKm: 2.3 },
    { name: 'AC First Class (1A)', perKm: 3.8 },
  ].map((t) => ({ name: t.name, detail: `~₹${t.perKm}/km per adult`, total: Math.round(Math.max(200, t.perKm * km) * pax * 2) }));
}

export function busTiers(km: number, c: TripConfig): Tier[] {
  const pax = c.adults + c.children;
  return [
    { name: 'State bus (non-AC seater)', perKm: 0.9 },
    { name: 'AC seater', perKm: 1.3 },
    { name: 'AC sleeper', perKm: 2.1 },
    { name: 'Volvo / Scania multi-axle', perKm: 2.6 },
  ].map((t) => ({ name: t.name, detail: `~₹${t.perKm}/km per seat`, total: Math.round(t.perKm * km * pax * 2) }));
}

/** Airport (or gateway) → destination transfer choices with costs. */
export function arrivalTransfer(d: Destination, c: TripConfig) {
  const pax = c.adults + c.children;
  const level = priceLevel(d);
  if (d.gateway) {
    const km = Math.round(gcKm(d.gateway, d) * (d.gateway.mode === 'road' ? 1.35 : 1));
    const opts: Tier[] = [{ name: `${d.gateway.mode[0].toUpperCase()}${d.gateway.mode.slice(1)} transfer (typical)`, detail: `~${Math.round(d.gateway.minutes / 6) * 6} min`, total: Math.round(d.gateway.costPP * (c.adults + c.children * 0.5)) }];
    if (d.gateway.mode === 'road') {
      opts.push({ name: 'Shared / public bus', detail: 'Cheapest; check timetables locally', total: Math.round(km * 1.3 * pax) });
      opts.push(...carTiers(km, pax, 1).slice(0, 3).map((t) => ({ ...t, total: Math.round(t.total / 2), detail: t.detail.replace('return + driver allowance', 'one way') })));
    }
    return { from: d.gateway.name, km, opts: opts.sort((a, b) => a.total - b.total) };
  }
  const km = 30;
  const base = d.country === 'India' ? 1 : level * 1.6;
  return {
    from: `${d.name} airport`, km,
    opts: [
      { name: 'Airport metro / bus / shuttle (where available)', detail: 'Cheapest; check routes on arrival', total: Math.round(120 * pax * base) },
      { name: 'App cab — economy', detail: 'Uber / Ola / Grab-type apps', total: Math.round(km * 18 * base * Math.ceil(pax / 4)) },
      { name: 'App cab — premium / XL', detail: 'Larger or premium car', total: Math.round(km * 28 * base * Math.ceil(pax / 6)) },
      { name: 'Hotel / private transfer', detail: 'Pre-booked meet & greet', total: Math.round(km * 40 * base * Math.ceil(pax / 4)) },
    ],
  };
}

export function hotelTiers(c: TripConfig) {
  const d = mustDestination(c.destIds[0]);
  const nights = Math.max(1, c.days - 1);
  return (['budget', 'comfortable', 'premium', 'luxury'] as const).map((t) => ({
    tier: t,
    label: { budget: 'Best-value, well-rated', comfortable: '3-star comfort', premium: '4-star / boutique', luxury: '5-star & heritage' }[t],
    nightly: d.cost.room[t] * c.rooms,
    total: d.cost.room[t] * c.rooms * nights,
    nights,
  }));
}

export const homeName = (c: TripConfig) => getDeparture(c.departureId).name;
