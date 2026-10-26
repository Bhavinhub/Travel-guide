import type { DepartureCity, Destination, Interest, Mood } from './types';
import { INDIA } from './destinations-india';
import { WORLD } from './destinations-world';

export const DESTINATIONS: Destination[] = [...INDIA, ...WORLD];
const BY_ID = new Map(DESTINATIONS.map((d) => [d.id, d]));

export const getDestination = (id: string) => BY_ID.get(id);
export const mustDestination = (id: string) => {
  const d = BY_ID.get(id);
  if (!d) throw new Error(`Unknown destination ${id}`);
  return d;
};

export const DEPARTURE_CITIES: DepartureCity[] = [
  { id: 'bengaluru', name: 'Bengaluru', country: 'India', lat: 12.9716, lon: 77.5946, tz: 'Asia/Kolkata', hasRail: true },
  { id: 'mumbai', name: 'Mumbai', country: 'India', lat: 19.076, lon: 72.8777, tz: 'Asia/Kolkata', hasRail: true },
  { id: 'delhi', name: 'Delhi', country: 'India', lat: 28.6139, lon: 77.209, tz: 'Asia/Kolkata', hasRail: true },
  { id: 'chennai', name: 'Chennai', country: 'India', lat: 13.0827, lon: 80.2707, tz: 'Asia/Kolkata', hasRail: true },
  { id: 'hyderabad', name: 'Hyderabad', country: 'India', lat: 17.385, lon: 78.4867, tz: 'Asia/Kolkata', hasRail: true },
  { id: 'kolkata', name: 'Kolkata', country: 'India', lat: 22.5726, lon: 88.3639, tz: 'Asia/Kolkata', hasRail: true },
  { id: 'pune', name: 'Pune', country: 'India', lat: 18.5204, lon: 73.8567, tz: 'Asia/Kolkata', hasRail: true },
  { id: 'ahmedabad', name: 'Ahmedabad', country: 'India', lat: 23.0225, lon: 72.5714, tz: 'Asia/Kolkata', hasRail: true },
  { id: 'kochi', name: 'Kochi', country: 'India', lat: 9.9312, lon: 76.2673, tz: 'Asia/Kolkata', hasRail: true },
  { id: 'jaipur', name: 'Jaipur', country: 'India', lat: 26.9124, lon: 75.7873, tz: 'Asia/Kolkata', hasRail: true },
  { id: 'dubai', name: 'Dubai', country: 'United Arab Emirates', lat: 25.2048, lon: 55.2708, tz: 'Asia/Dubai', hasRail: false },
  { id: 'singapore', name: 'Singapore', country: 'Singapore', lat: 1.3521, lon: 103.8198, tz: 'Asia/Singapore', hasRail: false },
  { id: 'london', name: 'London', country: 'United Kingdom', lat: 51.5074, lon: -0.1278, tz: 'Europe/London', hasRail: false },
  { id: 'new-york', name: 'New York City', country: 'United States', lat: 40.7128, lon: -74.006, tz: 'America/New_York', hasRail: false },
];
export const getDeparture = (id: string) => DEPARTURE_CITIES.find((c) => c.id === id) ?? DEPARTURE_CITIES[0];

export const INTEREST_LABELS: Record<Interest, string> = {
  nature: 'Nature', beaches: 'Beaches', mountains: 'Mountains', culture: 'Culture', adventure: 'Adventure',
  romance: 'Romance', family: 'Family travel', nightlife: 'Nightlife', wellness: 'Wellness', food: 'Food',
};

export const MOODS: { id: Mood; icon: string; blurb: string }[] = [
  { id: 'Nature', icon: '🌿', blurb: 'Forests, tea hills and waterfalls' },
  { id: 'Romance', icon: '♡', blurb: 'Lakes, sunsets and quiet islands' },
  { id: 'Adventure', icon: '⛰', blurb: 'Rapids, peaks and reefs' },
  { id: 'Culture', icon: '🏛', blurb: 'Palaces, temples and old quarters' },
  { id: 'Relaxation', icon: '☾', blurb: 'Backwaters, beaches and spas' },
  { id: 'Nightlife', icon: '✦', blurb: 'Rooftops, live music and late food' },
];

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const KIND_LABEL: Record<Destination['kind'], string> = {
  city: 'City', 'city-state': 'City-state', region: 'Region', island: 'Island', atoll: 'Atoll', town: 'Town',
};

/** India: State/UT → destinations. */
export function indiaHierarchy() {
  const map = new Map<string, { state: string; type: string; items: Destination[] }>();
  INDIA.forEach((d) => {
    const key = d.state!;
    if (!map.has(key)) map.set(key, { state: key, type: d.stateType ?? 'State', items: [] });
    map.get(key)!.items.push(d);
  });
  return [...map.values()].sort((a, b) => a.state.localeCompare(b.state));
}

/** World: Continent → country → destinations. */
export function worldHierarchy() {
  const cont = new Map<string, Map<string, Destination[]>>();
  WORLD.forEach((d) => {
    if (!cont.has(d.continent)) cont.set(d.continent, new Map());
    const c = cont.get(d.continent)!;
    if (!c.has(d.country)) c.set(d.country, []);
    c.get(d.country)!.push(d);
  });
  return [...cont.entries()].map(([continent, countries]) => ({
    continent,
    countries: [...countries.entries()].map(([country, items]) => ({ country, items })),
  }));
}

export function searchDestinations(q: string, list: Destination[] = DESTINATIONS) {
  const s = q.trim().toLowerCase();
  if (!s) return list;
  return list.filter((d) =>
    [d.name, ...(d.aka ?? []), d.state ?? '', d.country, d.continent, d.tagline, ...d.attractions.map((a) => a.name)]
      .join(' ')
      .toLowerCase()
      .includes(s),
  );
}

export interface DestinationFilters {
  interests: Interest[];
  maxDays?: number;
  budget?: 'budget' | 'mid' | 'premium' | 'luxury';
  month?: number;
}

/** Budget band from a destination's comfortable room rate. */
export function budgetBand(d: Destination): 'budget' | 'mid' | 'premium' | 'luxury' {
  const r = d.cost.room.comfortable;
  if (r < 5000) return 'budget';
  if (r < 9000) return 'mid';
  if (r < 20000) return 'premium';
  return 'luxury';
}

export function filterDestinations(list: Destination[], f: DestinationFilters) {
  return list.filter((d) => {
    if (f.interests.length && !f.interests.every((i) => d.interests.includes(i))) return false;
    if (f.maxDays && d.days[0] > f.maxDays) return false;
    if (f.budget && budgetBand(d) !== f.budget) return false;
    if (f.month && !d.bestMonths.includes(f.month)) return false;
    return true;
  });
}
