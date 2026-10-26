/**
 * Travel Guide data model. Content lives in /src/data and is kept separate from
 * visual components. See docs/DATA.md for how to add destinations.
 */

export type Interest =
  | 'nature'
  | 'beaches'
  | 'mountains'
  | 'culture'
  | 'adventure'
  | 'romance'
  | 'family'
  | 'nightlife'
  | 'wellness'
  | 'food';

export type Mood = 'Nature' | 'Romance' | 'Adventure' | 'Culture' | 'Relaxation' | 'Nightlife';

/** City, region (hill district, valley), country-level island nation, or island group. */
export type PlaceKind = 'city' | 'city-state' | 'region' | 'island' | 'atoll' | 'town';

export type Scope = 'india' | 'world';

export type Continent = 'Asia' | 'Europe' | 'North America' | 'Oceania' | 'Africa' | 'South America';

export type BudgetTier = 'budget' | 'comfortable' | 'premium' | 'luxury';

export interface Attraction {
  id: string;
  name: string;
  /** Typical visit duration, minutes. */
  durationMin: number;
  /** Illustrative per-person cost in INR (entry / activity). 0 = free. */
  costINR: number;
  indoor: boolean;
  /** Preferred time slot. */
  slot: 'morning' | 'midday' | 'afternoon' | 'sunset' | 'evening' | 'any';
  /** Needs daylight to be enjoyable/safe. */
  daylight?: boolean;
  /** Typical transfer from the city base, minutes (one way). */
  transferMin?: number;
  difficulty?: 'easy' | 'moderate' | 'challenging';
  kind?: 'sight' | 'nature' | 'activity' | 'food' | 'shopping' | 'adventure' | 'wellness' | 'nightlife';
  /** Short practical note. Never claims verified hours. */
  note?: string;
}

export interface Destination {
  id: string;
  name: string;
  /** Alternate names used by search (e.g. Bangalore). */
  aka?: string[];
  kind: PlaceKind;
  scope: Scope;
  /** India: state / union territory. */
  state?: string;
  stateType?: 'State' | 'Union Territory';
  continent: Continent;
  country: string;
  lat: number;
  lon: number;
  /** IANA time zone. */
  tz: string;
  /** Wikipedia article title used to fetch real, attributed media. */
  wiki: string;
  tagline: string;
  why: string;
  interests: Interest[];
  moods: Mood[];
  /** Recommended days [min, ideal]. */
  days: [number, number];
  bestMonths: number[]; // 1-12
  seasonsNote: string;
  /** Illustrative nightly room rate (INR) by category, and daily per-person meals/local spend. */
  cost: {
    room: Record<BudgetTier, number>;
    mealsPerPerson: Record<BudgetTier, number>;
    localPerDay: number; // private car with driver, per vehicle per day
    publicPerPerson: number; // public transport / app cabs, per person per day
  };
  /** Which surface transport modes are realistic from within India. */
  access: { air: boolean; rail: boolean; road: boolean; nearestAirport?: string };
  /** For places without their own airport: the hub you fly into, plus the onward transfer. */
  gateway?: { name: string; lat: number; lon: number; mode: 'road' | 'ferry' | 'rail' | 'speedboat' | 'seaplane'; minutes: number; costPP: number };
  attractions: Attraction[];
  food: string[];
  culture: string[];
  nearby: string[]; // destination ids or plain names
  suitability: { couples: number; families: number; solo: number; friends: number }; // 1-5
  accessibility: string;
  /** Honeymoon extras available here. */
  romanceExtras?: string[];
  /** Optional verified video. Leave undefined unless licensed + captioned. */
  video?: { src: string; captions?: string; credit: string; poster?: string };
  /** Sky/scene palette for illustrative fallback art and destination accent colour. */
  accent: string;
  scene: 'forest' | 'rainforest' | 'mountain' | 'snow' | 'beach' | 'city' | 'desert' | 'heritage';
  /** Permits, visas etc. described qualitatively — never invented fee amounts. */
  entryNotes?: string;
}

export interface DepartureCity {
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  tz: string;
  hasRail: boolean;
}

export interface NightlifeListing {
  id: string;
  city: string; // destination id
  title: string;
  area: string;
  wiki: string; // area photo
  types: ('rooftop' | 'cocktail' | 'live-music' | 'beach-club' | 'private-events' | 'dancing' | 'relaxed' | 'beachside')[];
  atmosphere: string;
  music: string;
  spendINR: [number, number]; // per person, illustrative
  transport: string;
  returnTip: string;
  alcoholFree: string;
}
