import { create } from 'zustand';
import { CURRENCIES, type CurrencyCode } from '../data/services';
import { generateItinerary } from './itinerary';
import { defaultConfig, uid, type DayPlan, type Trip, type TripConfig } from './trip';

/** Safe localStorage wrapper — every read/write is guarded. */
export const storage = {
  get<T>(key: string, fallback: T): T {
    try {
      const v = localStorage.getItem(key);
      return v ? (JSON.parse(v) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
};

export const ATMOSPHERES = [
  { id: 'daybreak', label: 'Daybreak', accent: '#f4c56a', sky: ['#f6c9a8', '#9cc4e4'] },
  { id: 'daylight', label: 'Daylight', accent: '#9fe0b8', sky: ['#cfe8ff', '#6fa8dc'] },
  { id: 'golden', label: 'Golden hour', accent: '#ffc978', sky: ['#ffcf8f', '#e77f62'] },
  { id: 'twilight', label: 'Twilight', accent: '#c9b6ff', sky: ['#5b4b8a', '#1d2546'] },
  { id: 'moonlight', label: 'Moonlight', accent: '#9fd2ff', sky: ['#18233d', '#070b16'] },
] as const;

export interface Prefs {
  theme: 'dark' | 'light';
  motionPaused: boolean;
  reducedMotion: boolean; // user override (system preference is also honoured)
  lightweight: boolean;
  atmosphere: number;
  audioEnabled: boolean;
  musicEnabled: boolean;
  volume: number;
  currency: CurrencyCode;
  fx: Record<string, number>; // INR per unit, editable
}

const systemReduced = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

const defaultPrefs: Prefs = {
  theme: 'dark',
  motionPaused: false,
  reducedMotion: false,
  lightweight: false,
  atmosphere: 1,
  audioEnabled: false,
  musicEnabled: true,
  volume: 0.5,
  currency: 'INR',
  fx: Object.fromEntries(CURRENCIES.map((c) => [c.code, c.inrPerUnit])),
};

interface Draft {
  config: TripConfig;
  days: DayPlan[];
  warnings: string[];
  tripId?: string;
  name: string;
}

interface State {
  prefs: Prefs;
  systemReducedMotion: boolean;
  webglFailed: boolean;
  trips: Trip[];
  passport: { id: string; at: string }[];
  draft: Draft;
  toast: string | null;
  fxLive: { date: string; source: string } | null;
  setPrefs: (p: Partial<Prefs>) => void;
  setWebglFailed: () => void;
  cycleAtmosphere: () => void;
  setConfig: (patch: Partial<TripConfig>, opts?: { regenerate?: boolean }) => void;
  startPlan: (patch: Partial<TripConfig>, name?: string) => void;
  regenerate: () => void;
  setDays: (days: DayPlan[]) => void;
  saveDraft: (name?: string) => Trip;
  loadTrip: (id: string) => void;
  deleteTrip: (id: string) => void;
  renameTrip: (id: string, name: string) => void;
  stamp: (destId: string) => void;
  unstamp: (destId: string) => void;
  notify: (msg: string | null) => void;
}

const loadedPrefs = { ...defaultPrefs, ...storage.get<Partial<Prefs>>('tg.prefs', {}) };
// Audio always starts silent: the remembered preference only offers a quick resume.
const initialPrefs: Prefs = { ...loadedPrefs, audioEnabled: false };
const rememberedAudio = loadedPrefs.audioEnabled;

function buildDraft(config: TripConfig, name?: string, tripId?: string): Draft {
  const g = generateItinerary(config);
  return { config, days: g.days, warnings: g.warnings, name: name ?? defaultTripName(config), tripId };
}

export function defaultTripName(c: TripConfig) {
  return `Travel Guide plan · ${c.destIds.map((d) => d.replace(/-/g, ' ')).map((s) => s[0].toUpperCase() + s.slice(1)).join(' + ')}`;
}

const storedDraft = storage.get<Draft | null>('tg.draft', null);
const safeDraft = (() => {
  try {
    if (storedDraft?.config && storedDraft.days?.length) return storedDraft;
  } catch {
    /* ignore */
  }
  return buildDraft(defaultConfig());
})();

export const useStore = create<State>((set, get) => ({
  prefs: initialPrefs,
  systemReducedMotion: systemReduced(),
  webglFailed: false,
  trips: storage.get<Trip[]>('tg.trips', []),
  passport: storage.get<{ id: string; at: string }[]>('tg.passport', []),
  draft: safeDraft,
  toast: null,
  fxLive: null,
  setPrefs: (p) => {
    const prefs = { ...get().prefs, ...p };
    storage.set('tg.prefs', prefs);
    set({ prefs });
  },
  setWebglFailed: () => set({ webglFailed: true }),
  cycleAtmosphere: () => get().setPrefs({ atmosphere: (get().prefs.atmosphere + 1) % ATMOSPHERES.length }),
  setConfig: (patch, opts = { regenerate: true }) => {
    const d = get().draft;
    const config = { ...d.config, ...patch };
    let next: Draft;
    if (opts.regenerate) {
      const locked = d.days.flatMap((x) => x.items).filter((i) => i.locked);
      const g = generateItinerary(config, locked);
      next = { ...d, config, days: g.days, warnings: g.warnings };
    } else next = { ...d, config };
    storage.set('tg.draft', next);
    set({ draft: next });
  },
  startPlan: (patch, name) => {
    const base = defaultConfig({ currency: get().prefs.currency });
    const next = buildDraft({ ...base, ...patch }, name);
    storage.set('tg.draft', next);
    set({ draft: next });
  },
  regenerate: () => get().setConfig({}, { regenerate: true }),
  setDays: (days) => {
    const next = { ...get().draft, days };
    storage.set('tg.draft', next);
    set({ draft: next });
  },
  saveDraft: (name) => {
    const d = get().draft;
    const now = new Date().toISOString();
    const existing = d.tripId ? get().trips.find((t) => t.id === d.tripId) : undefined;
    const trip: Trip = {
      id: existing?.id ?? uid(), name: name ?? d.name, createdAt: existing?.createdAt ?? now, updatedAt: now, config: d.config, days: d.days,
    };
    const trips = existing ? get().trips.map((t) => (t.id === trip.id ? trip : t)) : [trip, ...get().trips];
    const ok = storage.set('tg.trips', trips);
    const draft = { ...d, tripId: trip.id, name: trip.name };
    storage.set('tg.draft', draft);
    set({ trips, draft, toast: ok ? `Saved “${trip.name}” on this device.` : 'Could not save — browser storage is unavailable.' });
    return trip;
  },
  loadTrip: (id) => {
    const t = get().trips.find((x) => x.id === id);
    if (!t) return;
    const draft: Draft = { config: t.config, days: t.days, warnings: [], tripId: t.id, name: t.name };
    storage.set('tg.draft', draft);
    set({ draft });
  },
  deleteTrip: (id) => {
    const trips = get().trips.filter((t) => t.id !== id);
    storage.set('tg.trips', trips);
    set({ trips });
  },
  renameTrip: (id, name) => {
    const trips = get().trips.map((t) => (t.id === id ? { ...t, name } : t));
    storage.set('tg.trips', trips);
    set({ trips });
  },
  stamp: (destId) => {
    if (get().passport.some((p) => p.id === destId)) return;
    const passport = [...get().passport, { id: destId, at: new Date().toISOString() }];
    storage.set('tg.passport', passport);
    set({ passport, toast: 'Stamp added to your Destination Passport.' });
  },
  unstamp: (destId) => {
    const passport = get().passport.filter((p) => p.id !== destId);
    storage.set('tg.passport', passport);
    set({ passport });
  },
  notify: (toast) => {
    set({ toast });
  },
}));

export const audioWasEnabled = () => rememberedAudio;

/** Effective motion flags. */
export function useMotion() {
  const prefs = useStore((s) => s.prefs);
  const sys = useStore((s) => s.systemReducedMotion);
  const reduced = prefs.reducedMotion || sys;
  return { reduced, paused: prefs.motionPaused || reduced, lightweight: prefs.lightweight };
}

export function useMoney() {
  const { currency, fx } = useStore((s) => s.prefs);
  return (inr: number, opts: { compact?: boolean } = {}) => formatMoney(inr, currency, fx, opts);
}

export function formatMoney(inr: number, currency: CurrencyCode, fx: Record<string, number>, opts: { compact?: boolean } = {}) {
  const rate = fx[currency] || 1;
  const v = inr / rate;
  const info = CURRENCIES.find((c) => c.code === currency)!;
  const digits = currency === 'INR' || currency === 'JPY' || currency === 'THB' ? 0 : 0;
  const n = opts.compact && v >= 100000
    ? new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en', { notation: 'compact', maximumFractionDigits: 1 }).format(v)
    : new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en', { maximumFractionDigits: digits }).format(Math.round(v));
  return `${info.symbol}${n}`;
}
