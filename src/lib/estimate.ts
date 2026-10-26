import { COMPANY, PRICING_BASIS } from '../config/company';
import { getDeparture, mustDestination } from '../data/catalog';
import { GUIDE_DAY_INR, getService } from '../data/services';
import { RATES, vehiclesFor } from './geo';
import { MEAL_PLAN_FACTOR, PACE, people, priceLevel } from './itinerary';
import { monthOf } from './time';
import type { DayPlan, TripConfig } from './trip';

export type CategoryKey = 'mainTransport' | 'accommodation' | 'localTravel' | 'meals' | 'activities' | 'guides' | 'services' | 'fees';

export const CATEGORY_LABELS: Record<CategoryKey, string> = {
  mainTransport: 'Main transport',
  accommodation: 'Accommodation',
  localTravel: 'Local travel',
  meals: 'Meals',
  activities: 'Activities & entry fees',
  guides: 'Guides',
  services: 'Optional services',
  fees: 'Applicable fees',
};

/** Low/high multipliers per category used for the estimated range. */
export const RANGE: Record<CategoryKey, [number, number]> = {
  mainTransport: [0.8, 1.4],
  accommodation: [0.85, 1.25],
  localTravel: [0.85, 1.2],
  meals: [0.8, 1.3],
  activities: [0.9, 1.15],
  guides: [0.9, 1.15],
  services: [0.9, 1.2],
  fees: [1, 1],
};

export const CHILD_FACTOR = { activities: 0.5, meals: 0.6 };

export interface DayCost {
  index: number;
  date: string;
  destName: string;
  parts: Record<CategoryKey, number>;
  total: number;
}

export interface Estimate {
  categories: { key: CategoryKey; label: string; amount: number; low: number; high: number; lines: string[] }[];
  subtotal: number;
  contingency: number;
  total: number;
  low: number;
  high: number;
  perPerson: number;
  travellers: number;
  nights: number;
  daily: DayCost[];
  inclusions: string[];
  exclusions: string[];
  assumptions: string[];
  basis: typeof PRICING_BASIS;
}

const zero = (): Record<CategoryKey, number> => ({
  mainTransport: 0, accommodation: 0, localTravel: 0, meals: 0, activities: 0, guides: 0, services: 0, fees: 0,
});

export function seasonFactor(destId: string, month: number) {
  return mustDestination(destId).bestMonths.includes(month) ? 1.1 : 0.9;
}

export function estimateTrip(c: TripConfig, days: DayPlan[]): Estimate {
  const pax = people(c);
  const month = monthOf(c.startDate);
  const lines: Record<CategoryKey, string[]> = {
    mainTransport: [], accommodation: [], localTravel: [], meals: [], activities: [], guides: [], services: [], fees: [],
  };
  const daily: DayCost[] = [];
  let nights = 0;
  const veh = vehiclesFor(pax);
  const selfDrive = c.transport === 'self-drive';
  const bike = c.transport === 'bike';

  days.forEach((day) => {
    const d = mustDestination(day.destId);
    const parts = zero();
    // Items: transport, activities, meals, services.
    day.items.forEach((it) => {
      const cat = (it.costCategory ?? (it.type === 'meal' ? 'meals' : it.type === 'service' ? 'services' : 'activities')) as CategoryKey;
      let amt = 0;
      if (it.groupCost) amt += it.groupCost;
      if (it.costPP) {
        const childF = cat === 'meals' ? CHILD_FACTOR.meals : CHILD_FACTOR.activities;
        amt += it.costPP * (c.adults + c.children * childF);
      }
      if (!amt) return;
      parts[cat] += amt;
      if (cat === 'mainTransport') lines.mainTransport.push(`${it.title}: ₹${Math.round(amt).toLocaleString('en-IN')}`);
      if (cat === 'services') lines.services.push(`${it.title} (${d.name}): ₹${Math.round(amt).toLocaleString('en-IN')}`);
    });

    // Accommodation for tonight.
    if (day.overnight) {
      const rate = d.cost.room[c.tier] * seasonFactor(d.id, month);
      const extraAdults = Math.max(0, c.adults - c.rooms * 2);
      const night = c.rooms * rate + extraAdults * rate * 0.25;
      parts.accommodation += night;
      nights += 1;
    }

    // Local travel, weighted by time spent at the destination.
    if (day.presence > 0) {
      let local = 0;
      const pub = d.cost.publicPerPerson * pax;
      const priv = d.cost.localPerDay ? d.cost.localPerDay * veh.count : pub;
      if (bike && d.country === 'India' && d.access.road) local = (RATES.bikeRentalPerDay + 40 * RATES.bikeFuelPerKm) * Math.ceil(pax / 2);
      else if (selfDrive && d.country === 'India' && d.access.road) local = RATES.selfDriveRentalPerDay * veh.count + 40 * RATES.selfDriveFuelPerKm;
      else if (c.localTransport === 'private') local = priv;
      else if (c.localTransport === 'public') local = pub;
      else local = (priv + pub) / 2;
      parts.localTravel += local * day.presence;
    }

    // Guides on sightseeing days.
    if (c.guide !== 'none' && day.items.some((i) => i.type === 'activity')) {
      const rate = GUIDE_DAY_INR[c.guide] * priceLevel(d) * Math.max(1, Math.ceil(pax / 15));
      parts.guides += rate * Math.max(0.5, day.presence);
    }

    const total = Object.values(parts).reduce((a, b) => a + b, 0);
    daily.push({ index: day.index, date: day.date, destName: day.title, parts, total });
  });

  // Trip-level services not represented as itinerary items.
  const tripLevel = Object.entries(c.services).filter(([id, q]) => q > 0 && id === 'transfers');
  tripLevel.forEach(([id, q]) => {
    const s = getService(id)!;
    const d = mustDestination(days[0]?.destId ?? c.destIds[0]);
    const amt = s.baseINR * priceLevel(d) * q;
    if (daily[0]) { daily[0].parts.services += amt; daily[0].total += amt; }
    lines.services.push(`${s.name} × ${q}: ₹${Math.round(amt).toLocaleString('en-IN')}`);
  });

  const sums = zero();
  daily.forEach((dc) => (Object.keys(sums) as CategoryKey[]).forEach((k) => (sums[k] += dc.parts[k])));

  // Applicable fees (company service fee). Taxes are not invented — see exclusions.
  const preFees = Object.values(sums).reduce((a, b) => a + b, 0);
  sums.fees = (preFees * COMPANY.serviceFeePct) / 100;
  lines.fees.push(`${COMPANY.name} service fee: ${COMPANY.serviceFeePct}% (demo setting)`);
  lines.fees.push('Government taxes, visa and permit fees: not estimated — they vary by supplier and nationality.');

  lines.accommodation.push(`${nights} night${nights === 1 ? '' : 's'} × ${c.rooms} room${c.rooms === 1 ? '' : 's'} (${c.tier})`);
  const extraAdults = Math.max(0, c.adults - c.rooms * 2);
  if (extraAdults) lines.accommodation.push(`${extraAdults} extra adult bed(s) at 25% of the room rate`);
  lines.accommodation.push('Season factor: ×1.1 in recommended months, ×0.9 otherwise');
  lines.localTravel.push(
    bike ? `Motorbike rental ₹${RATES.bikeRentalPerDay.toLocaleString('en-IN')}/day per bike (2 riders) + local fuel`
    : selfDrive ? `Self-drive rental ₹${RATES.selfDriveRentalPerDay.toLocaleString('en-IN')}/day/vehicle + local fuel`
      : c.localTransport === 'private' ? `${veh.count} × ${veh.kind} with driver per day (scaled by time at destination)`
      : c.localTransport === 'public' ? 'Public transport & app cabs per person per day'
      : 'Mix of private car and public transport',
  );
  lines.meals.push(`${c.mealPlan === 'local' ? 'Local eateries' : c.mealPlan === 'fine' ? 'Fine dining' : 'Mixed dining'} (×${MEAL_PLAN_FACTOR[c.mealPlan]}), children at ${CHILD_FACTOR.meals * 100}%`);
  lines.activities.push(`Scheduled activities × travellers; children at ${CHILD_FACTOR.activities * 100}%`);
  if (c.guide !== 'none') lines.guides.push(`${c.guide === 'half' ? 'Half-day' : 'Full-day'} local guide on sightseeing days`);

  const categories = (Object.keys(CATEGORY_LABELS) as CategoryKey[]).map((key) => ({
    key, label: CATEGORY_LABELS[key], amount: Math.round(sums[key]),
    low: Math.round(sums[key] * RANGE[key][0]), high: Math.round(sums[key] * RANGE[key][1]), lines: lines[key],
  }));
  const subtotal = categories.reduce((a, b) => a + b.amount, 0);
  const contingency = Math.round((subtotal * c.contingencyPct) / 100);
  const total = subtotal + contingency;
  const low = categories.reduce((a, b) => a + b.low, 0);
  const high = Math.round(categories.reduce((a, b) => a + b.high, 0) * (1 + c.contingencyPct / 100));

  const dep = getDeparture(c.departureId);
  const destNames = [...new Set(days.map((d) => mustDestination(d.destId).name))];
  const inclusions = [
    'Return main transport from ' + dep.name + ' (as selected)',
    `${nights} night${nights === 1 ? '' : 's'} of ${c.tier} accommodation, ${c.rooms} room${c.rooms === 1 ? '' : 's'}`,
    'Local travel on each day',
    'Breakfast, lunch and dinner estimates (as scheduled)',
    'Entry tickets and activities shown in the itinerary',
    ...(c.guide !== 'none' ? ['Local guide on sightseeing days'] : []),
    ...(Object.keys(c.services).length ? ['Selected optional services'] : []),
  ];
  const exclusions = [
    'Government taxes and supplier service charges',
    'Visas, permits, travel insurance and vaccinations',
    'Personal shopping, tips and alcohol',
    'Price changes, surge pricing and peak-date premiums beyond the season factor',
    'Anything not shown in the itinerary',
  ];
  const assumptions = [
    `${c.adults} adult${c.adults === 1 ? '' : 's'}${c.children ? ` + ${c.children} child${c.children === 1 ? '' : 'ren'}` : ''}, ${c.rooms} room${c.rooms === 1 ? '' : 's'}; ${destNames.join(', ')}.`,
    `${c.days} day${c.days === 1 ? '' : 's'} · ${nights} night${nights === 1 ? '' : 's'} · ${PACE[c.pacing].label.toLowerCase()} pacing · travel month ${month}.`,
    'Flights: base fare + per-km rate by class; children at 75%. Trains by km and class; children at 50%. Private cars by vehicle-km.',
    'Destination price levels are illustrative multipliers of an Indian baseline.',
    'Entry costs use Indian-resident rates where relevant; foreign nationals may pay more.',
    'Display-currency conversions use editable reference rates, not live exchange rates.',
    `Contingency allowance: ${c.contingencyPct}% of the subtotal.`,
  ];

  return {
    categories, subtotal, contingency, total, low, high, perPerson: Math.round(total / Math.max(1, pax)),
    travellers: pax, nights, daily: daily.map((d) => ({ ...d, total: Math.round(d.total) })), inclusions, exclusions, assumptions, basis: PRICING_BASIS,
  };
}
