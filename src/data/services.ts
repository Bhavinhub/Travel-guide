/**
 * Optional services and their illustrative INR base prices. Prices are scaled by the
 * destination's meal-cost multiplier (a proxy for local price level) in the estimator.
 */
export interface ServiceItem {
  id: string;
  name: string;
  group: 'honeymoon' | 'wellness' | 'nightlife' | 'guide';
  basis: 'per-couple' | 'per-person' | 'per-group' | 'per-trip';
  baseINR: number;
  note?: string;
}

export const SERVICES: ServiceItem[] = [
  { id: 'candlelight', name: 'Candlelight dinner', group: 'honeymoon', basis: 'per-couple', baseINR: 6000 },
  { id: 'spa', name: 'Couple spa session', group: 'honeymoon', basis: 'per-couple', baseINR: 7000 },
  { id: 'transfers', name: 'Private airport/hotel transfers', group: 'honeymoon', basis: 'per-trip', baseINR: 4500 },
  { id: 'cruise', name: 'Sunset cruise', group: 'honeymoon', basis: 'per-couple', baseINR: 8000, note: 'Only where water cruises operate.' },
  { id: 'photo', name: 'Couple photography session', group: 'honeymoon', basis: 'per-couple', baseINR: 12000 },
  { id: 'decor', name: 'Room decoration', group: 'honeymoon', basis: 'per-trip', baseINR: 3500 },
  { id: 'spa-pp', name: 'Spa / massage session', group: 'wellness', basis: 'per-person', baseINR: 3500 },
  { id: 'yoga', name: 'Private yoga session', group: 'wellness', basis: 'per-person', baseINR: 1500 },
  { id: 'ayurveda', name: 'Ayurveda treatment day', group: 'wellness', basis: 'per-person', baseINR: 5000, note: 'Best suited to Kerala.' },
  { id: 'night-out', name: 'Curated nightlife evening', group: 'nightlife', basis: 'per-person', baseINR: 3500 },
  { id: 'night-return', name: 'Pre-booked late return cab', group: 'nightlife', basis: 'per-group', baseINR: 1200 },
];

export const getService = (id: string) => SERVICES.find((s) => s.id === id);

/** Local guide, per group per day (INR), India base; international scaled by price level. */
export const GUIDE_DAY_INR = { half: 1800, full: 3000 };

/** Display currencies. Rates are editable illustrative references, NOT live. INR per 1 unit. */
export const CURRENCIES = [
  { code: 'INR', symbol: '₹', inrPerUnit: 1 },
  { code: 'USD', symbol: '$', inrPerUnit: 88 },
  { code: 'EUR', symbol: '€', inrPerUnit: 102 },
  { code: 'GBP', symbol: '£', inrPerUnit: 117 },
  { code: 'AED', symbol: 'AED ', inrPerUnit: 24 },
  { code: 'SGD', symbol: 'S$', inrPerUnit: 68 },
  { code: 'THB', symbol: '฿', inrPerUnit: 2.7 },
  { code: 'JPY', symbol: '¥', inrPerUnit: 0.58 },
] as const;
export type CurrencyCode = (typeof CURRENCIES)[number]['code'];
