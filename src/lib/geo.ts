import type { Destination } from '../data/types';
import { PRIVATE_MODES, PUBLIC_MODES, type TransportMode, type TransportType, type TravelClass } from './trip';

export interface Point {
  name: string;
  lat: number;
  lon: number;
  tz: string;
  country: string;
  hasRail?: boolean;
}

const R = 6371;
export function gcKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const toR = (x: number) => (x * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat);
  const dLon = toR(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const destPoint = (d: Destination): Point => ({
  name: d.name, lat: d.lat, lon: d.lon, tz: d.tz, country: d.country, hasRail: d.access.rail,
});

const hilly = (d?: Destination) => !!d && (d.scene === 'mountain' || d.scene === 'snow' || d.scene === 'rainforest');

export interface LegOption {
  mode: Exclude<TransportMode, 'auto'>;
  label: string;
  /** In-vehicle duration including any onward gateway transfer, minutes. */
  durationMin: number;
  km: number;
  /** INR per adult for this leg (per-person modes). */
  adultINR: number;
  childINR: number;
  /** INR per vehicle-group for vehicle modes (car/self-drive). */
  vehicleINR: number;
  vehicles: number;
  gateway?: { name: string; mode: string; minutes: number; costPP: number };
  notes: string[];
}

/** Rate card (INR). Illustrative, documented in docs/DATA.md. */
export const RATES = {
  flightDomestic: { base: 2500, perKm: 4.2 },
  flightIntl: { base: 5000, perKm: 5.2 },
  flightClassMult: { economy: 1, premium: 1.8, business: 3.5 },
  flightChild: 0.75,
  trainPerKm: { economy: 1.5, premium: 2.3, business: 3.8 },
  trainChild: 0.5,
  busPerKm: { economy: 1.3, premium: 2.1, business: 2.1 },
  carPerKm: { sedan: 13, suv: 18, van: 26 },
  selfDriveFuelPerKm: 8,
  tollPerKm: 1.5,
  selfDriveRentalPerDay: 2800,
  bikeRentalPerDay: 1500,
  bikeFuelPerKm: 3,
  heliPerHour: 200000,
  heliSpeed: 180,
  speeds: { train: 55, bus: 45, car: 52, hillCar: 45 },
};

export function vehiclesFor(people: number) {
  if (people <= 4) return { kind: 'sedan' as const, count: 1 };
  if (people <= 6) return { kind: 'suv' as const, count: 1 };
  if (people <= 12) return { kind: 'van' as const, count: 1 };
  return { kind: 'van' as const, count: Math.ceil(people / 12) };
}

/** All realistic options between two points for this party. */
export function legOptions(from: Point, to: Point, toDest: Destination | undefined, cls: TravelClass, people: number): LegOption[] {
  const out: LegOption[] = [];
  const km = gcKm(from, to);
  if (km < 5) return out;
  const inIndia = from.country === 'India' && to.country === 'India';
  const roadFactor = hilly(toDest) ? 1.35 : 1.25;
  const roadKm = km * roadFactor;
  const islandOrAbroad = !toDest?.access.road || !inIndia;

  // Flights (to the destination airport or its gateway hub).
  const gw = toDest?.gateway;
  const airTo = gw ? { lat: gw.lat, lon: gw.lon } : to;
  const flyKm = gcKm(from, airTo);
  const canFly = (toDest ? toDest.access.air || !!gw : true) && flyKm > 250;
  if (canFly) {
    const intl = !inIndia;
    const r = intl ? RATES.flightIntl : RATES.flightDomestic;
    const stop = flyKm > 8500 ? 150 : 0;
    const block = 35 + (flyKm / 780) * 60 + stop;
    const fare = (r.base + r.perKm * flyKm) * RATES.flightClassMult[cls];
    const notes = ['Allow ~2 h at the airport before departure (3 h for international).'];
    if (stop) notes.push('Likely one connection on this route.');
    out.push({
      mode: 'flight',
      label: gw ? `Flight to ${gw.name}, then ${gw.mode}` : 'Flight',
      durationMin: Math.round(block + (gw ? gw.minutes : 45)),
      km: Math.round(flyKm),
      adultINR: Math.round(fare),
      childINR: Math.round(fare * RATES.flightChild),
      vehicleINR: 0,
      vehicles: 0,
      gateway: gw ? { name: gw.name, mode: gw.mode, minutes: gw.minutes, costPP: gw.costPP } : undefined,
      notes,
    });
  }

  if (inIndia && !islandOrAbroad) {
    const railKm = km * 1.35;
    if (from.hasRail && toDest?.access.rail && railKm <= 2800 && railKm > 60) {
      const fare = Math.max(300, RATES.trainPerKm[cls] * railKm);
      out.push({
        mode: 'train', label: `Train (${cls === 'economy' ? '3AC' : cls === 'premium' ? '2AC' : '1AC'})`,
        durationMin: Math.round((railKm / RATES.speeds.train) * 60), km: Math.round(railKm),
        adultINR: Math.round(fare), childINR: Math.round(fare * RATES.trainChild), vehicleINR: 0, vehicles: 0,
        notes: ['Seat availability is not checked — book via official railway channels.'],
      });
    }
    if (roadKm <= 1100) {
      const fare = RATES.busPerKm[cls] * roadKm;
      out.push({
        mode: 'bus', label: cls === 'economy' ? 'Bus (AC seater)' : 'Bus (AC sleeper)',
        durationMin: Math.round((roadKm / RATES.speeds.bus) * 60), km: Math.round(roadKm),
        adultINR: Math.round(fare), childINR: Math.round(fare), vehicleINR: 0, vehicles: 0,
        notes: ['Children usually need their own seat.'],
      });
    }
    if (roadKm <= 900) {
      const v = vehiclesFor(people);
      const speed = hilly(toDest) ? RATES.speeds.hillCar : RATES.speeds.car;
      out.push({
        mode: 'car', label: `Private car with driver (${v.count} × ${v.kind})`,
        durationMin: Math.round((roadKm / speed) * 60), km: Math.round(roadKm),
        adultINR: 0, childINR: 0, vehicleINR: Math.round(RATES.carPerKm[v.kind] * roadKm * v.count), vehicles: v.count,
        notes: ['Operators may bill minimum daily kilometres and a driver night allowance.'],
      });
      out.push({
        mode: 'self-drive', label: 'Self-drive rental',
        durationMin: Math.round((roadKm / speed) * 60 * 1.1), km: Math.round(roadKm),
        adultINR: 0, childINR: 0,
        vehicleINR: Math.round((RATES.selfDriveFuelPerKm + RATES.tollPerKm) * roadKm * v.count), vehicles: v.count,
        notes: ['Fuel and tolls only; daily rental is counted under local travel. Valid licence required.'],
      });
    }
    if (roadKm <= 700) {
      const bikes = Math.ceil(people / 2);
      out.push({
        mode: 'bike', label: `Motorbike road trip (${bikes} bike${bikes > 1 ? 's' : ''})`,
        durationMin: Math.round((roadKm / (hilly(toDest) ? 32 : 40)) * 60), km: Math.round(roadKm),
        adultINR: 0, childINR: 0, vehicleINR: Math.round(RATES.bikeFuelPerKm * roadKm * bikes), vehicles: bikes,
        notes: ['Fuel only; daily bike rental is counted under local travel. Licence, helmets and riding experience required; not suitable with young children.'],
      });
    }
    // Private helicopter charter: hill and island destinations within charter range.
    if (toDest && toDest.scene !== 'city' && km >= 60 && km <= 400) {
      const hours = km / RATES.heliSpeed + 0.5;
      const helis = Math.ceil(people / 5);
      out.push({
        mode: 'helicopter', label: 'Private helicopter charter (on request)',
        durationMin: Math.round((km / RATES.heliSpeed) * 60 + 30), km: Math.round(km),
        adultINR: 0, childINR: 0, vehicleINR: Math.round(hours * RATES.heliPerHour * helis), vehicles: helis,
        notes: ['Charter availability, landing permissions and weather limits vary — the operator confirms on enquiry. Price includes an assumed positioning time.'],
      });
    }
  }
  return out;
}

/** Pick the requested mode if available, otherwise a sensible automatic choice. */
export function chooseLeg(all: LegOption[], pref: TransportMode, type: TransportType = 'any'): { leg?: LegOption; fallback: boolean } {
  const allowed = type === 'public' ? PUBLIC_MODES : type === 'private' ? PRIVATE_MODES : null;
  const filtered = allowed ? all.filter((o) => allowed.includes(o.mode)) : all;
  const options = filtered.length ? filtered : all;
  if (!options.length) return { leg: undefined, fallback: false };
  if (pref !== 'auto') {
    const m = options.find((o) => o.mode === pref);
    if (m) return { leg: m, fallback: false };
  }
  const car = options.find((o) => o.mode === 'car');
  const train = options.find((o) => o.mode === 'train');
  const flight = options.find((o) => o.mode === 'flight');
  let leg: LegOption | undefined;
  if (car && car.durationMin <= 420) leg = car;
  else if (train && train.durationMin <= 720 && (!flight || train.durationMin < flight.durationMin + 360)) leg = train;
  else leg = flight ?? train ?? car ?? options.find((o) => o.mode === 'bus') ?? options.find((o) => o.mode === 'self-drive') ?? options[0];
  return { leg, fallback: pref !== 'auto' || filtered.length === 0 };
}

export function costForParty(leg: LegOption, adults: number, children: number) {
  const gw = leg.gateway ? leg.gateway.costPP * (adults + children * 0.5) : 0;
  return Math.round(leg.adultINR * adults + leg.childINR * children + leg.vehicleINR + gw);
}
