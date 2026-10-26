/** Time helpers. Minutes are minutes after local midnight. */

export function tzOffsetMin(tz: string, dateISO: string): number {
  const d = new Date(`${dateISO}T12:00:00Z`);
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(d);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const asUTC = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
    return Math.round((asUTC - d.getTime()) / 60000);
  } catch {
    return 330;
  }
}

export function tzAbbrev(tz: string, dateISO: string) {
  const name = (locale: string) => {
    try {
      const p = new Intl.DateTimeFormat(locale, { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date(`${dateISO}T12:00:00Z`));
      return p.find((x) => x.type === 'timeZoneName')?.value;
    } catch {
      return undefined;
    }
  };
  if (tz === 'Asia/Kolkata') return 'IST';
  const n = name('en-US') ?? tz;
  return n;
}

export const pad = (n: number) => String(n).padStart(2, '0');

export function fmtTime(min: number) {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function fmtDur(min: number) {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r} min`;
  return r ? `${h} h ${r} min` : `${h} h`;
}

export function addDaysISO(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function fmtDate(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' });
}

export const monthOf = (iso: string) => Number(iso.slice(5, 7));

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Approximate local sunrise/sunset (minutes) using a simple solar model.
 * Good to roughly ±10 minutes — used only for planning hints, labelled approximate.
 */
export function approxSun(lat: number, lon: number, dateISO: string, tzOffset: number) {
  const d = new Date(`${dateISO}T00:00:00Z`);
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  const N = Math.floor((d.getTime() - start) / 86400000);
  const decl = (23.44 * Math.PI) / 180 * Math.sin(((2 * Math.PI) / 365) * (284 + N));
  const phi = (lat * Math.PI) / 180;
  const cosW = (Math.sin((-0.83 * Math.PI) / 180) - Math.sin(phi) * Math.sin(decl)) / (Math.cos(phi) * Math.cos(decl));
  const w = Math.acos(Math.min(1, Math.max(-1, cosW)));
  const halfDay = ((w * 180) / Math.PI / 15) * 60;
  const B = ((2 * Math.PI) / 364) * (N - 81);
  const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
  const solarNoon = 720 - 4 * lon - eot + tzOffset;
  return { sunrise: solarNoon - halfDay, sunset: solarNoon + halfDay };
}
