import type { BudgetTier, Interest } from '../data/types';
import type { CurrencyCode } from '../data/services';
import { addDaysISO, todayISO } from './time';

export type Pacing = 'relaxed' | 'balanced' | 'busy';
export type TransportMode = 'auto' | 'flight' | 'train' | 'bus' | 'car' | 'self-drive' | 'bike' | 'helicopter';
export type TransportType = 'any' | 'public' | 'private';
export const PUBLIC_MODES: TransportMode[] = ['flight', 'train', 'bus'];
export const PRIVATE_MODES: TransportMode[] = ['car', 'self-drive', 'bike', 'helicopter'];
export type TravelClass = 'economy' | 'premium' | 'business';

export interface TripConfig {
  departureId: string;
  destIds: string[];
  dateMode: 'fixed' | 'flexible';
  startDate: string; // yyyy-mm-dd (for flexible mode: the 1st of the chosen month)
  days: number; // total trip days, including travel days (1 = same-day outing)
  adults: number;
  children: number;
  rooms: number;
  tier: BudgetTier;
  transport: TransportMode;
  /** Public (scheduled flights, trains, buses) or private (car, self-drive, bike, charter). */
  transportType: TransportType;
  travelClass: TravelClass;
  localTransport: 'private' | 'public' | 'mixed';
  mealPlan: 'local' | 'mixed' | 'fine';
  mealPref: 'any' | 'vegetarian' | 'vegan' | 'jain' | 'halal';
  pacing: Pacing;
  guide: 'none' | 'half' | 'full';
  includeAdventure: boolean;
  mustSee: string[]; // `${destId}:${attractionId}`
  services: Record<string, number>; // service id → quantity
  interests: Interest[];
  budgetPerPersonINR: number; // target, for the Budget Comfort Meter
  currency: CurrencyCode;
  contingencyPct: number; // 0–20
}

export interface PlanItem {
  uid: string;
  type: 'activity' | 'meal' | 'rest' | 'transit' | 'checkin' | 'checkout' | 'service' | 'free';
  title: string;
  durationMin: number;
  location: string;
  destId: string;
  /** Per-person cost in INR (children are charged at the factor in the estimator). */
  costPP: number;
  /** Fixed group cost in INR (e.g. couple services, transit vehicles). */
  groupCost?: number;
  transport?: string;
  note?: string;
  attractionId?: string;
  serviceId?: string;
  slot?: string;
  indoor?: boolean;
  daylight?: boolean;
  locked?: boolean;
  optional?: boolean;
  /** Earliest start (min after midnight, destination local time). */
  notBefore?: number;
  /** Must start exactly at this time (transit departures). */
  fixedStart?: number;
  /** Happens during the previous item (e.g. lunch on a day excursion). */
  during?: boolean;
  /** Transit cost category for the estimator. */
  costCategory?: 'mainTransport' | 'localTravel' | 'services' | 'activities' | 'meals';
}

export interface DayPlan {
  index: number;
  date: string;
  destId: string;
  title: string;
  dayStart: number;
  items: PlanItem[];
  /** Accommodation is needed tonight at this destination. */
  overnight: boolean;
  /** How much of the day is spent at the destination (local travel/meals weighting). */
  presence: number; // 0..1
}

export interface Trip {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  config: TripConfig;
  days: DayPlan[];
}

export function nextMonthStart() {
  const t = todayISO();
  const d = new Date(`${t}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1, 1);
  return d.toISOString().slice(0, 10);
}

export function defaultConfig(partial: Partial<TripConfig> = {}): TripConfig {
  return {
    departureId: 'bengaluru',
    destIds: ['coorg'],
    dateMode: 'fixed',
    startDate: addDaysISO(todayISO(), 30),
    days: 3,
    adults: 2,
    children: 0,
    rooms: 1,
    tier: 'comfortable',
    transport: 'auto',
    transportType: 'any',
    travelClass: 'economy',
    localTransport: 'private',
    mealPlan: 'mixed',
    mealPref: 'any',
    pacing: 'balanced',
    guide: 'none',
    includeAdventure: false,
    mustSee: [],
    services: {},
    interests: [],
    budgetPerPersonINR: 25000,
    currency: 'INR',
    contingencyPct: 10,
    ...partial,
  };
}

export const uid = () => Math.random().toString(36).slice(2, 10);

export function validateConfig(c: TripConfig): Record<string, string> {
  const e: Record<string, string> = {};
  if (!c.destIds.length) e.destIds = 'Choose at least one destination.';
  if (c.adults < 1) e.adults = 'At least one adult must travel.';
  if (c.adults > 20) e.adults = 'For groups above 20 adults, please request a group quote.';
  if (c.children < 0 || c.children > 10) e.children = 'Children must be between 0 and 10.';
  if (c.rooms < 1) e.rooms = 'At least one room is needed.';
  if (c.rooms > c.adults) e.rooms = 'Each room needs at least one adult.';
  if (c.adults + c.children > c.rooms * 4) e.rooms = 'Too many travellers per room — most hotels allow up to 3 adults or 2 adults + 2 children. Add a room.';
  if (c.days < 1 || c.days > 21) e.days = 'Trip length must be 1–21 days.';
  if (c.days < c.destIds.length) e.days = `Allow at least one day per destination (${c.destIds.length}).`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.startDate)) e.startDate = 'Choose a valid start date.';
  else if (c.dateMode === 'fixed' && c.startDate < todayISO()) e.startDate = 'Start date is in the past.';
  if (c.contingencyPct < 0 || c.contingencyPct > 25) e.contingencyPct = 'Contingency must be 0–25%.';
  return e;
}
