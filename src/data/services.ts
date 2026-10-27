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

/** Display currencies. INR per 1 unit: reference values, replaced by live ECB rates where available. */
export const CURRENCIES = [
  { code: 'INR', symbol: '₹', inrPerUnit: 1 },
  { code: 'USD', symbol: '$', inrPerUnit: 88 },
  { code: 'EUR', symbol: '€', inrPerUnit: 102 },
  { code: 'GBP', symbol: '£', inrPerUnit: 117 },
  { code: 'AED', symbol: 'AED ', inrPerUnit: 24 },
  { code: 'SAR', symbol: 'SAR ', inrPerUnit: 23.5 },
  { code: 'QAR', symbol: 'QAR ', inrPerUnit: 24.2 },
  { code: 'SGD', symbol: 'S$', inrPerUnit: 68 },
  { code: 'THB', symbol: '฿', inrPerUnit: 2.7 },
  { code: 'JPY', symbol: '¥', inrPerUnit: 0.58 },
  { code: 'AUD', symbol: 'A$', inrPerUnit: 58 },
  { code: 'CAD', symbol: 'C$', inrPerUnit: 64 },
  { code: 'NZD', symbol: 'NZ$', inrPerUnit: 53 },
  { code: 'CHF', symbol: 'CHF ', inrPerUnit: 110 },
  { code: 'CNY', symbol: 'CN¥', inrPerUnit: 12.3 },
  { code: 'HKD', symbol: 'HK$', inrPerUnit: 11.3 },
  { code: 'MYR', symbol: 'RM', inrPerUnit: 20.5 },
  { code: 'IDR', symbol: 'Rp', inrPerUnit: 0.0054 },
  { code: 'PHP', symbol: '₱', inrPerUnit: 1.52 },
  { code: 'KRW', symbol: '₩', inrPerUnit: 0.064 },
  { code: 'NPR', symbol: 'NPR ', inrPerUnit: 0.625 },
  { code: 'LKR', symbol: 'LKR ', inrPerUnit: 0.29 },
  { code: 'BDT', symbol: '৳', inrPerUnit: 0.72 },
  { code: 'ZAR', symbol: 'R', inrPerUnit: 4.9 },
  { code: 'SEK', symbol: 'kr ', inrPerUnit: 9.3 },
  { code: 'NOK', symbol: 'kr ', inrPerUnit: 8.7 },
  { code: 'DKK', symbol: 'kr ', inrPerUnit: 13.7 },
  { code: 'PLN', symbol: 'zł ', inrPerUnit: 24 },
  { code: 'TRY', symbol: '₺', inrPerUnit: 2.2 },
  { code: 'ILS', symbol: '₪', inrPerUnit: 24 },
  { code: 'BRL', symbol: 'R$', inrPerUnit: 16 },
  { code: 'MXN', symbol: 'MX$', inrPerUnit: 4.8 },
] as const;
export type CurrencyCode = (typeof CURRENCIES)[number]['code'];

/** Visitor countries: prices across the site are shown in the selected country's currency. */
export const COUNTRIES: { code: string; name: string; currency: CurrencyCode }[] = [
  { code: 'IN', name: 'India', currency: 'INR' }, { code: 'US', name: 'United States', currency: 'USD' },
  { code: 'GB', name: 'United Kingdom', currency: 'GBP' }, { code: 'AE', name: 'United Arab Emirates', currency: 'AED' },
  { code: 'SA', name: 'Saudi Arabia', currency: 'SAR' }, { code: 'QA', name: 'Qatar', currency: 'QAR' },
  { code: 'SG', name: 'Singapore', currency: 'SGD' }, { code: 'TH', name: 'Thailand', currency: 'THB' },
  { code: 'JP', name: 'Japan', currency: 'JPY' }, { code: 'AU', name: 'Australia', currency: 'AUD' },
  { code: 'CA', name: 'Canada', currency: 'CAD' }, { code: 'NZ', name: 'New Zealand', currency: 'NZD' },
  { code: 'DE', name: 'Germany', currency: 'EUR' }, { code: 'FR', name: 'France', currency: 'EUR' },
  { code: 'IT', name: 'Italy', currency: 'EUR' }, { code: 'ES', name: 'Spain', currency: 'EUR' },
  { code: 'NL', name: 'Netherlands', currency: 'EUR' }, { code: 'IE', name: 'Ireland', currency: 'EUR' },
  { code: 'PT', name: 'Portugal', currency: 'EUR' }, { code: 'AT', name: 'Austria', currency: 'EUR' },
  { code: 'BE', name: 'Belgium', currency: 'EUR' }, { code: 'GR', name: 'Greece', currency: 'EUR' },
  { code: 'FI', name: 'Finland', currency: 'EUR' }, { code: 'CH', name: 'Switzerland', currency: 'CHF' },
  { code: 'SE', name: 'Sweden', currency: 'SEK' }, { code: 'NO', name: 'Norway', currency: 'NOK' },
  { code: 'DK', name: 'Denmark', currency: 'DKK' }, { code: 'PL', name: 'Poland', currency: 'PLN' },
  { code: 'CN', name: 'China', currency: 'CNY' }, { code: 'HK', name: 'Hong Kong', currency: 'HKD' },
  { code: 'MY', name: 'Malaysia', currency: 'MYR' }, { code: 'ID', name: 'Indonesia', currency: 'IDR' },
  { code: 'PH', name: 'Philippines', currency: 'PHP' }, { code: 'KR', name: 'South Korea', currency: 'KRW' },
  { code: 'NP', name: 'Nepal', currency: 'NPR' }, { code: 'LK', name: 'Sri Lanka', currency: 'LKR' },
  { code: 'BD', name: 'Bangladesh', currency: 'BDT' }, { code: 'ZA', name: 'South Africa', currency: 'ZAR' },
  { code: 'TR', name: 'Türkiye', currency: 'TRY' }, { code: 'IL', name: 'Israel', currency: 'ILS' },
  { code: 'BR', name: 'Brazil', currency: 'BRL' }, { code: 'MX', name: 'Mexico', currency: 'MXN' },
];
export const flagOf = (cc: string) => String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));

const TZ_COUNTRY: Record<string, string> = {
  'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN', 'Asia/Dubai': 'AE', 'Asia/Riyadh': 'SA', 'Asia/Qatar': 'QA', 'Asia/Singapore': 'SG',
  'Asia/Bangkok': 'TH', 'Asia/Tokyo': 'JP', 'Asia/Shanghai': 'CN', 'Asia/Hong_Kong': 'HK', 'Asia/Kuala_Lumpur': 'MY',
  'Asia/Jakarta': 'ID', 'Asia/Manila': 'PH', 'Asia/Seoul': 'KR', 'Asia/Kathmandu': 'NP', 'Asia/Colombo': 'LK', 'Asia/Dhaka': 'BD',
  'Europe/London': 'GB', 'Europe/Dublin': 'IE', 'Europe/Paris': 'FR', 'Europe/Berlin': 'DE', 'Europe/Rome': 'IT', 'Europe/Madrid': 'ES',
  'Europe/Amsterdam': 'NL', 'Europe/Lisbon': 'PT', 'Europe/Vienna': 'AT', 'Europe/Brussels': 'BE', 'Europe/Athens': 'GR',
  'Europe/Helsinki': 'FI', 'Europe/Zurich': 'CH', 'Europe/Stockholm': 'SE', 'Europe/Oslo': 'NO', 'Europe/Copenhagen': 'DK',
  'Europe/Warsaw': 'PL', 'Europe/Istanbul': 'TR', 'Asia/Jerusalem': 'IL', 'Africa/Johannesburg': 'ZA', 'America/Sao_Paulo': 'BR',
  'America/Mexico_City': 'MX', 'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'Pacific/Auckland': 'NZ',
};
/** Best guess of the visitor's country from the device's time zone, then its language region. */
export function detectCountry(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (TZ_COUNTRY[tz]) return TZ_COUNTRY[tz];
    if (tz.startsWith('Australia/')) return 'AU';
    if (tz.startsWith('America/')) return 'US';
  } catch { /* fall through */ }
  for (const l of navigator.languages ?? [navigator.language]) {
    const region = l.split('-')[1]?.toUpperCase();
    if (region && COUNTRIES.some((c) => c.code === region)) return region;
  }
  return 'IN';
}
