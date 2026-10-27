import { useEffect, useState } from 'react';
import { storage } from './store';

/**
 * Live data:
 * - Exchange rates: European Central Bank reference rates via Frankfurter (no key).
 *   AED uses its official USD peg (3.6725 AED per USD).
 * - Weather: Open-Meteo current conditions + 16-day forecast (no key).
 * - Flights: /api/flights serverless function (Amadeus or Duffel) when API keys are configured.
 */

export interface FxLive { inrPerUnit: Record<string, number>; date: string; source: string; fetchedAt: number }

export async function fetchLiveFx(): Promise<FxLive | null> {
  const cached = storage.get<FxLive | null>('tg.fxLive2', null);
  if (cached && Date.now() - cached.fetchedAt < 6 * 3600_000) return cached;
  try {
    const r = await fetch('https://api.frankfurter.dev/v1/latest?base=INR&symbols=USD,EUR,GBP,SGD,THB,JPY,AUD,CAD,NZD,CHF,CNY,HKD,MYR,IDR,PHP,KRW,ZAR,SEK,NOK,DKK,PLN,TRY,ILS,BRL,MXN');
    if (!r.ok) throw new Error(String(r.status));
    const j = await r.json();
    const inrPerUnit: Record<string, number> = { INR: 1 };
    Object.entries(j.rates as Record<string, number>).forEach(([k, v]) => (inrPerUnit[k] = +(1 / v).toFixed(4)));
    // Currencies pegged to the US dollar or the rupee (not published by the ECB).
    if (inrPerUnit.USD) { inrPerUnit.AED = +(inrPerUnit.USD / 3.6725).toFixed(4); inrPerUnit.SAR = +(inrPerUnit.USD / 3.75).toFixed(4); inrPerUnit.QAR = +(inrPerUnit.USD / 3.64).toFixed(4); }
    inrPerUnit.NPR = 0.625; // 1.6 NPR = 1 INR (fixed peg)
    const live = { inrPerUnit, date: j.date, source: 'European Central Bank via Frankfurter', fetchedAt: Date.now() };
    storage.set('tg.fxLive2', live);
    return live;
  } catch {
    return cached;
  }
}

const WMO: Record<number, [string, string]> = {
  0: ['☀️', 'Clear'], 1: ['🌤', 'Mostly clear'], 2: ['⛅', 'Partly cloudy'], 3: ['☁️', 'Overcast'], 45: ['🌁', 'Fog'], 48: ['🌁', 'Fog'],
  51: ['🌦', 'Light drizzle'], 53: ['🌦', 'Drizzle'], 55: ['🌧', 'Heavy drizzle'], 61: ['🌦', 'Light rain'], 63: ['🌧', 'Rain'], 65: ['🌧', 'Heavy rain'],
  71: ['🌨', 'Light snow'], 73: ['🌨', 'Snow'], 75: ['❄️', 'Heavy snow'], 80: ['🌦', 'Showers'], 81: ['🌧', 'Showers'], 82: ['⛈', 'Violent showers'],
  95: ['⛈', 'Thunderstorm'], 96: ['⛈', 'Thunderstorm, hail'], 99: ['⛈', 'Thunderstorm, hail'],
};
export const weatherLabel = (code: number) => WMO[code] ?? ['🌡', 'Weather'];

export interface Weather {
  status: 'loading' | 'ready' | 'error';
  current?: { temp: number; code: number; time: string };
  daily: { date: string; max: number; min: number; rain: number; code: number }[];
}

const wcache = new Map<string, Promise<Weather>>();
export function useWeather(lat: number, lon: number): Weather {
  const [w, setW] = useState<Weather>({ status: 'loading', daily: [] });
  useEffect(() => {
    const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
    if (!wcache.has(key)) {
      wcache.set(key, fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&timezone=auto&forecast_days=16`)
        .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
        .then((j): Weather => ({
          status: 'ready',
          current: { temp: j.current.temperature_2m, code: j.current.weather_code, time: j.current.time },
          daily: j.daily.time.map((t: string, i: number) => ({ date: t, max: j.daily.temperature_2m_max[i], min: j.daily.temperature_2m_min[i], rain: j.daily.precipitation_probability_max[i] ?? 0, code: j.daily.weather_code[i] })),
        }))
        .catch((): Weather => ({ status: 'error', daily: [] })));
    }
    let alive = true;
    wcache.get(key)!.then((x) => alive && setW(x));
    return () => { alive = false; };
  }, [lat, lon]);
  return w;
}

export interface LiveOffer { carrier: string; price: number; currency: string; stops: number; duration: string; departs: string; arrives: string; cabin: string }
export interface LiveFlights { status: 'idle' | 'loading' | 'ready' | 'unconfigured' | 'error'; offers: LiveOffer[]; provider?: string; message?: string }

/** Calls the site's own serverless endpoint (keys never reach the browser). */
export function useLiveFlights(q: { from?: string; to?: string; date: string; ret?: string; adults: number; children: number; cabin: string } | null): LiveFlights {
  const [s, setS] = useState<LiveFlights>({ status: 'idle', offers: [] });
  const key = q ? JSON.stringify(q) : '';
  useEffect(() => {
    if (!q || !q.from || !q.to) return;
    let alive = true;
    setS({ status: 'loading', offers: [] });
    const p = new URLSearchParams({ from: q.from, to: q.to, date: q.date, adults: String(q.adults), children: String(q.children), cabin: q.cabin });
    if (q.ret) p.set('ret', q.ret);
    fetch(`${import.meta.env.BASE_URL}api/flights?${p}`)
      .then(async (r) => {
        const ct = r.headers.get('content-type') ?? '';
        if (!ct.includes('json')) return { status: 'unconfigured', offers: [] } as LiveFlights;
        const j = await r.json();
        if (r.status === 501) return { status: 'unconfigured', offers: [], message: j.message } as LiveFlights;
        if (!r.ok) return { status: 'error', offers: [], message: j.message } as LiveFlights;
        return { status: 'ready', offers: j.offers, provider: j.provider } as LiveFlights;
      })
      .catch(() => ({ status: 'unconfigured', offers: [] } as LiveFlights))
      .then((x) => alive && setS(x));
    return () => { alive = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return s;
}
