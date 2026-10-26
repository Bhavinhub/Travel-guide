import type { Attraction, BudgetTier, Destination } from './types';

export const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

/** Attraction builder: name, typical minutes, illustrative INR per person, preferred slot, extras. */
export function A(
  name: string,
  durationMin: number,
  costINR: number,
  slot: Attraction['slot'] = 'any',
  o: Partial<Attraction> = {},
): Attraction {
  return { id: slug(name), name, durationMin, costINR, slot, indoor: false, transferMin: 20, kind: 'sight', ...o };
}

/** Base illustrative India rates (INR). Destination multipliers scale these. */
const ROOM: Record<BudgetTier, number> = { budget: 1800, comfortable: 4500, premium: 9000, luxury: 22000 };
const MEAL: Record<BudgetTier, number> = { budget: 700, comfortable: 1300, premium: 2400, luxury: 4500 };

const round = (n: number) => Math.round(n / 50) * 50;

export function C(roomMult: number, mealMult: number, carPerDay: number, publicPerPerson: number): Destination['cost'] {
  const room = {} as Record<BudgetTier, number>;
  const mealsPerPerson = {} as Record<BudgetTier, number>;
  (Object.keys(ROOM) as BudgetTier[]).forEach((k) => {
    room[k] = round(ROOM[k] * roomMult);
    mealsPerPerson[k] = round(MEAL[k] * mealMult);
  });
  return { room, mealsPerPerson, localPerDay: carPerDay, publicPerPerson };
}

export const IN = { indoor: true } as const;
export const ADV = { kind: 'adventure', difficulty: 'moderate' } as const;
export const NAT = { kind: 'nature', daylight: true } as const;
export const FOOD = { kind: 'food' } as const;
export const NIGHT = { kind: 'nightlife' } as const;
export const WELL = { kind: 'wellness', indoor: true } as const;
