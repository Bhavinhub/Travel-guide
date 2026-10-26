import type { Attraction, Destination } from '../data/types';
import { getDeparture, mustDestination } from '../data/catalog';
import { getService } from '../data/services';
import { chooseLeg, costForParty, destPoint, legOptions, vehiclesFor, type LegOption, type Point } from './geo';
import { addDaysISO, approxSun, fmtDate, fmtDur, fmtTime, tzAbbrev, tzOffsetMin } from './time';
import { uid, type DayPlan, type Pacing, type PlanItem, type TripConfig } from './trip';

export const PACE: Record<Pacing, { start: number; acts: number; minutes: number; rest: number; endLimit: number; label: string }> = {
  relaxed: { start: 9 * 60, acts: 2, minutes: 330, rest: 90, endLimit: 22 * 60, label: 'Relaxed' },
  balanced: { start: 8 * 60 + 30, acts: 3, minutes: 450, rest: 45, endLimit: 23 * 60, label: 'Balanced' },
  busy: { start: 7 * 60 + 30, acts: 4, minutes: 570, rest: 20, endLimit: 23 * 60 + 30, label: 'Busy' },
};

const MEAL_SPLIT = { breakfast: 0.2, lunch: 0.35, dinner: 0.45 };
export const MEAL_PLAN_FACTOR = { local: 0.7, mixed: 1, fine: 1.7 };

/** Destination price level relative to India baseline (used to scale services/guides). */
export const priceLevel = (d: Destination) => Math.min(4.5, Math.max(0.8, d.cost.mealsPerPerson.comfortable / 1300));

export const people = (c: TripConfig) => c.adults + c.children;

/** Split total days across destinations, weighted by each destination's ideal stay. */
export function allocateDays(c: TripConfig): string[] {
  const dests = c.destIds.slice(0, Math.max(1, c.days)).map(mustDestination);
  const alloc = dests.map(() => 1);
  let remaining = c.days - dests.length;
  while (remaining > 0) {
    let best = 0;
    let bestScore = -Infinity;
    dests.forEach((d, i) => {
      const s = (d.days[1] - alloc[i]) / d.days[1];
      if (s > bestScore) { bestScore = s; best = i; }
    });
    alloc[best] += 1;
    remaining -= 1;
  }
  const out: string[] = [];
  dests.forEach((d, i) => { for (let k = 0; k < alloc[i]; k++) out.push(d.id); });
  return out;
}

function depPoint(c: TripConfig): Point {
  const d = getDeparture(c.departureId);
  return { name: d.name, lat: d.lat, lon: d.lon, tz: d.tz, country: d.country, hasRail: d.hasRail };
}

export interface LegPlan {
  from: string;
  to: string;
  leg?: LegOption;
  options: LegOption[];
  fallback: boolean;
  cost: number;
}

export function planLeg(c: TripConfig, from: Point, to: Destination): LegPlan {
  const options = legOptions(from, destPoint(to), to, c.travelClass, people(c));
  const { leg, fallback } = chooseLeg(options, c.transport, c.transportType);
  return { from: from.name, to: to.name, leg, options, fallback, cost: leg ? costForParty(leg, c.adults, c.children) : 0 };
}

/** Return leg mirrors the outbound options from home to the final destination. */
export function planReturn(c: TripConfig, last: Destination): LegPlan {
  const p = planLeg(c, depPoint(c), last);
  return { ...p, from: last.name, to: getDeparture(c.departureId).name };
}

function scoreAttraction(a: Attraction, c: TripConfig, destId: string, mustKeys: Set<string>) {
  const key = `${destId}:${a.id}`;
  if (mustKeys.has(key)) return 1000;
  let s = 1;
  const I = c.interests;
  const k = a.kind ?? 'sight';
  if (k === 'adventure' && !c.includeAdventure) return -1;
  if (k === 'adventure') s += 3;
  if (k === 'nature' && (I.includes('nature') || I.includes('mountains') || I.includes('beaches'))) s += 3;
  if (k === 'sight' && I.includes('culture')) s += 3;
  if (k === 'food' && I.includes('food')) s += 3;
  if (k === 'wellness') s += I.includes('wellness') ? 3 : -1.5;
  if (k === 'nightlife') s += I.includes('nightlife') ? 3 : -2;
  if (k === 'shopping') s -= 0.5;
  if (a.slot === 'sunset') s += I.includes('romance') ? 2 : 0.8;
  if (a.durationMin >= 360) s -= 1.2;
  return s;
}

const SLOT_RANK: Record<string, number> = { morning: 0, midday: 1, any: 1.5, afternoon: 2, sunset: 3, evening: 4 };
const SLOT_EARLIEST: Record<string, number> = { midday: 11 * 60, afternoon: 14 * 60, sunset: 16 * 60 + 30, evening: 18 * 60 };
const isSunrise = (a: { title?: string; name?: string }) => /sunrise/i.test(a.title ?? a.name ?? '');

export function attractionItem(d: Destination, a: Attraction, locked = false): PlanItem {
  return {
    uid: uid(), type: 'activity', title: a.name, durationMin: a.durationMin, location: `${a.name}, ${d.name}`,
    destId: d.id, costPP: a.costINR, attractionId: a.id, slot: isSunrise(a) ? 'sunrise' : a.slot, indoor: a.indoor,
    daylight: a.daylight, note: a.note, locked, costCategory: 'activities',
    transport: a.transferMin && a.transferMin >= 60 ? 'Day excursion by road' : undefined,
  };
}

function mealItem(d: Destination, c: TripConfig, kind: 'breakfast' | 'lunch' | 'dinner'): PlanItem {
  const pp = d.cost.mealsPerPerson[c.tier] * MEAL_PLAN_FACTOR[c.mealPlan] * MEAL_SPLIT[kind];
  const pref = c.mealPref !== 'any' ? ` · ${c.mealPref} options requested` : '';
  const label = { breakfast: 'Breakfast', lunch: 'Lunch break', dinner: 'Dinner' }[kind];
  return {
    uid: uid(), type: 'meal', title: label, durationMin: kind === 'breakfast' ? 45 : kind === 'lunch' ? 60 : 90,
    location: kind === 'breakfast' ? 'Hotel / nearby café' : `Local restaurant, ${d.name}`, destId: d.id,
    costPP: Math.round(pp), notBefore: kind === 'lunch' ? 12 * 60 + 30 : kind === 'dinner' ? 19 * 60 + 30 : undefined,
    note: (kind === 'breakfast' && (c.tier === 'premium' || c.tier === 'luxury') ? 'Often included in the room rate — check when booking.' : '') + pref,
    slot: kind, costCategory: 'meals',
  };
}

const restItem = (d: Destination, min: number): PlanItem => ({
  uid: uid(), type: 'rest', title: 'Rest & recharge', durationMin: min, location: 'Hotel', destId: d.id, costPP: 0, optional: true,
  note: 'Downtime to keep the pace comfortable.',
});

function serviceItem(c: TripConfig, d: Destination, id: string): PlanItem | null {
  const s = getService(id);
  if (!s) return null;
  if (s.id === 'cruise' && !(d.romanceExtras ?? []).includes('cruise')) return null;
  const price = Math.round(s.baseINR * priceLevel(d));
  const couples = Math.max(1, Math.floor(c.adults / 2));
  const base: PlanItem = {
    uid: uid(), type: 'service', title: s.name, durationMin: 90, location: d.name, destId: d.id, costPP: 0,
    serviceId: s.id, costCategory: 'services', optional: true,
  };
  if (s.basis === 'per-person') base.costPP = price;
  else if (s.basis === 'per-couple') base.groupCost = price * couples;
  else if (s.basis === 'per-group') base.groupCost = price * vehiclesFor(people(c)).count;
  else base.groupCost = price;
  switch (s.id) {
    case 'candlelight': return { ...base, durationMin: 120, notBefore: 19 * 60 + 30, slot: 'evening', location: `Private dining set-up, ${d.name}` };
    case 'spa': return { ...base, durationMin: 120, notBefore: 14 * 60 + 30, slot: 'afternoon', indoor: true };
    case 'cruise': return { ...base, durationMin: 120, slot: 'sunset', location: `Waterfront, ${d.name}` };
    case 'photo': return { ...base, durationMin: 120, slot: 'morning', daylight: true };
    case 'decor': return { ...base, durationMin: 15, location: 'Your room', note: 'Arranged before arrival.' };
    case 'spa-pp': return { ...base, durationMin: 90, notBefore: 15 * 60, slot: 'afternoon', indoor: true };
    case 'yoga': return { ...base, durationMin: 60, slot: 'morning' };
    case 'ayurveda': return { ...base, durationMin: 150, notBefore: 14 * 60 + 30, slot: 'afternoon', indoor: true };
    case 'night-out': return { ...base, durationMin: 150, notBefore: 21 * 60 + 15, slot: 'late', note: 'Venue hours, entry rules and age limits must be confirmed locally.' };
    case 'night-return': return { ...base, durationMin: 30, slot: 'late', transport: 'Pre-booked cab', location: 'Back to hotel' };
    default: return base;
  }
}

/** Order items within a day by slot, inserting meals and rest around realistic times. */
function composeDay(
  acts: PlanItem[], d: Destination, c: TripConfig,
  opts: { breakfast: boolean; lunch: boolean; dinner: boolean; rest: boolean; startAt: number },
) {
  const rank = (i: PlanItem) => (i.slot === 'sunrise' ? -1 : i.slot === 'late' ? 6 : SLOT_RANK[i.slot ?? 'any'] ?? 1.5);
  const sorted = [...acts].sort((a, b) => rank(a) - rank(b));
  const out: PlanItem[] = [];
  const sunrise = sorted.filter((i) => i.slot === 'sunrise');
  const yoga = sorted.filter((i) => i.serviceId === 'yoga');
  out.push(...sunrise, ...yoga);
  if (opts.breakfast) out.push(mealItem(d, c, 'breakfast'));
  const rest = sorted.filter((i) => !sunrise.includes(i) && !yoga.includes(i));
  const amCand = rest.filter((i) => rank(i) <= 1.5);
  const pmCand = rest.filter((i) => rank(i) > 1.5 && rank(i) < 4);
  const eve = rest.filter((i) => rank(i) >= 4 && rank(i) < 6);
  const late = rest.filter((i) => rank(i) >= 6);
  // Fill the morning until roughly lunchtime; overflow moves to the afternoon.
  let t = opts.startAt + out.reduce((a, b) => a + b.durationMin, 0);
  const am: PlanItem[] = [];
  const overflow: PlanItem[] = [];
  amCand.forEach((i) => {
    const tr = (i.transport ? 60 : 20);
    if (t + i.durationMin + tr <= 13 * 60 + 30 || (!am.length && t < 10 * 60 + 30) || !opts.lunch) { am.push(i); t += i.durationMin + tr; }
    else overflow.push(i);
  });
  out.push(...am);
  const longAm = am.find((i) => i.durationMin >= 300);
  if (opts.lunch && longAm) {
    const idx = out.indexOf(longAm);
    out.splice(idx + 1, 0, { ...mealItem(d, c, 'lunch'), title: 'Lunch stop during the excursion', during: true, notBefore: undefined, durationMin: 45 });
  } else if (opts.lunch) out.push(mealItem(d, c, 'lunch'));
  const pm = [...overflow, ...pmCand];
  if (opts.rest && PACE[c.pacing].rest > 0 && pm.length + eve.length > 0) out.push(restItem(d, PACE[c.pacing].rest));
  out.push(...pm);
  const dinnerReplaced = eve.some((i) => i.serviceId === 'candlelight' || (i.type === 'activity' && /dinner|food|thali|kitchen|wazwan|seafood/i.test(i.title)));
  out.push(...eve.filter((i) => i.serviceId !== 'candlelight'));
  if (opts.dinner && !dinnerReplaced) out.push(mealItem(d, c, 'dinner'));
  out.push(...eve.filter((i) => i.serviceId === 'candlelight'));
  out.push(...late);
  return out;
}

export interface GeneratedTrip {
  days: DayPlan[];
  outbound?: LegPlan;
  inbound?: LegPlan;
  warnings: string[];
}

export function generateItinerary(c: TripConfig, keepLocked: PlanItem[] = []): GeneratedTrip {
  const warnings: string[] = [];
  const order = allocateDays(c);
  if (c.destIds.length > order.length) warnings.push('Some destinations were left out — add days to include them all.');
  const P = PACE[c.pacing];
  const home = depPoint(c);
  const mustKeys = new Set([...c.mustSee, ...keepLocked.filter((i) => i.attractionId).map((i) => `${i.destId}:${i.attractionId}`)]);
  const lockedKeys = new Set(keepLocked.filter((i) => i.attractionId).map((i) => `${i.destId}:${i.attractionId}`));

  // Activity queues per destination.
  const queues = new Map<string, Attraction[]>();
  [...new Set(order)].forEach((id) => {
    const d = mustDestination(id);
    const q = d.attractions
      .map((a, idx) => ({ a, s: scoreAttraction(a, c, id, mustKeys), idx }))
      .filter((x) => x.s >= 0)
      .sort((x, y) => y.s - x.s || x.idx - y.idx)
      .map((x) => x.a);
    queues.set(id, q);
  });

  const first = mustDestination(order[0]);
  const last = mustDestination(order[order.length - 1]);
  const sameCity = getDeparture(c.departureId).name === first.name || c.departureId === first.id;
  const outbound = sameCity ? undefined : planLeg(c, home, first);
  const inbound = sameCity ? undefined : planReturn(c, last);
  if (outbound && !outbound.leg) warnings.push(`No practical transport option found to ${first.name}.`);
  if (outbound?.fallback && outbound.leg && outbound.leg.mode !== c.transport) {
    const want = c.transport !== 'auto' ? c.transport.replace('-', ' ') : `${c.transportType} transport`;
    warnings.push(`${want[0].toUpperCase()}${want.slice(1)} isn’t practical to ${first.name}; using ${outbound.leg.label.toLowerCase()} instead.`);
  }

  const services: string[] = [];
  Object.entries(c.services).forEach(([id, q]) => { for (let i = 0; i < q; i++) services.push(id); });

  const days: DayPlan[] = [];
  const startTzDest = tzOffsetMin(first.tz, c.startDate);
  const startTzHome = tzOffsetMin(home.tz, c.startDate);

  // Outbound timing (destination-local minutes relative to Day 1 midnight).
  let arrivalAbs = 14 * 60; // staycation check-in
  let departAbsHome = 0;
  let overnightOut = false;
  if (outbound?.leg) {
    const L = outbound.leg;
    if (L.mode === 'flight') departAbsHome = 7 * 60 + 30;
    else if (L.durationMin > 8 * 60) { departAbsHome = 20 * 60 - 1440; overnightOut = true; }
    else departAbsHome = 6 * 60 + 30;
    arrivalAbs = departAbsHome + (startTzDest - startTzHome) + L.durationMin;
    if (L.mode === 'flight' && arrivalAbs > 21 * 60 && arrivalAbs < 1440 && L.durationMin < 600) {
      departAbsHome = 6 * 60;
      arrivalAbs = departAbsHome + (startTzDest - startTzHome) + L.durationMin;
    }
  }
  const arrivalDay = Math.max(0, Math.floor(arrivalAbs / 1440));
  const arrivalMin = arrivalAbs - arrivalDay * 1440;

  for (let i = 0; i < c.days; i++) {
    const destId = order[Math.min(i, order.length - 1)];
    const d = mustDestination(destId);
    const date = addDaysISO(c.startDate, i);
    const items: PlanItem[] = [];
    let dayStart = P.start;
    let presence = 1;
    const isLast = i === c.days - 1;
    const prevDest = i > 0 ? order[i - 1] : null;
    const newDest = i > 0 && prevDest !== destId;
    let title = d.name;
    let windowStart = P.start;
    let windowEnd = 21 * 60;
    let allowBreakfast = true;
    let allowLunch = true;
    let allowDinner = true;
    let allowRest = true;

    // —— Arrival logic ——
    if (i < arrivalDay && outbound?.leg) {
      const depLocal = departAbsHome + (startTzDest - startTzHome) - i * 1440;
      const st = Math.max(0, depLocal);
      items.push(transitItem(outbound, d, st, 1440 - st, `Depart ${home.name} ${depLocal >= 0 ? `at ${fmtTime(departAbsHome)} ${tzAbbrev(home.tz, c.startDate)}` : ''}`, true));
      days.push({ index: i, date, destId, title: 'In transit', dayStart: st, items, overnight: false, presence: 0 });
      continue;
    }
    if (i === arrivalDay) {
      if (outbound?.leg) {
        const L = outbound.leg;
        const st = Math.max(0, arrivalMin - L.durationMin);
        const depDate = overnightOut ? addDaysISO(c.startDate, -1) : c.startDate;
        const label = `${L.label}: ${home.name} → ${d.name}`;
        const it = transitItem(outbound, d, st, arrivalMin - st, label, false);
        it.note = `Departs ${home.name} ${fmtDate(depDate)} ${fmtTime(departAbsHome < 0 ? departAbsHome + 1440 : departAbsHome)} ${tzAbbrev(home.tz, depDate)} · arrives ${fmtTime(arrivalMin)} ${tzAbbrev(d.tz, date)} (${fmtDur(L.durationMin)} journey). ${L.notes.join(' ')}`;
        items.push(it);
        dayStart = st;
        title = `Arrive in ${d.name}`;
      } else {
        dayStart = 13 * 60;
        title = `Staycation in ${d.name}`;
      }
      items.push({
        uid: uid(), type: 'checkin', title: 'Transfer to hotel & check-in', durationMin: outbound?.leg?.mode === 'flight' && !outbound.leg.gateway ? 60 : 30,
        location: `Hotel, ${d.name}`, destId, costPP: 0, note: 'Standard check-in is often from 14:00; early check-in is on request.', costCategory: 'localTravel',
      });
      if (services.includes('decor')) {
        const s = serviceItem(c, d, 'decor');
        if (s) { items.push(s); services.splice(services.indexOf('decor'), 1); }
      }
      const after = items.reduce((t, x) => (x.type === 'transit' ? arrivalMin : t + x.durationMin), dayStart);
      windowStart = after;
      allowBreakfast = after < 10 * 60;
      allowLunch = after < 14 * 60;
      allowRest = after < 15 * 60;
      allowDinner = after < 22 * 60;
      presence = Math.max(0.25, Math.min(1, (22 * 60 - after) / (14 * 60)));
      if (c.days === 1) windowEnd = 16 * 60;
    } else if (newDest) {
      const from = mustDestination(prevDest!);
      const leg = planLeg({ ...c, transport: c.transport === 'flight' || c.transport === 'helicopter' ? c.transport : 'auto' }, destPoint(from), d);
      items.push({
        uid: uid(), type: 'checkout', title: `Check out in ${from.name}`, durationMin: 30, location: `Hotel, ${from.name}`, destId: from.id, costPP: 0,
      });
      if (leg.leg) {
        const it = transitItem(leg, d, 0, leg.leg.durationMin, `${leg.leg.label}: ${from.name} → ${d.name}`, false);
        it.fixedStart = undefined;
        items.push(it);
      }
      items.push({ uid: uid(), type: 'checkin', title: 'Check-in', durationMin: 30, location: `Hotel, ${d.name}`, destId, costPP: 0, costCategory: 'localTravel' });
      dayStart = 8 * 60;
      items.unshift(mealItem(d, c, 'breakfast'));
      allowBreakfast = false;
      const after = dayStart + items.reduce((t, x) => t + x.durationMin, 0);
      windowStart = after;
      allowLunch = after < 14 * 60;
      allowRest = after < 15 * 60;
      presence = Math.max(0.3, Math.min(1, (22 * 60 - after) / (14 * 60)));
      title = `${from.name} → ${d.name}`;
    }

    // —— Departure-day limits ——
    let returnBlock: PlanItem[] = [];
    if (isLast && inbound?.leg) {
      const L = inbound.leg;
      const offDest = tzOffsetMin(d.tz, date);
      let dep: number;
      if (L.mode === 'flight') dep = L.durationMin > 360 ? 21 * 60 + 30 : 17 * 60;
      else if (L.durationMin > 8 * 60) dep = 19 * 60 + 30;
      else dep = c.days === 1 ? Math.max(16 * 60, Math.min(18 * 60, 22 * 60 - L.durationMin)) : L.durationMin > 6 * 60 ? 12 * 60 : 16 * 60;
      const buffer = L.mode === 'flight' ? (L.gateway ? 0 : 150) : 45;
      const toHub = L.mode === 'flight' ? (L.gateway ? L.gateway.minutes : 45) : 20;
      const homeArr = dep + L.durationMin - (L.gateway && L.mode === 'flight' ? L.gateway.minutes : 0) + (tzOffsetMin(home.tz, date) - offDest);
      const transfer: PlanItem = {
        uid: uid(), type: 'transit', title: L.mode === 'flight' ? (L.gateway ? `Transfer by ${L.gateway.mode} to ${L.gateway.name}` : 'Transfer to airport') : L.mode === 'car' || L.mode === 'self-drive' ? 'Load up & set off' : 'Transfer to station',
        durationMin: L.mode === 'car' || L.mode === 'self-drive' ? 15 : toHub, location: d.name, destId, costPP: 0,
        fixedStart: dep - buffer - (L.mode === 'car' || L.mode === 'self-drive' ? 15 : toHub), costCategory: 'localTravel',
        note: L.mode === 'flight' ? 'Arrive ~2–3 h before departure.' : undefined,
      };
      const flightOnly = L.mode === 'flight' && L.gateway ? L.durationMin - L.gateway.minutes : L.durationMin;
      const ret: PlanItem = {
        uid: uid(), type: 'transit', title: `${L.mode === 'flight' ? 'Flight' : L.label} home to ${home.name}`, durationMin: flightOnly,
        location: `${d.name} → ${home.name}`, destId, costPP: 0, groupCost: inbound.cost, fixedStart: dep, costCategory: 'mainTransport',
        note: `Arrives ${home.name} ~${fmtTime(homeArr)} ${tzAbbrev(home.tz, date)}${homeArr >= 1440 ? ' (next day)' : ''}. Illustrative timing — real schedules vary.`,
        transport: L.label,
      };
      returnBlock = [transfer, ret];
      windowEnd = Math.min(windowEnd, transfer.fixedStart! - 30);
      if (c.days > 1) {
        returnBlock.unshift({
          uid: uid(), type: 'checkout', title: 'Check out & store luggage', durationMin: 30, location: `Hotel, ${d.name}`, destId, costPP: 0,
        });
      }
      allowDinner = dep > 21 * 60 + 30;
      allowLunch = allowLunch && transfer.fixedStart! >= 14 * 60;
      allowRest = false;
      presence = Math.min(presence, Math.max(0.3, (dep - P.start) / (14 * 60)));
      if (!(i === arrivalDay)) title = `Last morning in ${d.name}`;
    } else if (isLast && !inbound?.leg && c.days > 1) {
      returnBlock = [{ uid: uid(), type: 'checkout', title: 'Check out', durationMin: 30, location: `Hotel, ${d.name}`, destId, costPP: 0 }];
    }

    // —— Choose activities that fit the window ——
    const q = queues.get(destId)!;
    const available = Math.max(0, windowEnd - windowStart - (allowLunch ? 60 : 0) - (allowRest ? P.rest : 0));
    let budgetMin = Math.min(P.minutes, available);
    let maxActs = i === arrivalDay || newDest ? Math.max(1, P.acts - 1) : P.acts;
    if (isLast && inbound?.leg) maxActs = Math.min(maxActs, budgetMin > 200 ? 2 : budgetMin > 90 ? 1 : 0);
    if (budgetMin < 60) maxActs = 0;
    const chosen: PlanItem[] = [];
    const slotsUsed = new Set<string>();
    // —— Place optional services on suitable days ——
    const middle = !(i === arrivalDay) && !isLast;
    const takeService = (id: string, cond: boolean) => {
      const idx = services.indexOf(id);
      if (idx < 0 || !cond) return;
      const s = serviceItem(c, d, id);
      if (!s) { services.splice(idx, 1); warnings.push(`${getService(id)?.name} isn’t offered in ${d.name}; it was not added.`); return; }
      services.splice(idx, 1);
      chosen.push(s);
      if (s.slot === 'sunset' || s.slot === 'evening') slotsUsed.add(s.slot);
      if (s.slot !== 'late') budgetMin -= s.durationMin + 15;
    };
    const remainingDays = c.days - i;
    const force = remainingDays <= 2;
    takeService('photo', middle || (force && !isLast));
    takeService('cruise', (middle || force) && !(isLast && inbound?.leg));
    takeService('spa', middle || (force && !isLast));
    takeService('candlelight', (middle || force) && !(isLast && inbound?.leg && !allowDinner));
    takeService('spa-pp', middle || force);
    takeService('ayurveda', middle || (force && !isLast));
    takeService('yoga', !(i === arrivalDay) || force);
    if (allowDinner || middle) {
      takeService('night-out', middle || (force && !isLast));
      if (chosen.some((x) => x.serviceId === 'night-out')) takeService('night-return', true);
    }

    let actCount = 0;
    let morningUsed = 0;
    for (let k = 0; k < q.length && actCount < maxActs && budgetMin > 45; k++) {
      const a = q[k];
      const long = a.durationMin + 2 * (a.transferMin ?? 20) > 300;
      if (a.durationMin + (a.transferMin ?? 20) > budgetMin) continue;
      if ((a.slot === 'evening' || a.slot === 'sunset') && slotsUsed.has(a.slot)) continue;
      if (long && chosen.some((x) => (x.durationMin ?? 0) > 240)) continue;
      if (isLast && inbound?.leg && (a.slot === 'evening' || a.slot === 'sunset')) continue;
      if (i === arrivalDay && /sunrise/i.test(a.name)) continue;
      if (windowStart > 11 * 60 + 30 && a.slot === 'morning') continue;
      const earliest = Math.max(windowStart, SLOT_EARLIEST[a.slot] ?? 0);
      if (earliest + a.durationMin > windowEnd + 30 && a.slot !== 'evening') continue;
      if (a.slot === 'morning' && morningUsed > 0 && morningUsed + a.durationMin + (a.transferMin ?? 20) > 300) continue;
      if (a.slot === 'morning') morningUsed += a.durationMin + (a.transferMin ?? 20);
      q.splice(k, 1);
      k--;
      slotsUsed.add(a.slot);
      chosen.push(attractionItem(d, a, lockedKeys.has(`${destId}:${a.id}`)));
      actCount += 1;
      budgetMin -= a.durationMin + (a.transferMin ?? 20);
    }

    const body = composeDay(chosen, d, c, { breakfast: allowBreakfast && !newDest, lunch: allowLunch, dinner: allowDinner, rest: allowRest, startAt: windowStart });
    // Day starts earlier for sunrise activities.
    if (!items.length && body[0]?.slot === 'sunrise') {
      const sun = approxSun(d.lat, d.lon, date, tzOffsetMin(d.tz, date));
      const a = d.attractions.find((x) => x.id === body[0].attractionId);
      dayStart = Math.round(sun.sunrise - 30 - (a?.transferMin ?? 20));
    }
    const checkout = returnBlock.find((x) => x.type === 'checkout');
    if (checkout && c.days > 1) {
      const bi = body.findIndex((x) => x.type === 'meal' && x.slot === 'breakfast');
      body.splice(bi + 1, 0, checkout);
      returnBlock = returnBlock.filter((x) => x !== checkout);
    }
    const all = [...items, ...body, ...returnBlock];
    days.push({ index: i, date, destId, title, dayStart, items: all, overnight: !isLast, presence });
  }

  if (services.length) {
    const left = [...new Set(services)].map((s) => getService(s)?.name).filter(Boolean);
    if (left.length) warnings.push(`Not enough suitable days to schedule: ${left.join(', ')}. Add days or reduce quantities.`);
  }
  if (inbound && !inbound.leg && c.days > 1) warnings.push('No practical return transport found.');
  return { days, outbound, inbound, warnings };
}

function transitItem(lp: LegPlan, d: Destination, start: number, dur: number, title: string, inTransitOnly: boolean): PlanItem {
  return {
    uid: uid(), type: 'transit', title, durationMin: Math.max(0, dur), location: `${lp.from} → ${lp.to}`, destId: d.id, costPP: 0,
    groupCost: inTransitOnly ? 0 : lp.cost, fixedStart: start, costCategory: 'mainTransport', transport: lp.leg?.label,
    note: lp.leg?.notes.join(' '),
  };
}

/* ——————————————————— Layout & conflict detection ——————————————————— */

export interface LayoutRow {
  item: PlanItem;
  start: number;
  end: number;
  transferBefore: number;
  freeBefore: number;
  issues: { level: 'conflict' | 'hint'; text: string }[];
}
export interface DayLayout {
  rows: LayoutRow[];
  end: number;
  activeMin: number;
  sunrise: number;
  sunset: number;
  issues: { level: 'conflict' | 'hint'; text: string }[];
}

function itemPos(item: PlanItem): number | null {
  if (item.type === 'meal') return null; // eat near where you are
  if (item.type === 'activity' && item.attractionId) {
    const d = mustDestination(item.destId);
    return d.attractions.find((a) => a.id === item.attractionId)?.transferMin ?? 20;
  }
  if (item.type === 'service') return item.slot === 'late' ? 10 : 15;
  return 0;
}

export function transferMinutes(a: number, b: number) {
  if (a === 0 && b === 0) return 0;
  if (a === b) return 10;
  return Math.min(a + b, Math.max(10, Math.abs(a - b) + 15));
}

export function layoutDay(day: DayPlan, c: TripConfig): DayLayout {
  const d = mustDestination(day.destId);
  const P = PACE[c.pacing];
  const off = tzOffsetMin(d.tz, day.date);
  const sun = approxSun(d.lat, d.lon, day.date, off);
  const rows: LayoutRow[] = [];
  const issues: DayLayout['issues'] = [];
  let cursor = day.dayStart;
  let pos = 0;
  let active = 0;
  day.items.forEach((item, idx) => {
    const p = itemPos(item);
    const transfer = item.type === 'transit' || item.type === 'checkin' || item.type === 'checkout' ? (idx > 0 && pos > 0 ? Math.min(pos, 45) : 0) : p === null ? 0 : transferMinutes(pos, p);
    cursor += transfer;
    const rowIssues: LayoutRow['issues'] = [];
    if (item.during && rows.length) {
      const prev = rows[rows.length - 1];
      const st = prev.start + Math.max(0, Math.round((prev.end - prev.start) / 2) - 20);
      rows.push({ item, start: st, end: st + item.durationMin, transferBefore: 0, freeBefore: 0, issues: [] });
      cursor -= transfer;
      return;
    }
    let start = cursor;
    let notBefore = item.notBefore;
    if (notBefore === undefined && item.type === 'activity') {
      if (item.slot === 'midday') notBefore = 11 * 60;
      if (item.slot === 'afternoon') notBefore = 14 * 60;
      if (item.slot === 'sunset') notBefore = Math.round(sun.sunset - item.durationMin / 2 - 30);
      if (item.slot === 'evening') notBefore = 18 * 60;
    }
    if (item.type === 'service' && item.slot === 'sunset') notBefore = Math.round(sun.sunset - 75);
    if (item.fixedStart !== undefined) {
      if (item.fixedStart >= cursor || idx === 0) start = item.fixedStart;
      else rowIssues.push({ level: 'conflict', text: `Needs to start at ${fmtTime(item.fixedStart)}, but earlier plans run until ${fmtTime(cursor)}. Remove or shorten something before it.` });
    } else if (notBefore !== undefined && cursor < notBefore) {
      start = notBefore;
    }
    const freeBefore = Math.max(0, start - cursor);
    const end = start + item.durationMin;
    if (item.daylight && end > sun.sunset + (item.slot === 'sunset' ? 50 : 20)) rowIssues.push({ level: 'conflict', text: `Ends after sunset (~${fmtTime(sun.sunset)}). Move it earlier in the day.` });
    if (item.slot === 'sunset' && Math.abs(start + item.durationMin / 2 - sun.sunset) > 90) rowIssues.push({ level: 'hint', text: `Best around sunset (~${fmtTime(sun.sunset)}).` });
    if (item.slot === 'morning' && item.type === 'activity' && start > 12 * 60 + 30) rowIssues.push({ level: 'hint', text: 'Best visited in the morning (cooler, quieter).' });
    if (item.slot === 'sunrise' && start > sun.sunrise + 60) rowIssues.push({ level: 'hint', text: `Sunrise is ~${fmtTime(sun.sunrise)} — move this to the start of the day.` });
    if (item.type === 'meal' && item.slot === 'lunch' && start > 15 * 60 + 15) rowIssues.push({ level: 'hint', text: 'Late lunch — consider moving an activity after it.' });
    if (item.type === 'checkout' && start > 12 * 60 + 15 && !rows.some((r) => r.item.type === 'transit')) rowIssues.push({ level: 'hint', text: 'Check-out after noon — request late check-out.' });
    if ((item.type === 'activity' || item.type === 'service') && item.slot !== 'late') active += item.durationMin + transfer;
    rows.push({ item, start, end, transferBefore: transfer, freeBefore, issues: rowIssues });
    cursor = end;
    if (p !== null) pos = item.type === 'transit' || item.type === 'checkin' || item.type === 'checkout' ? 0 : p;
  });
  const lastNonTransit = [...rows].reverse().find((r) => r.item.type !== 'transit' && r.item.slot !== 'late');
  const dayEnd = lastNonTransit?.end ?? cursor;
  if (dayEnd > P.endLimit && !rows.some((r) => r.item.type === 'transit' && r.item.fixedStart !== undefined && r.start > 20 * 60)) {
    issues.push({ level: 'conflict', text: `Long day — plans run until ${fmtTime(dayEnd)}. Remove an activity or switch to busier pacing.` });
  }
  if (active > P.minutes * 1.3) issues.push({ level: 'hint', text: `About ${fmtDur(active)} of sightseeing — heavy for ${P.label.toLowerCase()} pacing.` });
  rows.forEach((r) => issues.push(...r.issues));
  return { rows, end: cursor, activeMin: active, sunrise: sun.sunrise, sunset: sun.sunset, issues };
}

/* ——————————————————— Editing operations (pure) ——————————————————— */

const cloneDays = (days: DayPlan[]) => days.map((d) => ({ ...d, items: [...d.items] }));

export function moveItem(days: DayPlan[], dayIdx: number, itemUid: string, dir: -1 | 1) {
  const out = cloneDays(days);
  const items = out[dayIdx].items;
  const i = items.findIndex((x) => x.uid === itemUid);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= items.length) return days;
  [items[i], items[j]] = [items[j], items[i]];
  return out;
}

export function moveItemToDay(days: DayPlan[], fromDay: number, itemUid: string, toDay: number) {
  const out = cloneDays(days);
  const i = out[fromDay].items.findIndex((x) => x.uid === itemUid);
  if (i < 0 || !out[toDay]) return days;
  const [it] = out[fromDay].items.splice(i, 1);
  if (it.destId !== out[toDay].destId) return days;
  const t = out[toDay].items;
  const insertAt = Math.max(0, t.findIndex((x) => x.type === 'meal' && x.slot === 'dinner'));
  t.splice(insertAt || t.length, 0, it);
  return out;
}

export function removeItem(days: DayPlan[], dayIdx: number, itemUid: string) {
  const out = cloneDays(days);
  out[dayIdx].items = out[dayIdx].items.filter((x) => x.uid !== itemUid || x.locked);
  return out;
}

export function toggleLock(days: DayPlan[], dayIdx: number, itemUid: string) {
  const out = cloneDays(days);
  out[dayIdx].items = out[dayIdx].items.map((x) => (x.uid === itemUid ? { ...x, locked: !x.locked } : x));
  return out;
}

export function usedAttractionIds(days: DayPlan[], destId: string) {
  return new Set(days.flatMap((d) => d.items).filter((i) => i.destId === destId && i.attractionId).map((i) => i.attractionId!));
}

export function alternativesFor(days: DayPlan[], destId: string, opts: { indoorOnly?: boolean } = {}) {
  const d = mustDestination(destId);
  const used = usedAttractionIds(days, destId);
  return d.attractions.filter((a) => !used.has(a.id) && (!opts.indoorOnly || a.indoor));
}

export function swapItem(days: DayPlan[], dayIdx: number, itemUid: string, attractionId: string) {
  const out = cloneDays(days);
  const items = out[dayIdx].items;
  const i = items.findIndex((x) => x.uid === itemUid);
  if (i < 0) return days;
  const d = mustDestination(items[i].destId);
  const a = d.attractions.find((x) => x.id === attractionId);
  if (!a) return days;
  items[i] = attractionItem(d, a);
  return out;
}

export function addActivity(days: DayPlan[], dayIdx: number, attractionId: string) {
  const out = cloneDays(days);
  const day = out[dayIdx];
  const d = mustDestination(day.destId);
  const a = d.attractions.find((x) => x.id === attractionId);
  if (!a) return days;
  const it = attractionItem(d, a);
  it.optional = true;
  const rank = SLOT_RANK[a.slot] ?? 1.5;
  let at = day.items.findIndex((x) => {
    if (x.type === 'transit' && x.fixedStart !== undefined && x.fixedStart > 12 * 60) return true;
    if (x.type === 'checkout' && day.index === days.length - 1) return false;
    if (x.type === 'meal' && x.slot === 'lunch') return rank < 2;
    if (x.type === 'meal' && x.slot === 'dinner') return true;
    if (x.type === 'activity') return (SLOT_RANK[x.slot ?? 'any'] ?? 1.5) > rank;
    return false;
  });
  if (at < 0) at = day.items.length;
  day.items.splice(at, 0, it);
  return out;
}

/** Replace outdoor activities on a day with unused indoor ones (rainy-day plan). */
export function indoorDay(days: DayPlan[], dayIdx: number) {
  let out = cloneDays(days);
  const day = out[dayIdx];
  day.items.forEach((it) => {
    if (it.type === 'activity' && !it.indoor && !it.locked) {
      const alt = alternativesFor(out, day.destId, { indoorOnly: true })[0];
      if (alt) out = swapItem(out, dayIdx, it.uid, alt.id);
    }
  });
  return out;
}
